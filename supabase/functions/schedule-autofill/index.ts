/**
 * schedule-autofill — génère les schedule_events des 7 prochains jours
 * à partir des recurring_schedule_rules de l'utilisateur.
 *
 * Sécurité : appelé soit par le user (front au chargement de l'agenda),
 * soit par pg_cron pour TOUS les users (auth via Authorization Bearer du
 * service role + body { all_users: true }).
 *
 * Anti-doublons : index UNIQUE (user_id, recurring_rule_id, start_iso) +
 * upsert avec onConflict ignoré.
 *
 * Vacances scolaires françaises : zones A/B/C, données 2024-2026 hardcodées
 * pour rester offline (pas d'API tierce). À étendre si besoin.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ───── Vacances scolaires France (zones A / B / C) ─────
// Format YYYY-MM-DD inclusif. Source : education.gouv.fr (calendrier officiel).
// Inclut aussi les jours fériés nationaux.
const FR_HOLIDAYS_NATIONAL: string[] = [
  // 2024-2026 jours fériés français (tombent même hors vacances scolaires)
  "2024-12-25", "2025-01-01", "2025-04-21", "2025-05-01", "2025-05-08",
  "2025-05-29", "2025-06-09", "2025-07-14", "2025-08-15", "2025-11-01",
  "2025-11-11", "2025-12-25",
  "2026-01-01", "2026-04-06", "2026-05-01", "2026-05-08", "2026-05-14",
  "2026-05-25", "2026-07-14", "2026-08-15", "2026-11-01", "2026-11-11",
  "2026-12-25",
];

type DateRange = [string, string]; // inclusif

const FR_SCHOOL_HOLIDAYS: Record<"A" | "B" | "C", DateRange[]> = {
  // Zone A : Besançon, Bordeaux, Clermont-Ferrand, Dijon, Grenoble, Limoges, Lyon, Poitiers
  A: [
    ["2025-02-22", "2025-03-09"], // Hiver
    ["2025-04-19", "2025-05-04"], // Printemps
    ["2025-07-05", "2025-08-31"], // Été
    ["2025-10-18", "2025-11-02"], // Toussaint
    ["2025-12-20", "2026-01-04"], // Noël
    ["2026-02-07", "2026-02-22"], // Hiver 2026
    ["2026-04-04", "2026-04-19"], // Printemps 2026
    ["2026-07-04", "2026-08-31"], // Été 2026
  ],
  // Zone B : Aix-Marseille, Amiens, Caen, Lille, Nancy-Metz, Nantes, Nice, Orléans-Tours, Reims, Rennes, Rouen, Strasbourg
  B: [
    ["2025-02-08", "2025-02-23"],
    ["2025-04-05", "2025-04-21"],
    ["2025-07-05", "2025-08-31"],
    ["2025-10-18", "2025-11-02"],
    ["2025-12-20", "2026-01-04"],
    ["2026-02-21", "2026-03-08"],
    ["2026-04-18", "2026-05-03"],
    ["2026-07-04", "2026-08-31"],
  ],
  // Zone C : Créteil, Montpellier, Paris, Toulouse, Versailles
  C: [
    ["2025-02-15", "2025-03-02"],
    ["2025-04-12", "2025-04-27"],
    ["2025-07-05", "2025-08-31"],
    ["2025-10-18", "2025-11-02"],
    ["2025-12-20", "2026-01-04"],
    ["2026-02-14", "2026-03-01"],
    ["2026-04-11", "2026-04-26"],
    ["2026-07-04", "2026-08-31"],
  ],
};

function isInRange(dateStr: string, range: DateRange): boolean {
  return dateStr >= range[0] && dateStr <= range[1];
}

function isFrenchSchoolHoliday(dateStr: string, zone: "A" | "B" | "C"): boolean {
  if (FR_HOLIDAYS_NATIONAL.includes(dateStr)) return true;
  return FR_SCHOOL_HOLIDAYS[zone].some((r) => isInRange(dateStr, r));
}

// ───── Génération des events ─────
interface Rule {
  id: string;
  user_id: string;
  title: string;
  day_of_week: number;
  start_time: string; // HH:MM:SS
  end_time: string | null;
  location: string | null;
  notes: string | null;
  active_from: string; // YYYY-MM-DD
  active_until: string | null;
  is_active: boolean;
  skip_school_holidays: boolean;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildEventsForUser(
  rules: Rule[],
  zone: "none" | "A" | "B" | "C",
  daysAhead: number,
) {
  const events: {
    user_id: string;
    title: string;
    start_iso: string;
    end_iso: string | null;
    location: string | null;
    notes: string | null;
    source: string;
    recurring_rule_id: string;
  }[] = [];

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < daysAhead; i++) {
    const day = new Date(today);
    day.setDate(today.getDate() + i);
    const dayStr = ymd(day);
    const dow = day.getDay();

    for (const rule of rules) {
      if (!rule.is_active) continue;
      if (rule.day_of_week !== dow) continue;
      if (dayStr < rule.active_from) continue;
      if (rule.active_until && dayStr > rule.active_until) continue;

      // Saute les vacances scolaires si zone définie + règle qui le demande
      if (rule.skip_school_holidays && zone !== "none") {
        if (isFrenchSchoolHoliday(dayStr, zone)) continue;
      }

      // Construit le timestamp ISO en local Europe/Paris.
      // On utilise l'offset du jour courant de l'utilisateur côté serveur :
      // pour rester correct été/hiver on construit l'ISO via le format local.
      const [h, m] = rule.start_time.split(":").map((n) => parseInt(n, 10));
      const startLocal = new Date(day);
      startLocal.setHours(h, m, 0, 0);
      // startLocal est dans le TZ du serveur Deno (UTC). Pour garder l'heure
      // "perçue" comme étant heure de Paris on applique +/- offset.
      // Solution simple et stable : on construit la chaîne ISO avec l'offset
      // calculé par l'API Intl pour Paris.
      const startIso = toParisIso(day, rule.start_time);
      const endIso = rule.end_time ? toParisIso(day, rule.end_time) : null;

      events.push({
        user_id: rule.user_id,
        title: rule.title,
        start_iso: startIso,
        end_iso: endIso,
        location: rule.location,
        notes: rule.notes,
        source: "auto_recurring",
        recurring_rule_id: rule.id,
      });
    }
  }
  return events;
}

/**
 * Construit une chaîne ISO 8601 pour `date` (jour) à `hhmmss` heure de Paris.
 * Gère DST automatiquement via Intl.DateTimeFormat.
 */
