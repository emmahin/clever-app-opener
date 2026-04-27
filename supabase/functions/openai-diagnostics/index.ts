/**
 * openai-diagnostics — Introspection multi-clés OpenAI.
 *
 * Trois clés possibles :
 *   - OPENAI_API_KEY         → "clé_chat" (chat completions, codex, fallback)
 *   - OPENAI_WHISPER_API_KEY → "clé_whisper" (transcription audio)
 *   - OPENAI_TTS_API_KEY     → "clé_tts" (synthèse vocale)
 *
 * Pour chaque clé configurée, on appelle GET /v1/models pour lister ce qu'elle voit.
 * Pour chaque capacité (chat, embeddings, whisper, tts) on lance un probe POST minimal
 * avec la clé qui lui est dédiée (fallback sur OPENAI_API_KEY si la dédiée manque).
 *
 * Réponse :
 * {
 *   meta: { keys: { chat, whisper, tts } avec présence + préfixe },
 *   capabilities: {
 *     chat:    { keyUsed, keyLabel, ok, status, errorCode?, errorMessage?, modelTested },
 *     codex:   { ... },
 *     whisper: { ... },
 *     tts:     { ... }
 *   },
 *   modelsByKey: {
 *     "clé_chat":    { keyName, keyPrefix, total, grouped: {...}, all: [] },
 *     "clé_whisper": { ... },
 *     "clé_tts":     { ... }
 *   }
 * }
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
  keyUsed: string;       // ex: "OPENAI_TTS_API_KEY"
  keyLabel: string;      // ex: "clé_tts"
  note?: string;         // ex: "modèle auto-sélectionné parmi ceux exposés par la clé"
};

type ModelEntry = { id: string; created?: number; owned_by?: string };

function categorize(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.startsWith("whisper") || id.includes("transcribe")) return "stt";
  if (id.startsWith("tts-") || id.includes("-tts")) return "tts";
  if (id.includes("embedding")) return "embeddings";
  if (id.includes("moderation")) return "moderation";
  if (id.includes("realtime")) return "realtime";
  if (id.startsWith("dall-e") || id.includes("image")) return "image";
  if (id.startsWith("gpt-") || id.startsWith("o1") || id.startsWith("o3") || id.startsWith("chatgpt")) return "chat";
  return "other";
}

/**
 * Choisit le meilleur modèle disponible pour une capacité donnée,
 * parmi les modèles réellement exposés par la clé.
 * Retourne null si aucun candidat compatible n'est exposé.
 */
function pickModelFor(
  capability: "chat" | "tts" | "stt" | "codex",
  available: string[],
): string | null {
  // On filtre la liste par catégorie réelle pour éviter qu'un modèle TTS comme
  // « gpt-4o-mini-tts » soit pris pour du chat (car il contient « gpt-4o-mini »).
  const ids = available.map((s) => s.toLowerCase());
  const byCat = ids.filter((id) => categorize(id) === (
    capability === "stt" ? "stt" :
    capability === "tts" ? "tts" :
    capability === "codex" ? "chat" :
    "chat"
  ));
  const exact = (needle: string) => byCat.find((id) => id === needle);
  const startsWith = (prefix: string) => byCat.find((id) => id.startsWith(prefix));

  if (capability === "chat") {
    return (
      exact("gpt-4o-mini") ||
      exact("gpt-4o") ||
      exact("gpt-4.1-mini") ||
      exact("gpt-4.1") ||
      startsWith("gpt-4.1") ||
      startsWith("gpt-4o") ||
      startsWith("gpt-5") ||
      startsWith("gpt-") ||
      startsWith("o1") ||
      startsWith("o3") ||
      byCat[0] ||
      null
    );
  }
  if (capability === "codex") {
    // Famille codex : on prend le modèle dont l'id contient "codex".
    const codexes = byCat.filter((id) => id.includes("codex"));
    return (
      codexes.find((id) => id.startsWith("gpt-5")) ||
      codexes[0] ||
      null
    );
  }
  if (capability === "tts") {
    return (
      exact("gpt-4o-mini-tts") ||
      exact("tts-1-hd") ||
      exact("tts-1") ||
      byCat[0] ||
      null
    );
  }
  if (capability === "stt") {
    return (
      exact("whisper-1") ||
      exact("gpt-4o-mini-transcribe") ||
      exact("gpt-4o-transcribe") ||
      byCat[0] ||
      null
    );
  }
  return null;
}

