import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type Lang = "fr" | "en" | "es" | "de";

export const LANGS: { code: Lang; label: string; flag: string }[] = [
  { code: "fr", label: "Français", flag: "🇫🇷" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "es", label: "Español", flag: "🇪🇸" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
];

const STRINGS: Record<string, Record<Lang, string>> = {
  searchPlaceholder: {
    fr: "Rechercher conversations, actus, apps…",
    en: "Search conversations, news, apps…",
    es: "Buscar conversaciones, noticias, apps…",
    de: "Konversationen, News, Apps suchen…",
  },
  newChat: { fr: "Nouveau chat", en: "New chat", es: "Nuevo chat", de: "Neuer Chat" },
  newChatTitle: {
    fr: "Démarrer une nouvelle conversation",
    en: "Start a new conversation",
    es: "Iniciar una nueva conversación",
    de: "Neue Konversation starten",
  },
  suggestions: { fr: "Suggestions", en: "Suggestions", es: "Sugerencias", de: "Vorschläge" },
  conversations: { fr: "Conversations", en: "Conversations", es: "Conversaciones", de: "Konversationen" },
  news: { fr: "Actualités", en: "News", es: "Noticias", de: "Nachrichten" },
  apps: {
    fr: "Applications (Windows)",
    en: "Applications (Windows)",
    es: "Aplicaciones (Windows)",
    de: "Anwendungen (Windows)",
  },
  launch: { fr: "Lancer", en: "Launch", es: "Iniciar", de: "Starten" },
  noResultsFor: {
    fr: "Aucun résultat pour",
    en: "No results for",
    es: "Sin resultados para",
    de: "Keine Ergebnisse für",
  },
  you: { fr: "Vous", en: "You", es: "Tú", de: "Du" },
  ai: { fr: "IA", en: "AI", es: "IA", de: "KI" },
  latestNews: { fr: "Dernières actus", en: "Latest news", es: "Últimas noticias", de: "Neueste Nachrichten" },
  articles: { fr: "articles", en: "articles", es: "artículos", de: "Artikel" },
  language: { fr: "Langue", en: "Language", es: "Idioma", de: "Sprache" },
  translating: { fr: "Traduction…", en: "Translating…", es: "Traduciendo…", de: "Übersetze…" },
  suggestion1: {
    fr: "Analyse les tendances du marché aujourd'hui",
    en: "Analyze today's market trends",
    es: "Analiza las tendencias del mercado de hoy",
    de: "Analysiere die heutigen Markttrends",
  },
  suggestion2: {
    fr: "Résume les dernières actus tech & IA",
    en: "Summarize the latest tech & AI news",
    es: "Resume las últimas noticias de tecnología e IA",
    de: "Fasse die neuesten Tech- und KI-News zusammen",
  },
  suggestion3: {
    fr: "Quelle est la situation actuelle du monde ?",
    en: "What is the current state of the world?",
    es: "¿Cuál es la situación actual del mundo?",
    de: "Wie ist die aktuelle Lage in der Welt?",
  },
  suggestion4: {
    fr: "Montre-moi les performances boursières",
    en: "Show me stock market performance",
    es: "Muéstrame el rendimiento bursátil",
    de: "Zeig mir die Börsenleistung",
  },
};

type Ctx = {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: keyof typeof STRINGS) => string;
};

const LanguageContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "app.lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    if (typeof window === "undefined") return "fr";
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    return saved && LANGS.some((l) => l.code === saved) ? saved : "fr";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang);
    document.documentElement.lang = lang;
  }, [lang]);

  const t = (key: keyof typeof STRINGS) => STRINGS[key]?.[lang] ?? STRINGS[key]?.fr ?? String(key);

  return (
    <LanguageContext.Provider value={{ lang, setLang: setLangState, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be used within LanguageProvider");
  return ctx;
}
