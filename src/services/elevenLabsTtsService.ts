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
  const { data, error } = await supabase.functions.invoke("elevenlabs-tts", {
    body: merged,
  });
  if (error) throw error;
  if (data instanceof Blob) return data;
  // Si la réponse a été parsée en JSON (cas d'erreur), on lève.
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    throw new Error(String((data as Record<string, unknown>).error));
  }
  throw new Error("Réponse inattendue depuis elevenlabs-tts");
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