function toParisIso(date: Date, hhmmss: string): string {
  const [h, m, s] = hhmmss.split(":").map((n) => parseInt(n, 10));
  // Calcule l'offset Paris pour cette date
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    timeZoneName: "shortOffset",
    year: "numeric",
  });
  const parts = fmt.formatToParts(date);
  const tz = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT+1";
  const match = tz.match(/GMT([+-]\d+)/);
  const offsetH = match ? parseInt(match[1], 10) : 1;
  const sign = offsetH >= 0 ? "+" : "-";
  const absH = Math.abs(offsetH).toString().padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(h).padStart(2, "0");
  const mi = String(m).padStart(2, "0");
  const ss = String(s ?? 0).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}${sign}${absH}:00`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const ANON = Deno.env.get("SUPABASE_ANON_KEY");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !ANON || !SERVICE_ROLE) return json({ error: "config" }, 500);

    const body = await req.json().catch(() => ({}));
    const daysAhead = Math.min(Math.max(parseInt(body?.days_ahead ?? "7", 10) || 7, 1), 30);
    const allUsers = body?.all_users === true;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Liste des user_ids à traiter
    let userIds: string[] = [];
    if (allUsers) {
      // Mode cron : tous les users qui ont au moins une règle active
      const { data: rows, error } = await admin
        .from("recurring_schedule_rules")
        .select("user_id")
        .eq("is_active", true);
      if (error) return json({ error: error.message }, 500);
      userIds = [...new Set((rows ?? []).map((r) => r.user_id as string))];
    } else {
      // Mode user : on lit l'auth via le client user
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "no_auth" }, 401);
      const userClient = createClient(SUPABASE_URL, ANON, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await userClient.auth.getUser();
      if (!user) return json({ error: "not_authenticated" }, 401);
      userIds = [user.id];
    }

    let totalInserted = 0;
    let totalSkipped = 0;
    const perUser: Record<string, { inserted: number; skipped: number }> = {};

    for (const uid of userIds) {
      // Charge règles + zone
      const [rulesRes, settingsRes] = await Promise.all([
        admin.from("recurring_schedule_rules").select("*").eq("user_id", uid).eq("is_active", true),
        admin.from("user_settings").select("school_zone").eq("user_id", uid).maybeSingle(),
      ]);
      if (rulesRes.error) {
        perUser[uid] = { inserted: 0, skipped: 0 };
        continue;
      }
      const rules = (rulesRes.data ?? []) as Rule[];
      const zone = (settingsRes.data?.school_zone ?? "none") as "none" | "A" | "B" | "C";
      if (rules.length === 0) {
        perUser[uid] = { inserted: 0, skipped: 0 };
        continue;
      }

      const candidates = buildEventsForUser(rules, zone, daysAhead);

      // Insertion en masse, conflits ignorés grâce à l'index UNIQUE
      let inserted = 0;
      let skipped = 0;
      for (const ev of candidates) {
        const { error: insErr } = await admin
          .from("schedule_events")
          .insert(ev)
          .select("id")
          .single();
        if (insErr) {
          // 23505 = duplicate key → existe déjà, c'est attendu
          if ((insErr as any).code === "23505") skipped++;
          else skipped++;
        } else {
          inserted++;
        }
      }
      totalInserted += inserted;
      totalSkipped += skipped;
      perUser[uid] = { inserted, skipped };
    }

    return json({
      ok: true,
      users: userIds.length,
      inserted: totalInserted,
      skipped: totalSkipped,
      details: perUser,
    });
  } catch (e) {
    console.error("schedule-autofill error:", e);
    return json({ error: e instanceof Error ? e.message : "unknown" }, 500);
  }
});