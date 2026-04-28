/**
 * Configuration globale de la voix ElevenLabs.
 * Persistée dans localStorage et partagée par toute l'application.
 */

const STORAGE_KEY = "elevenlabs.voice.config.v1";
const EVENT_NAME = "elevenlabs:config-changed";
const PRICING_KEY = "elevenlabs.pricing.config.v1";
const PRICING_EVENT = "elevenlabs:pricing-changed";

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

/**
 * Configuration tarifaire indicative.
 * pricePerCharUsd : coût USD par caractère sur le modèle de base (Multilingual v2).
 * Le coût réel est multiplié par MODEL.creditsPerChar selon le modèle utilisé.
 * usdToEur : taux de change utilisé pour l'affichage.
 */
export interface ElevenLabsPricingConfig {
  /** Plan label (informatif, ex. "Starter 5$/30k") */
  planLabel: string;
  /** Prix USD par caractère, base Multilingual v2 (1 crédit = 1 char) */
  pricePerCharUsd: number;
  /** Taux de conversion USD → EUR */
  usdToEur: number;
}

// Défaut : Starter ElevenLabs = 5 $ pour 30 000 caractères.
export const DEFAULT_PRICING: ElevenLabsPricingConfig = {
  planLabel: "Starter (5 $ / 30 000 car.)",
  pricePerCharUsd: 5 / 30000, // ≈ 0.0001667 $/char
  usdToEur: 0.92,
};

export function loadPricing(): ElevenLabsPricingConfig {
  if (typeof window === "undefined") return { ...DEFAULT_PRICING };
  try {
    const raw = window.localStorage.getItem(PRICING_KEY);
    if (!raw) return { ...DEFAULT_PRICING };
    return { ...DEFAULT_PRICING, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_PRICING };
  }
}

export function savePricing(p: ElevenLabsPricingConfig): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PRICING_KEY, JSON.stringify(p));
  window.dispatchEvent(new CustomEvent(PRICING_EVENT, { detail: p }));
}

export function subscribePricing(cb: (p: ElevenLabsPricingConfig) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const detail = (e as CustomEvent<ElevenLabsPricingConfig>).detail;
    cb(detail ?? loadPricing());
  };
  window.addEventListener(PRICING_EVENT, handler);
  return () => window.removeEventListener(PRICING_EVENT, handler);
}
