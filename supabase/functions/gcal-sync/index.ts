/**
 * gcal-sync — synchronisation bidirectionnelle.
 * Actions :
 *  - status : indique si le user est connecté + email Google
 *  - disconnect : supprime les tokens locaux
 *  - push : envoie un event local (id) vers Google Calendar
 *  - pull : importe les events Google des 60 prochains jours dans la DB
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";
import {
  getValidAccessToken,
  gcalFetch,
  toGoogleEventBody,
} from "../_shared/google-calendar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !ANON || !SERVICE_ROLE) return json({ error: "config" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "no_auth" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "not_authenticated" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as string;

    // ───── status ─────
    if (action === "status") {
      const { data } = await admin
        .from("google_oauth_tokens")
        .select("google_email, scope, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      return json({ connected: !!data, ...data });
    }

    // ───── disconnect ─────
    if (action === "disconnect") {
      await admin.from("google_oauth_tokens").delete().eq("user_id", user.id);
      return json({ ok: true });
    }

    // Toutes les actions suivantes nécessitent une connexion active
    let accessToken: string;
    try {
      const r = await getValidAccessToken(admin, user.id);
      accessToken = r.token;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      if (msg === "not_connected") return json({ error: "not_connected" }, 400);
      return json({ error: msg }, 500);
    }

    // ───── push : envoie un event local vers Google ─────
    if (action === "push") {
      const eventId = body?.event_id as string;
      if (!eventId) return json({ error: "missing event_id" }, 400);

      const { data: ev, error: evErr } = await admin
        .from("schedule_events")
        .select("*")
        .eq("id", eventId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (evErr || !ev) return json({ error: "event_not_found" }, 404);

      const eventBody = toGoogleEventBody({
        title: ev.title,
        start_iso: ev.start_iso,
        end_iso: ev.end_iso,
        location: ev.location,
        notes: ev.notes,
      });

      let resp: Response;
      if (ev.google_event_id) {
        // update
        resp = await gcalFetch(accessToken, `/calendars/primary/events/${ev.google_event_id}`, {
          method: "PATCH",
          body: JSON.stringify(eventBody),
        });
      } else {
        // insert
        resp = await gcalFetch(accessToken, `/calendars/primary/events`, {
          method: "POST",
          body: JSON.stringify(eventBody),
        });
      }

      if (!resp.ok) {
        const t = await resp.text();
        return json({ error: `gcal_${resp.status}`, detail: t }, 502);
      }

      const created = await resp.json();
      const gid = created.id as string;

      await admin
        .from("schedule_events")
        .update({ google_event_id: gid, external_provider: "google_calendar", external_id: gid })
        .eq("id", eventId);

      return json({ ok: true, google_event_id: gid });
    }

    // ───── pull : importe les events Google ─────
    if (action === "pull") {
      const timeMin = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const timeMax = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();

      const params = new URLSearchParams({
        timeMin,
        timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });

      const resp = await gcalFetch(accessToken, `/calendars/primary/events?${params}`);
      if (!resp.ok) {
        const t = await resp.text();
        return json({ error: `gcal_${resp.status}`, detail: t }, 502);
      }
      const data = await resp.json();
      const items = (data.items ?? []) as any[];

      let imported = 0;
      let updated = 0;
      for (const it of items) {
        if (!it.start?.dateTime && !it.start?.date) continue;
        const start_iso = it.start.dateTime ?? new Date(it.start.date).toISOString();
        const end_iso = it.end?.dateTime ?? (it.end?.date ? new Date(it.end.date).toISOString() : null);

        // Existe déjà ?
        const { data: existing } = await admin
          .from("schedule_events")
          .select("id")
          .eq("user_id", user.id)
          .eq("google_event_id", it.id)
          .maybeSingle();

        if (existing) {
          await admin.from("schedule_events").update({
            title: it.summary ?? "(sans titre)",
            start_iso, end_iso,
            location: it.location ?? null,
            notes: it.description ?? null,
          }).eq("id", existing.id);
          updated++;
        } else {
          await admin.from("schedule_events").insert({
            user_id: user.id,
            title: it.summary ?? "(sans titre)",
            start_iso, end_iso,
            location: it.location ?? null,
            notes: it.description ?? null,
            source: "google_calendar",
            google_event_id: it.id,
            external_provider: "google_calendar",
            external_id: it.id,
          });
          imported++;
        }
      }

      return json({ ok: true, imported, updated, total: items.length });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    console.error("gcal-sync error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});