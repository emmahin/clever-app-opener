import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ParsedEvent {
  uid: string;
  summary: string;
  start: string; // ISO
  end?: string; // ISO
  location?: string;
  description?: string;
}

/** Décode les valeurs iCal échappées (\n, \,, \;, \\) */
function unescape(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/** Convertit DTSTART/DTEND iCal → ISO 8601. Gère YYYYMMDDTHHMMSSZ, YYYYMMDDTHHMMSS et YYYYMMDD. */
function icsDateToIso(value: string, tzid?: string): string | null {
  const v = value.trim();
  // Date entière (ex 20251015)
  if (/^\d{8}$/.test(v)) {
    return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}T00:00:00.000Z`;
  }
  // Avec heure
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (z === "Z") {
    return `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
  }
  // Heure locale (ou TZID donné). On la traite comme heure locale Europe/Paris
  // par défaut côté Pronote — on renvoie sans Z, l'app affichera dans le fuseau du navigateur.
  // Pour rester simple et robuste, on considère comme UTC si pas de Z (Pronote envoie souvent Z).
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
}

/** Parse un texte iCal en liste d'événements. Implémentation minimale mais robuste. */
function parseIcal(text: string): ParsedEvent[] {
  // Désplie les lignes longues (continuation = ligne commençant par espace/tab)
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  const events: ParsedEvent[] = [];
  let current: Partial<ParsedEvent> | null = null;

  for (const raw of lines) {
    if (!raw) continue;
    if (raw === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (raw === "END:VEVENT") {
      if (current?.uid && current.summary && current.start) {
        events.push(current as ParsedEvent);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    // Sépare PROPERTY[;PARAMS]:VALUE
    const colon = raw.indexOf(":");
    if (colon === -1) continue;
    const left = raw.slice(0, colon);
    const value = raw.slice(colon + 1);
    const [propRaw, ...paramParts] = left.split(";");
    const prop = propRaw.toUpperCase();
    const params = Object.fromEntries(
      paramParts.map((p) => {
        const [k, v] = p.split("=");
        return [k.toUpperCase(), v];
      }),
    );

    switch (prop) {
      case "UID":
        current.uid = value.trim();
        break;
      case "SUMMARY":
        current.summary = unescape(value);
        break;
      case "DESCRIPTION":
        current.description = unescape(value);
        break;
      case "LOCATION":
        current.location = unescape(value);
        break;
      case "DTSTART": {
        const iso = icsDateToIso(value, params.TZID);
        if (iso) current.start = iso;
        break;
      }
      case "DTEND": {
        const iso = icsDateToIso(value, params.TZID);
        if (iso) current.end = iso;
        break;
      }
    }
  }

  return events;
}

async function syncSubscription(
  admin: ReturnType<typeof createClient>,
  sub: {
    id: string;
    user_id: string;
    url: string;
    label: string;
    provider: string;
  },
): Promise<{ inserted: number; updated: number; total: number }> {
  const resp = await fetch(sub.url, {
    headers: { "User-Agent": "Mozilla/5.0 (Lovable iCal sync)" },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status} sur ${sub.url.slice(0, 80)}`);
  const text = await resp.text();
  if (!text.includes("BEGIN:VEVENT")) {
    throw new Error("Le contenu téléchargé n'est pas un fichier iCal valide.");
  }

  const events = parseIcal(text);

  // Ne garde que les events des 60 derniers jours → 180 prochains jours
  // (évite de remplir l'agenda avec un historique de 3 ans).
  const now = Date.now();
  const minMs = now - 60 * 24 * 3600 * 1000;
  const maxMs = now + 180 * 24 * 3600 * 1000;

  let inserted = 0;
  let updated = 0;

  for (const ev of events) {
    const t = Date.parse(ev.start);
    if (Number.isNaN(t)) continue;
    if (t < minMs || t > maxMs) continue;

    const row = {
      user_id: sub.user_id,
      title: ev.summary,
      start_iso: ev.start,
      end_iso: ev.end ?? null,
      location: ev.location ?? null,
      notes: ev.description ?? null,
      source: "ical",
      external_provider: sub.provider,
      external_uid: ev.uid,
      ical_subscription_id: sub.id,
    };

    // Upsert manuel sur (user_id, ical_subscription_id, external_uid)
    const { data: existing } = await admin
      .from("schedule_events")
      .select("id")
      .eq("user_id", sub.user_id)
      .eq("ical_subscription_id", sub.id)
      .eq("external_uid", ev.uid)
      .maybeSingle();

    if (existing) {
      await admin.from("schedule_events").update(row).eq("id", existing.id);
      updated++;
    } else {
      await admin.from("schedule_events").insert(row);
      inserted++;
    }
  }

  // Met à jour la souscription
  await admin
    .from("ical_subscriptions")
    .update({
      last_synced_at: new Date().toISOString(),
      last_error: null,
      events_count: events.length,
    })
    .eq("id", sub.id);

  return { inserted, updated, total: events.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const subscriptionId: string | undefined = body.subscription_id;
    const all: boolean = body.all === true;

    // Détermine quelles souscriptions traiter
    let query = admin
      .from("ical_subscriptions")
      .select("id, user_id, url, label, provider")
      .eq("is_active", true);

    if (subscriptionId) {
      query = query.eq("id", subscriptionId);
    } else if (!all) {
      // Mode utilisateur courant : on lit le JWT et on filtre par user_id
      const auth = req.headers.get("Authorization");
      if (!auth) {
        return new Response(JSON.stringify({ error: "missing_auth" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: auth } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) {
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      query = query.eq("user_id", u.user.id);
    }

    const { data: subs, error } = await query;
    if (error) throw error;

    const results: Array<{
      id: string;
      label: string;
      ok: boolean;
      inserted?: number;
      updated?: number;
      total?: number;
      error?: string;
    }> = [];

    for (const sub of subs ?? []) {
      try {
        const r = await syncSubscription(admin, sub as any);
        results.push({ id: sub.id, label: sub.label, ok: true, ...r });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        await admin
          .from("ical_subscriptions")
          .update({ last_error: msg, last_synced_at: new Date().toISOString() })
          .eq("id", sub.id);
        results.push({ id: sub.id, label: sub.label, ok: false, error: msg });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});