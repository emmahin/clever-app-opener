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
  // Settings
  settings: { fr: "Paramètres", en: "Settings", es: "Ajustes", de: "Einstellungen" },
  settingsSubtitle: {
    fr: "Personnalise ton expérience et le comportement de l'IA.",
    en: "Customize your experience and AI behavior.",
    es: "Personaliza tu experiencia y el comportamiento de la IA.",
    de: "Personalisiere dein Erlebnis und das KI-Verhalten.",
  },
  languageDesc: {
    fr: "Choisis la langue de l'interface, des réponses IA et des actualités traduites.",
    en: "Choose the language for the UI, AI replies and translated news.",
    es: "Elige el idioma de la interfaz, las respuestas IA y las noticias traducidas.",
    de: "Wähle die Sprache für UI, KI-Antworten und übersetzte News.",
  },
  aiBehavior: { fr: "IA & comportement", en: "AI & behavior", es: "IA y comportamiento", de: "KI & Verhalten" },
  aiBehaviorDesc: {
    fr: "Ajuste la façon dont l'IA répond et s'affiche.",
    en: "Tune how the AI responds and displays.",
    es: "Ajusta cómo responde y se muestra la IA.",
    de: "Stelle ein, wie die KI antwortet und angezeigt wird.",
  },
  detailLevel: { fr: "Niveau de détail", en: "Detail level", es: "Nivel de detalle", de: "Detailgrad" },
  detailLevelHint: {
    fr: "Court : 2-3 phrases. Normal : équilibré. Détaillé : analyse complète.",
    en: "Short: 2-3 sentences. Normal: balanced. Detailed: full analysis.",
    es: "Corto: 2-3 frases. Normal: equilibrado. Detallado: análisis completo.",
    de: "Kurz: 2-3 Sätze. Normal: ausgewogen. Detailliert: ausführlich.",
  },
  short: { fr: "Court", en: "Short", es: "Corto", de: "Kurz" },
  normal: { fr: "Normal", en: "Normal", es: "Normal", de: "Normal" },
  detailed: { fr: "Détaillé", en: "Detailed", es: "Detallado", de: "Detailliert" },
  typewriter: {
    fr: "Effet machine à écrire",
    en: "Typewriter effect",
    es: "Efecto máquina de escribir",
    de: "Schreibmaschinen-Effekt",
  },
  typewriterHint: {
    fr: "Affiche les réponses caractère par caractère.",
    en: "Display answers character by character.",
    es: "Muestra las respuestas carácter por carácter.",
    de: "Antworten Zeichen für Zeichen anzeigen.",
  },
  personalization: {
    fr: "Personnalisation",
    en: "Personalization",
    es: "Personalización",
    de: "Personalisierung",
  },
  personalizationDesc: {
    fr: "Donne un nom à l'IA et ajoute tes propres instructions persistantes.",
    en: "Give the AI a name and add your own persistent instructions.",
    es: "Pon nombre a la IA y añade tus propias instrucciones persistentes.",
    de: "Gib der KI einen Namen und füge persistente Anweisungen hinzu.",
  },
  aiName: { fr: "Nom de l'IA", en: "AI name", es: "Nombre de la IA", de: "KI-Name" },
  aiNamePlaceholder: { fr: "ex. Nova", en: "e.g. Nova", es: "ej. Nova", de: "z.B. Nova" },
  customInstructions: {
    fr: "Instructions personnalisées",
    en: "Custom instructions",
    es: "Instrucciones personalizadas",
    de: "Eigene Anweisungen",
  },
  customInstructionsPlaceholder: {
    fr: "Ex. Je suis trader, donne-moi toujours des chiffres précis. Réponds avec un ton direct et sans formules de politesse.",
    en: "e.g. I'm a trader, always give me precise numbers. Be direct, skip pleasantries.",
    es: "ej. Soy trader, dame siempre cifras precisas. Sé directo, sin cortesías.",
    de: "z.B. Ich bin Trader, gib mir präzise Zahlen. Direkt, ohne Floskeln.",
  },
  customInstructionsHint: {
    fr: "Ces consignes seront ajoutées à chaque conversation.",
    en: "These guidelines will be added to every conversation.",
    es: "Estas pautas se añadirán a cada conversación.",
    de: "Diese Richtlinien werden jeder Konversation hinzugefügt.",
  },
  privacy: { fr: "Confidentialité", en: "Privacy", es: "Privacidad", de: "Datenschutz" },
  privacyDesc: {
    fr: "Gère les données stockées localement dans ton navigateur.",
    en: "Manage data stored locally in your browser.",
    es: "Gestiona los datos almacenados localmente en tu navegador.",
    de: "Verwalte lokal in deinem Browser gespeicherte Daten.",
  },
  clearCache: {
    fr: "Vider le cache de traduction",
    en: "Clear translation cache",
    es: "Vaciar caché de traducción",
    de: "Übersetzungs-Cache leeren",
  },
  resetSettings: {
    fr: "Réinitialiser les paramètres",
    en: "Reset settings",
    es: "Restablecer ajustes",
    de: "Einstellungen zurücksetzen",
  },
  save: { fr: "Enregistrer", en: "Save", es: "Guardar", de: "Speichern" },
  cancel: { fr: "Annuler", en: "Cancel", es: "Cancelar", de: "Abbrechen" },
  settingsSaved: {
    fr: "Paramètres enregistrés",
    en: "Settings saved",
    es: "Ajustes guardados",
    de: "Einstellungen gespeichert",
  },
  settingsReset: {
    fr: "Paramètres réinitialisés",
    en: "Settings reset",
    es: "Ajustes restablecidos",
    de: "Einstellungen zurückgesetzt",
  },
  cacheCleared: {
    fr: "Cache vidé",
    en: "Cache cleared",
    es: "Caché vaciada",
    de: "Cache geleert",
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
