import type { WidgetMeta, WidgetKind } from "./types";
import { WelcomeWidget } from "./WelcomeWidget";
import { VoiceQuotaWidget } from "./VoiceQuotaWidget";
import { ClockWidget } from "./ClockWidget";
import { SystemStatusWidget } from "./SystemStatusWidget";
import { ShortcutsWidget } from "./ShortcutsWidget";
import { NewsTickerWidget } from "./NewsTickerWidget";
import { StocksWidget } from "./StocksWidget";

export const WIDGET_REGISTRY: Record<WidgetKind, WidgetMeta> = {
  welcome: {
    kind: "welcome",
    title: "Salutation",
    description: "Message d'accueil personnalisé",
    defaultW: 4, defaultH: 3, minW: 3, minH: 2,
    Component: WelcomeWidget,
  },
  voiceQuota: {
    kind: "voiceQuota",
    title: "Quota Voix",
    description: "Utilisation du quota ElevenLabs en temps réel",
    defaultW: 3, defaultH: 4, minW: 2, minH: 3,
    Component: VoiceQuotaWidget,
  },
  clock: {
    kind: "clock",
    title: "Horloge",
    description: "Heure et date système",
    defaultW: 3, defaultH: 3, minW: 2, minH: 2,
    Component: ClockWidget,
  },
  systemStatus: {
    kind: "systemStatus",
    title: "Statut Système",
    description: "FPS, latence, mémoire, réseau",
    defaultW: 4, defaultH: 3, minW: 3, minH: 2,
    Component: SystemStatusWidget,
  },
  shortcuts: {
    kind: "shortcuts",
    title: "Raccourcis",
    description: "Accès rapide aux modules",
    defaultW: 4, defaultH: 3, minW: 3, minH: 2,
    Component: ShortcutsWidget,
  },
  news: {
    kind: "news",
    title: "Flux Actualités",
    description: "Top 5 articles tech & monde",
    defaultW: 4, defaultH: 5, minW: 3, minH: 3,
    Component: NewsTickerWidget,
  },
  stocks: {
    kind: "stocks",
    title: "Marchés",
    description: "Cours et tendance des actions suivies",
    defaultW: 4, defaultH: 5, minW: 3, minH: 3,
    Component: StocksWidget,
  },
};

export const WIDGET_LIST: WidgetMeta[] = Object.values(WIDGET_REGISTRY);