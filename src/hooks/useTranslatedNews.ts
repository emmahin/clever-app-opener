import { useEffect, useMemo, useState } from "react";
import { NewsItem } from "@/services";
import { useLanguage } from "@/i18n/LanguageProvider";
import { translateBatch } from "@/services/translationService";

/**
 * Returns the news translated into the current language.
 * - FR: returns originals (no-op).
 * - Other: translates title + summary in batch with cache (1h).
 */
export function useTranslatedNews(news: NewsItem[]): { news: NewsItem[]; translating: boolean } {
  const { lang } = useLanguage();
  const [translated, setTranslated] = useState<NewsItem[]>(news);
  const [translating, setTranslating] = useState(false);

  // Stable signature so we don't re-trigger on identical arrays
  const signature = useMemo(() => news.map((n) => n.id).join("|"), [news]);

  useEffect(() => {
    let cancelled = false;
    if (lang === "fr" || news.length === 0) {
      setTranslated(news);
      setTranslating(false);
      return;
    }
    setTranslating(true);
    // Build flat list: title + summary per item
    const inputs: string[] = [];
    news.forEach((n) => {
      inputs.push(n.title || "");
      inputs.push(n.summary || "");
    });
    translateBatch(inputs, lang).then((out) => {
      if (cancelled) return;
      const next = news.map((n, i) => ({
        ...n,
        title: out[i * 2] || n.title,
        summary: out[i * 2 + 1] || n.summary,
      }));
      setTranslated(next);
      setTranslating(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, lang]);

  return { news: translated, translating };
}
