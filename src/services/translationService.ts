import type { Lang } from "@/i18n/LanguageProvider";

const URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/translate`;
const TTL_MS = 60 * 60 * 1000; // 1h
const STORAGE_KEY = "translations.cache.v1";

type CacheEntry = { value: string; t: number };
type CacheShape = Record<string, CacheEntry>; // key = `${lang}::${text}`

function loadCache(): CacheShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as CacheShape;
  } catch {
    return {};
  }
}

function saveCache(c: CacheShape) {
  try {
    // Cap cache size (keep last 500 entries)
    const entries = Object.entries(c);
    if (entries.length > 500) {
      entries.sort((a, b) => b[1].t - a[1].t);
      const trimmed = Object.fromEntries(entries.slice(0, 500));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    }
  } catch {
    /* quota exceeded — ignore */
  }
}

const cache: CacheShape = loadCache();

function k(lang: Lang, text: string) {
  return `${lang}::${text}`;
}

/**
 * Translate a batch of strings into target language.
 * - FR is treated as the source/no-op for now (news are mostly FR/EN; EN→FR roundtrip not needed).
 * - Cached per (lang, text) for 1h.
 */
export async function translateBatch(texts: string[], target: Lang): Promise<string[]> {
  if (target === "fr") return texts; // assume base FR, no-op
  const now = Date.now();

  // Determine cache hits / misses
  const out: string[] = new Array(texts.length);
  const missIdx: number[] = [];
  const missTexts: string[] = [];
  texts.forEach((text, i) => {
    if (!text || !text.trim()) {
      out[i] = text;
      return;
    }
    const hit = cache[k(target, text)];
    if (hit && now - hit.t < TTL_MS) {
      out[i] = hit.value;
    } else {
      missIdx.push(i);
      missTexts.push(text);
    }
  });

  if (missTexts.length === 0) return out;

  try {
    const r = await fetch(URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ texts: missTexts, target }),
    });
    if (!r.ok) throw new Error(`translate ${r.status}`);
    const data = await r.json();
    const translations: string[] = data.translations || [];
    missIdx.forEach((origIdx, i) => {
      const tr = translations[i] ?? texts[origIdx];
      out[origIdx] = tr;
      cache[k(target, texts[origIdx])] = { value: tr, t: now };
    });
    saveCache(cache);
    return out;
  } catch (e) {
    console.error("translateBatch error:", e);
    // Fallback: return originals so UI never breaks
    missIdx.forEach((origIdx) => (out[origIdx] = texts[origIdx]));
    return out;
  }
}