async function fetchModelsForKey(apiKey: string) {
  const r = await fetch(`${OPENAI_BASE}/models`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return { ok: false, status: r.status, error: j?.error?.message ?? `HTTP ${r.status}`, models: [] as ModelEntry[] };
  }
  const j = await r.json();
  const models: ModelEntry[] = Array.isArray(j?.data) ? j.data : [];
  return { ok: true, status: 200, error: null as string | null, models };
}

function group(models: ModelEntry[]) {
  const grouped: Record<string, ModelEntry[]> = {
    chat: [], tts: [], stt: [], embeddings: [], image: [], moderation: [], realtime: [], other: [],
  };
  for (const m of models) grouped[categorize(m.id)].push(m);
  for (const k of Object.keys(grouped)) grouped[k].sort((a, b) => a.id.localeCompare(b.id));
  return grouped;
}

async function probeChat(apiKey: string, keyUsed: string, keyLabel: string, model: string): Promise<ProbeResult> {
  try {
    const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "ping" }], max_tokens: 1 }),
    });
    if (r.ok) { await r.text(); return { ok: true, status: r.status, modelTested: model, keyUsed, keyLabel }; }
    const j = await r.json().catch(() => ({}));
    return { ok: false, status: r.status, errorCode: j?.error?.code ?? null, errorMessage: j?.error?.message ?? null, modelTested: model, keyUsed, keyLabel };
  } catch (e) {
    return { ok: false, status: 0, errorMessage: e instanceof Error ? e.message : "network", modelTested: model, keyUsed, keyLabel };
  }
}

