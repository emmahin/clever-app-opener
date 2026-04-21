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
  // App / Index
  appTitle: { fr: "Chatbot IA", en: "AI Chatbot", es: "Chatbot IA", de: "KI-Chatbot" },
  appSubtitle: {
    fr: "Pose toutes tes questions sur tes données et analyses",
    en: "Ask anything about your data and analytics",
    es: "Pregunta lo que quieras sobre tus datos y análisis",
    de: "Frag alles über deine Daten und Analysen",
  },
  fullscreen: { fr: "Plein écran", en: "Fullscreen", es: "Pantalla completa", de: "Vollbild" },
  options: { fr: "Options", en: "Options", es: "Opciones", de: "Optionen" },
  assistantReady: {
    fr: "Ton assistant IA est prêt",
    en: "Your AI assistant is ready",
    es: "Tu asistente IA está listo",
    de: "Dein KI-Assistent ist bereit",
  },
  tryAsking: { fr: "Essaie de demander :", en: "Try asking:", es: "Prueba a preguntar:", de: "Frag doch:" },
  inputHint: {
    fr: "Clique sur + pour joindre · micro pour la voix · survole les messages pour éditer/copier",
    en: "Click + to attach · use mic for voice · hover messages to edit/copy",
    es: "Pulsa + para adjuntar · micro para voz · pasa el ratón para editar/copiar",
    de: "+ zum Anhängen · Mikro für Sprache · über Nachrichten schweben zum Bearbeiten/Kopieren",
  },
  askAnything: { fr: "Pose ta question…", en: "Ask anything…", es: "Pregunta lo que quieras…", de: "Frag etwas…" },
  stopRecording: { fr: "Arrêter l'enregistrement", en: "Stop recording", es: "Detener grabación", de: "Aufnahme stoppen" },
  startVoice: { fr: "Saisie vocale", en: "Start voice input", es: "Entrada de voz", de: "Spracheingabe starten" },
  thinking: { fr: "Réflexion en cours", en: "Thinking", es: "Pensando", de: "Denke nach" },
  capitalRising: { fr: "Capital qui explose", en: "Trending stocks", es: "Capital al alza", de: "Trend-Aktien" },
  clear: { fr: "Effacer", en: "Clear", es: "Borrar", de: "Löschen" },
  attachFile: { fr: "Joindre un fichier", en: "Attach a file", es: "Adjuntar archivo", de: "Datei anhängen" },
  attachImage: { fr: "Joindre une image", en: "Attach an image", es: "Adjuntar imagen", de: "Bild anhängen" },
  webSearch: { fr: "Recherche web", en: "Web search", es: "Búsqueda web", de: "Websuche" },
  webSearchOn: { fr: "Recherche web : ON", en: "Web search: ON", es: "Búsqueda web: ON", de: "Websuche: AN" },
  webSearchOff: { fr: "Activer la recherche web", en: "Enable web search", es: "Activar búsqueda web", de: "Websuche aktivieren" },
  aiTools: { fr: "Outils IA", en: "AI tools", es: "Herramientas IA", de: "KI-Werkzeuge" },
  codeMode: { fr: "Mode code", en: "Code mode", es: "Modo código", de: "Code-Modus" },
  toolDeepThink: { fr: "Deep Think", en: "Deep Think", es: "Deep Think", de: "Deep Think" },
  toolDeepThinkHint: {
    fr: "Raisonnement approfondi (plus lent, plus précis)",
    en: "Deep reasoning (slower, more accurate)",
    es: "Razonamiento profundo (más lento, más preciso)",
    de: "Tiefes Denken (langsamer, präziser)",
  },
  toolImage: { fr: "Générer une image", en: "Generate image", es: "Generar imagen", de: "Bild generieren" },
  toolImageHint: {
    fr: "L'IA crée une image qui colle à ta demande",
    en: "AI creates an image matching your prompt",
    es: "La IA crea una imagen según tu petición",
    de: "KI erstellt ein Bild zu deiner Anfrage",
  },
  toolCode: { fr: "Générer du code", en: "Generate code", es: "Generar código", de: "Code generieren" },
  toolCodeHint: {
    fr: "Réponse formatée avec blocs de code propres",
    en: "Reply formatted with clean code blocks",
    es: "Respuesta con bloques de código limpios",
    de: "Antwort mit sauberen Code-Blöcken",
  },
  voiceCall: { fr: "Mode vocal", en: "Voice mode", es: "Modo voz", de: "Sprachmodus" },
  voiceCallTitle: { fr: "Conversation vocale", en: "Voice conversation", es: "Conversación de voz", de: "Sprachkonversation" },
  voiceListening: { fr: "Je t'écoute…", en: "Listening…", es: "Escuchando…", de: "Höre zu…" },
  voiceThinking: { fr: "Je réfléchis…", en: "Thinking…", es: "Pensando…", de: "Denke nach…" },
  voiceIdle: { fr: "Connexion…", en: "Connecting…", es: "Conectando…", de: "Verbinde…" },
  voiceSendTurn: { fr: "Envoyer", en: "Send", es: "Enviar", de: "Senden" },
  voiceInterrupt: { fr: "Interrompre", en: "Interrupt", es: "Interrumpir", de: "Unterbrechen" },
  voiceHangUp: { fr: "Raccrocher", en: "Hang up", es: "Colgar", de: "Auflegen" },
  processingFile: { fr: "Analyse du fichier…", en: "Processing file…", es: "Procesando archivo…", de: "Datei wird verarbeitet…" },
  fileError: { fr: "Erreur fichier", en: "File error", es: "Error de archivo", de: "Dateifehler" },
  remove: { fr: "Retirer", en: "Remove", es: "Quitar", de: "Entfernen" },
  attachmentsHint: {
    fr: "Images, audios et documents (PDF, TXT, MD, CSV, JSON) acceptés.",
    en: "Images, audio and documents (PDF, TXT, MD, CSV, JSON) supported.",
    es: "Se admiten imágenes, audios y documentos (PDF, TXT, MD, CSV, JSON).",
    de: "Bilder, Audio und Dokumente (PDF, TXT, MD, CSV, JSON) werden unterstützt.",
  },
  // News categories
  cat_top: { fr: "À la une", en: "Top stories", es: "Destacados", de: "Schlagzeilen" },
  cat_tech: { fr: "Tech & IA", en: "Tech & AI", es: "Tech e IA", de: "Tech & KI" },
  cat_econ: { fr: "Économie", en: "Economy", es: "Economía", de: "Wirtschaft" },
  cat_intl: { fr: "International", en: "International", es: "Internacional", de: "International" },
  cat_default: { fr: "Actualités", en: "News", es: "Noticias", de: "Nachrichten" },
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
