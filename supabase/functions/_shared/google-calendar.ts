/**
 * Couche d'abstraction Google Calendar.
 *
 * 🔄 MIGRATION FUTURE :
 * Aujourd'hui on utilise OAuth maison (credentials du user dans `google_oauth_tokens`).
 * Si un jour on bascule sur le connecteur Lovable, il suffira de remplacer
 * `getAuthHeadersForUser()` par un fetch passant par le gateway. Le reste du code
 * (push/pull events) ne change pas.
 */

const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scope: string;
  google_email: string | null;
}

/**
 * Récupère un access_token valide pour un user — refresh automatique si expiré.
 */
export async function getValidAccessToken(
  supabaseAdmin: any,
  userId: string,
): Promise<{ token: string; tokens: GoogleTokens }> {
  const { data, error } = await supabaseAdmin
    .from("google_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(`DB error: ${error.message}`);
  if (!data) throw new Error("not_connected");

  const tokens = data as GoogleTokens;
  const expiresAt = new Date(tokens.expires_at).getTime();
  const now = Date.now();

  // Si le token expire dans moins de 60 sec, on rafraîchit.
  if (expiresAt - now > 60_000) {
    return { token: tokens.access_token, tokens };
  }

  const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
  const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error("oauth_not_configured");

  const refreshResp = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: tokens.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!refreshResp.ok) {
    const t = await refreshResp.text();
    throw new Error(`refresh_failed: ${t}`);
  }

  const refreshed = await refreshResp.json();
  const newAccessToken = refreshed.access_token as string;
  const newExpiresIn = (refreshed.expires_in as number) ?? 3600;
  const newExpiresAt = new Date(Date.now() + newExpiresIn * 1000).toISOString();

  await supabaseAdmin
    .from("google_oauth_tokens")
    .update({ access_token: newAccessToken, expires_at: newExpiresAt })
    .eq("user_id", userId);

  return {
    token: newAccessToken,
    tokens: { ...tokens, access_token: newAccessToken, expires_at: newExpiresAt },
  };
}

export async function gcalFetch(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${GOOGLE_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export interface GCalEventInput {
  title: string;
  start_iso: string;
  end_iso?: string | null;
  location?: string | null;
  notes?: string | null;
}

export function toGoogleEventBody(input: GCalEventInput) {
  const start = new Date(input.start_iso);
  const end = input.end_iso
    ? new Date(input.end_iso)
    : new Date(start.getTime() + 60 * 60 * 1000); // défaut 1h

  return {
    summary: input.title,
    description: input.notes ?? undefined,
    location: input.location ?? undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}