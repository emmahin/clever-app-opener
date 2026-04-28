import { supabase } from "@/integrations/supabase/client";
import { loadVoiceConfig } from "./elevenLabsConfig";

export interface ElevenLabsTtsOptions {
  text: string;
  voiceId?: string;
  modelId?: string;
  outputFormat?: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  useSpeakerBoost?: boolean;
  speed?: number;
  stream?: boolean;
}

/**
 * Génère un blob audio MP3 via l'edge function `elevenlabs-tts`.
 */
export async function synthesizeWithElevenLabs(options: ElevenLabsTtsOptions): Promise<Blob> {
  const cfg = loadVoiceConfig();
  const merged: ElevenLabsTtsOptions = {
    voiceId: cfg.voiceId,
    modelId: cfg.modelId,
    outputFormat: cfg.outputFormat,
    stability: cfg.stability,
    similarityBoost: cfg.similarityBoost,
    style: cfg.style,
    useSpeakerBoost: cfg.useSpeakerBoost,
    speed: cfg.speed,
    ...options,
  };

  // On utilise fetch() directement plutôt que supabase.functions.invoke()
  // car ce dernier ne gère pas correctement les réponses binaires (audio/mpeg).
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/elevenlabs-tts`;
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: anonKey,
      Authorization: `Bearer ${accessToken ?? anonKey}`,
    },
    body: JSON.stringify(merged),
  });

  if (!response.ok) {
    let message = `TTS failed: ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.error) message = String(errJson.error);
    } catch {
      try {
        const txt = await response.text();
        if (txt) message = txt;
      } catch { /* ignore */ }
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  // Forcer le type MIME audio si manquant.
  if (!blob.type || !blob.type.startsWith("audio/")) {
    return new Blob([await blob.arrayBuffer()], { type: "audio/mpeg" });
  }
  return blob;
}

/**
 * Joue directement le texte fourni via ElevenLabs.
 */
export async function speakWithElevenLabs(options: ElevenLabsTtsOptions): Promise<HTMLAudioElement> {
  const blob = await synthesizeWithElevenLabs(options);
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  await audio.play();
  return audio;
}
