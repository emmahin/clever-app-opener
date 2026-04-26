import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { corsHeaders } from "@supabase/supabase-js/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY") ?? "";

function isHomeLocation(loc: string | null | undefined): boolean {
  if (!loc) return true;
  const l = loc.toLowerCase().trim();
  return ["maison", "home", "chez moi", "house", "à la maison"].some((k) => l.includes(k));
}

function detectKind(title: string): "exam" | "call" | "default" {
  const t = title.toLowerCase();
  if (/(examen|contrôle|controle|interro|entretien|rdv médical|rendez-vous médical|oral)/.test(t)) return "exam";
  if (/(appel|call|visio|téléphone|telephone|zoom|meet)/.test(t)) return "call";
  return "default";
}

function leadMinutes(event: any): number {
  const kind = detectKind(event.title ?? "");
  if (kind === "exam") return 45;
  if (kind === "call") return 5;
  if (!isHomeLocation(event.location)) return 30;
  return 15;
}

function inQuietHours(prefs: any, now: Date): boolean {
  if (!prefs?.quiet_enabled) return false;
  const h = now.getHours();
  const start = prefs.quiet_start ?? 22;
  const end = prefs.quiet_end ?? 8;
  if (start === end) return false;
  if (start < end) return h >= start && h < end;
  return h >= start || h < end;
}

async function pushTo(admin: any, userId: string, title: string, body: string, url = "/notifications") {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/push-send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({ user_id: userId, title, body, url }),
  });
  if (!res.ok) console.error("push-send failed", await res.text());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date();
  const horizonMs = 4 * 60 * 60 * 1000;

  // 1. Récupère les users avec au moins une push sub
  const { data: subs } = await admin.from("push_subscriptions").select("user_id");
  const userIds = Array.from(new Set((subs ?? []).map((s: any) => s.user_id)));

  let totalReminders = 0;
  let totalSuggestions = 0;

  for (const userId of userIds) {
    // settings
    const { data: settings } = await admin
      .from("user_settings")
      .select("proactive_prefs, proactive_last_run_at, ai_name, language")
      .eq("user_id", userId)
      .maybeSingle();

    const prefs = (settings?.proactive_prefs as any) ?? {};
    if (inQuietHours(prefs, now)) continue;

    const aiName = settings?.ai_name ?? "Nex";
    const remindersOn = prefs.agenda_reminders !== false;
    const suggestionsOn = prefs.ai_suggestions !== false;

    // ---- 1) Agenda reminders
    if (remindersOn) {
      const { data: events } = await admin
        .from("schedule_events")
        .select("id, title, location, start_iso")
        .eq("user_id", userId)
        .gte("start_iso", now.toISOString())
        .lte("start_iso", new Date(now.getTime() + horizonMs).toISOString());

      for (const ev of events ?? []) {
        const startMs = new Date(ev.start_iso).getTime();
        const lead = leadMinutes(ev);
        const triggerAt = startMs - lead * 60_000;
        if (now.getTime() < triggerAt) continue;
        if (now.getTime() > startMs) continue; // event déjà commencé

        // anti-doublon
        const { data: already } = await admin
          .from("event_notifications")
          .select("id")
          .eq("event_id", ev.id)
          .eq("kind", "reminder")
          .maybeSingle();
        if (already) continue;

        const minsLeft = Math.max(1, Math.round((startMs - now.getTime()) / 60_000));
        const locPart = ev.location && !isHomeLocation(ev.location) ? ` — ${ev.location}` : "";
        await pushTo(
          admin,
          userId,
          `⏰ ${ev.title} dans ${minsLeft} min`,
          `Rappel${locPart}`,
          "/agenda",
        );
        await admin.from("event_notifications").insert({
          user_id: userId,
          event_id: ev.id,
          kind: "reminder",
        });
        totalReminders++;
      }
    }

    // ---- 2) Suggestion IA (au plus 1 toutes les 4h)
    if (suggestionsOn && LOVABLE_API_KEY) {
      const last = settings?.proactive_last_run_at ? new Date(settings.proactive_last_run_at).getTime() : 0;
      if (now.getTime() - last < 4 * 60 * 60 * 1000) continue;

      const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const dayAhead = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

      const [memsRes, evsRes] = await Promise.all([
        admin.from("user_memories").select("content, category, importance").eq("user_id", userId).order("importance", { ascending: false }).limit(5),
        admin.from("schedule_events").select("title, start_iso, location").eq("user_id", userId).gte("start_iso", dayAgo).lte("start_iso", dayAhead).order("start_iso").limit(15),
      ]);

      const ctx = {
        now: now.toISOString(),
        memories: memsRes.data ?? [],
        events: evsRes.data ?? [],
      };

      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              {
                role: "system",
                content: `Tu es ${aiName}, assistant proactif. À partir du contexte (mémoires + agenda 24h), propose AU PLUS UNE suggestion utile, courte, concrète et bienveillante (rappel, conseil, anticipation). Si rien d'utile, réponds {"none":true}. Format JSON STRICT: {"none":true} OU {"title":"...","body":"..."}. Max 80 caractères pour title, 140 pour body. Réponds en français.`,
              },
              { role: "user", content: JSON.stringify(ctx) },
            ],
            response_format: { type: "json_object" },
          }),
        });

        if (aiRes.ok) {
          const j = await aiRes.json();
          const content = j.choices?.[0]?.message?.content ?? "{}";
          const parsed = JSON.parse(content);
          if (!parsed.none && parsed.title) {
            await pushTo(admin, userId, `💡 ${parsed.title}`, parsed.body ?? "", "/notifications");
            totalSuggestions++;
          }
          await admin
            .from("user_settings")
            .update({ proactive_last_run_at: now.toISOString() })
            .eq("user_id", userId);
        } else {
          console.error("AI gateway", aiRes.status, await aiRes.text());
        }
      } catch (e) {
        console.error("suggestion error", e);
      }
    }
  }

  return new Response(
    JSON.stringify({ ok: true, users: userIds.length, reminders: totalReminders, suggestions: totalSuggestions }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});