/**
 * gcal-oauth-callback — endpoint vers lequel Google redirige après autorisation.
 * Reçoit ?code=xxx&state=xxx, échange le code contre tokens, sauvegarde en DB,
 * puis redirige le navigateur vers l'app.
 *
 * IMPORTANT : cette fonction est appelée par le navigateur via redirection Google,
 * sans header Authorization. Elle doit donc utiliser le service role key et
 * récupérer le user_id via le `state`.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

function htmlPage(title: string, body: string, redirectTo?: string) {
  const meta = redirectTo
    ? `<meta http-equiv="refresh" content="2;url=${redirectTo}">`
    : "";
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${title}</title>${meta}
<style>body{font-family:system-ui,sans-serif;background:#0f0f15;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;text-align:center}
.box{max-width:480px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:32px}
h1{margin:0 0 12px;font-size:22px}p{color:rgba(255,255,255,0.7);margin:8px 0}
a{color:#c084fc;text-decoration:none}</style></head><body><div class="box">${body}</div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const stateRaw = url.searchParams.get("state");
    const errorParam = url.searchParams.get("error");

    if (errorParam) {
      return new Response(
        htmlPage("Erreur", `<h1>❌ Autorisation refusée</h1><p>${errorParam}</p><p><a href="/twin">Retour</a></p>`),
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    if (!code || !stateRaw) {
      return new Response(
        htmlPage("Erreur", `<h1>❌ Paramètres manquants</h1><p><a href="/twin">Retour</a></p>`),
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    let state: { uid: string; origin?: string };
    try {
      state = JSON.parse(atob(stateRaw));
    } catch {
      return new Response(
        htmlPage("Erreur", `<h1>❌ State invalide</h1>`),
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    const CLIENT_ID = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID");
    const CLIENT_SECRET = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!CLIENT_ID || !CLIENT_SECRET || !SUPABASE_URL || !SERVICE_ROLE) {
      return new Response(
        htmlPage("Erreur", `<h1>❌ Configuration serveur incomplète</h1>`),
        { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    const redirectUri = `${SUPABASE_URL}/functions/v1/gcal-oauth-callback`;

    // 1) Échange code → tokens
    const tokenResp = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResp.ok) {
      const t = await tokenResp.text();
      console.error("Token exchange failed:", t);
      return new Response(
        htmlPage("Erreur", `<h1>❌ Échec de l'échange Google</h1><p>${tokenResp.status}</p>`),
        { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    const tokenData = await tokenResp.json();
    const access_token = tokenData.access_token as string;
    const refresh_token = tokenData.refresh_token as string | undefined;
    const expires_in = (tokenData.expires_in as number) ?? 3600;
    const scope = (tokenData.scope as string) ?? "";

    if (!refresh_token) {
      // Si Google n'a pas renvoyé de refresh_token, c'est que le user a déjà autorisé.
      // Il faut révoquer l'ancien accès puis recommencer.
      return new Response(
        htmlPage(
          "Erreur",
          `<h1>⚠️ Refresh token manquant</h1>
          <p>Va sur <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a>, révoque l'accès de cette app, puis réessaye.</p>`,
        ),
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    // 2) Récupère l'email Google
    let google_email: string | null = null;
    try {
      const u = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (u.ok) {
        const ui = await u.json();
        google_email = (ui.email as string) ?? null;
      }
    } catch (e) {
      console.warn("Could not fetch userinfo:", e);
    }

    // 3) Sauvegarde en DB (upsert sur user_id unique)
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const expires_at = new Date(Date.now() + expires_in * 1000).toISOString();

    const { error: upsertErr } = await supabase
      .from("google_oauth_tokens")
      .upsert({
        user_id: state.uid,
        access_token,
        refresh_token,
        expires_at,
        scope,
        google_email,
      }, { onConflict: "user_id" });

    if (upsertErr) {
      console.error("Upsert error:", upsertErr);
      return new Response(
        htmlPage("Erreur", `<h1>❌ Échec de sauvegarde</h1><p>${upsertErr.message}</p>`),
        { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    // 4) Redirige vers /twin
    const finalUrl = (state.origin || "").replace(/\/$/, "") + "/twin";
    return new Response(
      htmlPage(
        "Connecté",
        `<h1>✅ Google Calendar connecté</h1>
        <p>Compte : <strong>${google_email ?? "(email inconnu)"}</strong></p>
        <p>Redirection vers ton double…</p>
        <p><a href="${finalUrl || "/twin"}">Cliquer si pas redirigé</a></p>`,
        finalUrl || "/twin",
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  } catch (e) {
    console.error("gcal-oauth-callback error:", e);
    return new Response(
      htmlPage("Erreur", `<h1>❌ Erreur inattendue</h1><p>${e instanceof Error ? e.message : "unknown"}</p>`),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
});