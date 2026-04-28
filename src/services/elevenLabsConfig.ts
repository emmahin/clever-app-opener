/**
 * Configuration globale de la voix ElevenLabs.
 * Persistée dans localStorage et partagée par toute l'application.
 */

const STORAGE_KEY = "elevenlabs.voice.config.v1";
const EVENT_NAME = "elevenlabs:config-changed";

export interface ElevenLabsVoiceConfig {
  voiceId: string;
  modelId: string;
  outputFormat: string;
  stability: number;
  similarityBoost: number;
  style: number;
  useSpeakerBoost: boolean;
  speed: number;
}

export const DEFAULT_VOICE_CONFIG: ElevenLabsVoiceConfig = {
  voiceId: "EXAVITQu4vr4xnSDxMaL", // Sarah
  modelId: "eleven_multilingual_v2",
  outputFormat: "mp3_44100_128",
  stability: 0.5,
  similarityBoost: 0.75,
  style: 0.4,
  useSpeakerBoost: true,
  speed: 1.0,
};

export const VOICE_PRESETS: Array<{ id: string; name: string; description: string }> = [
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Sarah", description: "Voix féminine douce et claire" },
  { id: "FGY2WhTYpPnrIDTdsKH5", name: "Laura", description: "Féminine, chaleureuse" },
  { id: "XrExE9yKIg1WjnnlVkGX", name: "Matilda", description: "Féminine, posée" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", name: "Alice", description: "Féminine, énergique" },
  { id: "pFZP5JQG7iQjIQuC4Bku", name: "Lily", description: "Féminine, jeune" },
  { id: "cgSgspJ2msm6clMCkdW9", name: "Jessica", description: "Féminine, expressive" },
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", description: "Masculine, chaleureuse" },
  { id: "CwhRBWXzGAHq8TQ4Fs17", name: "Roger", description: "Masculine, mature" },
  { id: "TX3LPaxmHKxFdv7VOQHJ", name: "Liam", description: "Masculine, naturelle" },
  { id: "onwK4e9ZLuTAKqWW03F9", name: "Daniel", description: "Masculine, professionnelle" },
  { id: "nPczCjzI2devNBz1zQrb", name: "Brian", description: "Masculine, profonde" },
  { id: "iP95p4xoKVk53GoZ742B", name: "Chris", description: "Masculine, conversationnelle" },
];

/**
 * Coût indicatif : nombre de "crédits ElevenLabs" consommés par caractère.
 * (1 crédit ≈ 1 caractère sur Multilingual v2, 0.5 sur Turbo, 0.33 sur Flash.)
 * Les valeurs sont indicatives — voir https://elevenlabs.io/pricing pour les tarifs exacts.
 */
export const MODEL_PRESETS: Array<{
  id: string;
  name: string;
  description: string;
  creditsPerChar: number;
  costHint: string;
}> = [
  {
    id: "eleven_multilingual_v2",
    name: "Multilingual v2",
    description: "Qualité maximale, 29 langues",
    creditsPerChar: 1,
    costHint: "1 crédit / caractère (~$0.18 / 1k car.)",
  },
  {
    id: "eleven_turbo_v2_5",
    name: "Turbo v2.5",
    description: "Faible latence, idéal streaming",
    creditsPerChar: 0.5,
    costHint: "0,5 crédit / caractère (~$0.09 / 1k car.)",
  },
  {
    id: "eleven_turbo_v2",
    name: "Turbo v2",
    description: "Très rapide, qualité correcte",
    creditsPerChar: 0.5,
    costHint: "0,5 crédit / caractère (~$0.09 / 1k car.)",
  },
];

export function loadVoiceConfig(): ElevenLabsVoiceConfig {
  if (typeof window === "undefined") return { ...DEFAULT_VOICE_CONFIG };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_VOICE_CONFIG };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_VOICE_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_VOICE_CONFIG };
  }
}

export function saveVoiceConfig(config: ElevenLabsVoiceConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: config }));
}

export function resetVoiceConfig(): ElevenLabsVoiceConfig {
  saveVoiceConfig({ ...DEFAULT_VOICE_CONFIG });
  return { ...DEFAULT_VOICE_CONFIG };
}

export function subscribeVoiceConfig(cb: (config: ElevenLabsVoiceConfig) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<ElevenLabsVoiceConfig>).detail;
    if (detail) cb(detail);
    else cb(loadVoiceConfig());
  };
  const storageHandler = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) cb(loadVoiceConfig());
  };
  window.addEventListener(EVENT_NAME, handler);
  window.addEventListener("storage", storageHandler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler);
    window.removeEventListener("storage", storageHandler);
  };
}
