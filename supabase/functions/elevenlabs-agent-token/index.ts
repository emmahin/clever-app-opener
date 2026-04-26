import { corsHeaders } from "@supabase/supabase-js/cors";

const AGENT_ID = "agent_8701kq5nfm20e2ns1nr3tq7rs3m2";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("ELEVENLABS_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "ELEVENLABS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const url = `https://api.elevenlabs.io/v1/convai/conversation/token?agent_id=${AGENT_ID}`;
    const r = await fetch(url, { headers: { "xi-api-key": apiKey } });

    if (!r.ok) {
      const text = await r.text();
      console.error("[elevenlabs-agent-token] upstream error", r.status, text);
      return new Response(
        JSON.stringify({ error: "Failed to get ElevenLabs token", details: text }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await r.json();
    return new Response(
      JSON.stringify({ token: data.token, agentId: AGENT_ID }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("[elevenlabs-agent-token] error", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});