async function probeTts(apiKey: string, keyUsed: string, keyLabel: string, model: string): Promise<ProbeResult> {
  try {
    const r = await fetch(`${OPENAI_BASE}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, voice: "alloy", input: "hi" }),
    });
    if (r.ok) { await r.arrayBuffer(); return { ok: true, status: r.status, modelTested: model, keyUsed, keyLabel }; }
    const j = await r.json().catch(() => ({}));
    return { ok: false, status: r.status, errorCode: j?.error?.code ?? null, errorMessage: j?.error?.message ?? null, modelTested: model, keyUsed, keyLabel };
  } catch (e) {
    return { ok: false, status: 0, errorMessage: e instanceof Error ? e.message : "network", modelTested: model, keyUsed, keyLabel };
  }
}

async function probeWhisper(apiKey: string, keyUsed: string, keyLabel: string, model: string): Promise<ProbeResult> {
  try {
    // Vrai WAV PCM 16-bit, 16 kHz, 1 s de silence — Whisper accepte (assez long pour ne pas
    // déclencher "audio too short", et c'est bien du contenu audio valide).
    const sr = 16000;
    const samples = sr; // 1 s
    const dataSize = samples * 2;
    const wavHeader = new Uint8Array(44 + dataSize);
    const dv = new DataView(wavHeader.buffer);
    const w = (off: number, s: string) => { for (let i = 0; i < s.length; i++) wavHeader[off + i] = s.charCodeAt(i); };
    w(0, "RIFF"); dv.setUint32(4, 36 + dataSize, true);
    w(8, "WAVEfmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    w(36, "data"); dv.setUint32(40, dataSize, true);
    const fd = new FormData();
    fd.append("file", new Blob([wavHeader], { type: "audio/wav" }), "ping.wav");
    fd.append("model", model);
    const r = await fetch(`${OPENAI_BASE}/audio/transcriptions`, {
      method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: fd,
    });
    if (r.ok) { await r.text(); return { ok: true, status: r.status, modelTested: model, keyUsed, keyLabel }; }
    const j = await r.json().catch(() => ({}));
    const code = j?.error?.code ?? null;
    const msg = j?.error?.message ?? null;
    // Un fichier vide peut donner 400 "audio file is too short" alors que la clé a accès.
    const accessOk =
      r.status !== 401 && r.status !== 403 &&
      code !== "model_not_found" &&
      !(typeof msg === "string" && msg.toLowerCase().includes("does not have access"));
    return { ok: accessOk, status: r.status, errorCode: code, errorMessage: msg, modelTested: model, keyUsed, keyLabel };
  } catch (e) {
    return { ok: false, status: 0, errorMessage: e instanceof Error ? e.message : "network", modelTested: model, keyUsed, keyLabel };
  }
}

async function probeCodex(apiKey: string, keyUsed: string, keyLabel: string, model: string): Promise<ProbeResult> {
  // Les modèles codex de la famille gpt-5.x s'appellent comme du chat.
  try {
    const r = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages: [{ role: "user", content: "print('ping')" }], max_tokens: 1 }),
    });
    if (r.ok) { await r.text(); return { ok: true, status: r.status, modelTested: model, keyUsed, keyLabel }; }
    const j = await r.json().catch(() => ({}));
    return { ok: false, status: r.status, errorCode: j?.error?.code ?? null, errorMessage: j?.error?.message ?? null, modelTested: model, keyUsed, keyLabel };
  } catch (e) {
    return { ok: false, status: 0, errorMessage: e instanceof Error ? e.message : "network", modelTested: model, keyUsed, keyLabel };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  try {
    const chatKey = Deno.env.get("OPENAI_API_KEY");
    const whisperKey = Deno.env.get("OPENAI_WHISPER_API_KEY");
    const ttsKey = Deno.env.get("OPENAI_TTS_API_KEY");

    if (!chatKey && !whisperKey && !ttsKey) {
      return new Response(JSON.stringify({ error: "Aucune clé OpenAI configurée (OPENAI_API_KEY, OPENAI_WHISPER_API_KEY, OPENAI_TTS_API_KEY)" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Résolution clé par capacité (avec fallback sur la clé chat)
    const resolveKey = (
      preferred: string | undefined,
      preferredName: string,
      preferredLabel: string,
    ): { key: string; name: string; label: string } | null => {
      if (preferred) return { key: preferred, name: preferredName, label: preferredLabel };
      if (chatKey) return { key: chatKey, name: "OPENAI_API_KEY (fallback)", label: "clé_chat (fallback)" };
      return null;
    };

    const chatRes = chatKey ? { key: chatKey, name: "OPENAI_API_KEY", label: "clé_chat" } : null;
    const codexRes = chatRes;
    const whisperRes = resolveKey(whisperKey, "OPENAI_WHISPER_API_KEY", "clé_whisper");
    const ttsRes = resolveKey(ttsKey, "OPENAI_TTS_API_KEY", "clé_tts");

    // 1) /v1/models pour chaque clé distincte (déduplication) — d'abord, pour pouvoir auto-sélectionner les modèles
    const distinctKeys = new Map<string, { name: string; label: string; key: string }>();
    if (chatKey) distinctKeys.set(chatKey, { name: "OPENAI_API_KEY", label: "clé_chat", key: chatKey });
    if (whisperKey && !distinctKeys.has(whisperKey)) distinctKeys.set(whisperKey, { name: "OPENAI_WHISPER_API_KEY", label: "clé_whisper", key: whisperKey });
    if (ttsKey && !distinctKeys.has(ttsKey)) distinctKeys.set(ttsKey, { name: "OPENAI_TTS_API_KEY", label: "clé_tts", key: ttsKey });

    const modelsEntries = await Promise.all(
      Array.from(distinctKeys.values()).map(async ({ name, label, key }) => {
        const res = await fetchModelsForKey(key);
        return [
          label,
          {
            keyName: name,
            keyLabel: label,
            keyPrefix: key.slice(0, 8) + "…",
            ok: res.ok,
            status: res.status,
            error: res.error,
            total: res.models.length,
            all: res.models.map((m) => m.id).sort(),
            grouped: group(res.models),
          },
        ] as const;
      }),
    );
    const modelsByKey = Object.fromEntries(modelsEntries);

    // Helper : récupère la liste des modèles vue par une clé (via son label)
    const modelsForLabel = (label: string): string[] => {
      const baseLabel = label.replace(" (fallback)", "");
      const entry = (modelsByKey as Record<string, { all?: string[] }>)[baseLabel];
      return entry?.all ?? [];
    };

    const noModelResult = (cap: string, label: string, keyUsed: string): ProbeResult => ({
      ok: false,
      status: 0,
      errorCode: "no_compatible_model",
      errorMessage: `Aucun modèle ${cap} exposé par cette clé (vérifie les Model usage limits côté OpenAI).`,
      keyUsed,
      keyLabel: label,
    });

    // 2) Probes en parallèle, avec auto-sélection du modèle disponible pour chaque capacité
    const [chat, codex, whisper, tts] = await Promise.all([
      (async (): Promise<ProbeResult> => {
        if (!chatRes) return { ok: false, status: 0, errorMessage: "Aucune clé chat configurée", keyUsed: "—", keyLabel: "—" };
        const m = pickModelFor("chat", modelsForLabel(chatRes.label));
        if (!m) return noModelResult("chat", chatRes.label, chatRes.name);
        const r = await probeChat(chatRes.key, chatRes.name, chatRes.label, m);
        return { ...r, note: "modèle auto-sélectionné parmi ceux exposés par la clé" };
      })(),
      (async (): Promise<ProbeResult> => {
        if (!codexRes) return { ok: false, status: 0, errorMessage: "Aucune clé chat configurée pour Codex", keyUsed: "—", keyLabel: "—" };
        const m = pickModelFor("codex", modelsForLabel(codexRes.label));
        if (!m) return noModelResult("codex", codexRes.label, codexRes.name);
        const r = await probeCodex(codexRes.key, codexRes.name, codexRes.label, m);
        return { ...r, note: "modèle auto-sélectionné parmi ceux exposés par la clé" };
      })(),
      (async (): Promise<ProbeResult> => {
        if (!whisperRes) return { ok: false, status: 0, errorMessage: "Aucune clé whisper configurée", keyUsed: "—", keyLabel: "—" };
        const m = pickModelFor("stt", modelsForLabel(whisperRes.label));
        if (!m) return noModelResult("transcription (STT)", whisperRes.label, whisperRes.name);
        const r = await probeWhisper(whisperRes.key, whisperRes.name, whisperRes.label, m);
        return { ...r, note: "modèle auto-sélectionné parmi ceux exposés par la clé" };
      })(),
      (async (): Promise<ProbeResult> => {
        if (!ttsRes) return { ok: false, status: 0, errorMessage: "Aucune clé TTS configurée", keyUsed: "—", keyLabel: "—" };
        const m = pickModelFor("tts", modelsForLabel(ttsRes.label));
        if (!m) return noModelResult("TTS", ttsRes.label, ttsRes.name);
        const r = await probeTts(ttsRes.key, ttsRes.name, ttsRes.label, m);
        return { ...r, note: "modèle auto-sélectionné parmi ceux exposés par la clé" };
      })(),
    ]);

    return new Response(JSON.stringify({
      ok: true,
      meta: {
        durationMs: Date.now() - startedAt,
        fetchedAt: new Date().toISOString(),
        keys: {
          chat:    { configured: !!chatKey,    prefix: chatKey ? chatKey.slice(0, 8) + "…" : null,    label: "clé_chat" },
          whisper: { configured: !!whisperKey, prefix: whisperKey ? whisperKey.slice(0, 8) + "…" : null, label: "clé_whisper" },
          tts:     { configured: !!ttsKey,     prefix: ttsKey ? ttsKey.slice(0, 8) + "…" : null,     label: "clé_tts" },
        },
      },
      capabilities: { chat, codex, whisper, tts },
      modelsByKey,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("openai-diagnostics error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
