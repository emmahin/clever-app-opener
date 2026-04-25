const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Returns a short-lived ElevenLabs Conversational AI token for the user.
 * The agent_id is provided by the client (configured in ElevenLabs dashboard).
 * If no agent_id is provided, falls back to the env var ELEVENLABS_AGENT_ID.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
    if (!ELEVENLABS_API_KEY) {
      return new Response(JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body: { agent_id?: string } = {};
    try { body = await req.json(); } catch { /* GET allowed */ }

    const agentId = body.agent_id || Deno.env.get("ELEVENLABS_AGENT_ID");
    if (!agentId) {
      return new Response(JSON.stringify({ error: "agent_id required (configurez votre agent dans ElevenLabs et passez son ID)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const url = `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${encodeURIComponent(agentId)}`;
    const resp = await fetch(url, {
      headers: { "xi-api-key": ELEVENLABS_API_KEY },
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("ElevenLabs token error:", resp.status, t);
      return new Response(JSON.stringify({ error: `ElevenLabs error ${resp.status}: ${t.slice(0, 200)}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await resp.json();
    return new Response(JSON.stringify({ token: data.token, agent_id: agentId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("elevenlabs-twin-token error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});