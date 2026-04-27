/**
 * openai-diagnostics — Introspection de la clé OpenAI utilisateur (platform.openai.com).
 *
 * N'utilise JAMAIS le Lovable AI Gateway. Appelle directement api.openai.com avec
 * la clé `OPENAI_API_KEY` stockée dans les secrets Supabase.
 *
 * Renvoie :
 *   - models: liste brute + groupée par catégorie (chat, tts, stt, embeddings, image, moderation, realtime, other)
 *   - capabilities: { chat, tts, whisper, embeddings } avec test réel (status + message d'erreur)
 *   - meta: { keyPrefix, totalModels, durationMs }
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENAI_BASE = "https://api.openai.com/v1";

type ProbeResult = {
  ok: boolean;
  status: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  modelTested?: string;
};

function categorize(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.startsWith("whisper") || id.includes("transcribe")) return "stt";
  if (id.startsWith("tts-") || id.includes("-tts")) return "tts";
  if (id.includes("embedding")) return "embeddings";
  if (id.includes("moderation")) return "moderation";
  if (id.includes("realtime")) return "realtime";
  if (id.startsWith("dall-e") || id.includes("image")) return "image";
  if (
    id.startsWith("gpt-") ||
    id.startsWith("o1") ||
    id.startsWith("o3") ||
    id.startsWith("chatgpt") ||
    id.startsWith("gpt-4") ||
    id.startsWith("gpt-5")
  ) {
    return "chat";
  }
  return "other";
}

async function probeChat(apiKey: string): Promise<ProbeResult> {
  const model = "gpt-4o-mini";
  try {
    const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 1,
      }),
    });
    if (r.ok) {
      await r.text();
      return { ok: true, status: r.status, modelTested: model };
    }
    const j = await r.json().catch(() => ({}));
    return {
      ok: false,
      status: r.status,
      errorCode: j?.error?.code ?? null,
      errorMessage: j?.error?.message ?? null,
      modelTested: model,
    };
  } catch (e) {
    return { ok: false, status: 0, errorMessage: e instanceof Error ? e.message : "network", modelTested: model };
  }
}

async function probeTts(apiKey: string): Promise<ProbeResult> {
  const model = "tts-1";
  try {
    const r = await fetch(`${OPENAI_BASE}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, voice: "alloy", input: "hi" }),
    });
    if (r.ok) {
      await r.arrayBuffer();
      return { ok: true, status: r.status, modelTested: model };
    }
    const j = await r.json().catch(() => ({}));
    return {
      ok: false,
      status: r.status,
      errorCode: j?.error?.code ?? null,
      errorMessage: j?.error?.message ?? null,
      modelTested: model,
    };
  } catch (e) {
    return { ok: false, status: 0, errorMessage: e instanceof Error ? e.message : "network", modelTested: model };
  }
}

async function probeWhisper(apiKey: string): Promise<ProbeResult> {
  const model = "whisper-1";
  try {
    // Mini WAV silencieux (44 octets header + 0 data) — accepté par Whisper pour le ping.
    const wavHeader = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
      0x44, 0xac, 0x00, 0x00, 0x88, 0x58, 0x01, 0x00, 0x02, 0x00, 0x10, 0x00,
      0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
    ]);
    const fd = new FormData();
    fd.append("file", new Blob([wavHeader], { type: "audio/wav" }), "ping.wav");
    fd.append("model", model);
    const r = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: fd,
    });
    if (r.ok) {
      await r.text();
      return { ok: true, status: r.status, modelTested: model };
    }
    const j = await r.json().catch(() => ({}));
    // Note : un fichier vide peut renvoyer 400 "audio file is too short" même
    // quand la clé a accès. On considère donc l'accès OK si l'erreur n'est
    // ni 401, ni 403, ni model_not_found.
    const code = j?.error?.code ?? null;
    const msg = j?.error?.message ?? null;
    const accessOk =
      r.status !== 401 &&
      r.status !== 403 &&
      code !== "model_not_found" &&
      !(typeof msg === "string" && msg.toLowerCase().includes("does not have access"));
    return {
      ok: accessOk,
      status: r.status,
      errorCode: code,
      errorMessage: msg,
      modelTested: model,
    };
  } catch (e) {
    return { ok: false, status: 0, errorMessage: e instanceof Error ? e.message : "network", modelTested: model };
  }
}

async function probeEmbeddings(apiKey: string): Promise<ProbeResult> {
  const model = "text-embedding-3-small";
  try {
    const r = await fetch(`${OPENAI_BASE}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, input: "ping" }),
    });
    if (r.ok) {
      await r.text();
      return { ok: true, status: r.status, modelTested: model };
    }
    const j = await r.json().catch(() => ({}));
    return {
      ok: false,
      status: r.status,
      errorCode: j?.error?.code ?? null,
      errorMessage: j?.error?.message ?? null,
      modelTested: model,
    };
  } catch (e) {
    return { ok: false, status: 0, errorMessage: e instanceof Error ? e.message : "network", modelTested: model };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "OPENAI_API_KEY not configured in project secrets" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 1) GET /v1/models
    const modelsResp = await fetch(`${OPENAI_BASE}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!modelsResp.ok) {
      const j = await modelsResp.json().catch(() => ({}));
      return new Response(
        JSON.stringify({
          error: "OpenAI /v1/models failed",
          status: modelsResp.status,
          openaiError: j?.error ?? null,
          keyPrefix: apiKey.slice(0, 8) + "…",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const modelsJson = await modelsResp.json();
    const rawModels: Array<{ id: string; created?: number; owned_by?: string }> =
      Array.isArray(modelsJson?.data) ? modelsJson.data : [];

    const grouped: Record<string, typeof rawModels> = {
      chat: [],
      tts: [],
      stt: [],
      embeddings: [],
      image: [],
      moderation: [],
      realtime: [],
      other: [],
    };
    for (const m of rawModels) {
      const cat = categorize(m.id);
      grouped[cat].push(m);
    }
    for (const k of Object.keys(grouped)) {
      grouped[k].sort((a, b) => a.id.localeCompare(b.id));
    }

    // 2) Probes en parallèle
    const [chat, tts, whisper, embeddings] = await Promise.all([
      probeChat(apiKey),
      probeTts(apiKey),
      probeWhisper(apiKey),
      probeEmbeddings(apiKey),
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        meta: {
          keyPrefix: apiKey.slice(0, 8) + "…",
          totalModels: rawModels.length,
          durationMs: Date.now() - startedAt,
          fetchedAt: new Date().toISOString(),
        },
        capabilities: { chat, tts, whisper, embeddings },
        models: {
          grouped,
          all: rawModels.map((m) => m.id).sort(),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("openai-diagnostics error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});