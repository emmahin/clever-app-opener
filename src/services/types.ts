export type ChatRole = "user" | "assistant" | "system";

export type ChatWidget =
  | { type: "news"; items: NewsItem[] }
  | { type: "stocks"; items: Stock[] }
  | { type: "image"; url: string; prompt: string }
  | { type: "image_gallery"; query: string; items: GalleryImage[] }
  | { type: "videos"; query?: string; items: VideoItem[] }
  | { type: "web_sources"; items: WebSource[] }
  | { type: "chart"; chart: ChartSpec }
  | { type: "whatsapp_send"; contact_name: string; body: string }
  | { type: "reminder_created"; title: string; body?: string; when_iso: string }
  | { type: "insight_created"; title: string; body: string }
  | {
      type: "open_app";
      app_id?: string;
      app_name: string;
      kind: "internal" | "web" | "deeplink";
      target: string;
      fallback_url?: string;
      auto_opened: boolean; // true si déjà ouvert automatiquement (route interne)
    }
  | {
      type: "schedule";
      range_label?: string;
      range_start_iso?: string;
      range_end_iso?: string;
      added?: { title: string; start_iso: string; end_iso?: string; location?: string; notes?: string };
      remove_query?: string;
    }
  | {
      type: "launch_local_app";
      target: string;
      args?: string[];
      label?: string; // nom lisible pour l'UI (ex: "Notepad")
    }
  | {
      type: "organize_files";
      root_name: string;
      total: number;
      categories: Record<string, number>;
      mapping: { from: string; to: string }[];
      explanation?: string;
    };

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  widgets?: ChatWidget[];
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary?: string;
  image?: string;
  category?: string;
}

export interface WebSource {
  title: string;
  url: string;
  snippet?: string;
}

export interface GalleryImage {
  id: string;
  thumb: string;
  full: string;
  page?: string;
  tags?: string;
  user?: string;
  width?: number;
  height?: number;
}

export interface VideoItem {
  id: string;
  provider: "youtube" | "vimeo" | "tiktok" | "instagram" | "twitter" | "direct";
  videoId?: string;
  title: string;
  author?: string;
  thumbnail?: string;
  embedUrl: string;
  pageUrl: string;
  duration?: string;
}

export interface StockPoint {
  date: string;
  close: number;
}

export type ChartKind = "line" | "bar" | "pie" | "area";

export interface ChartSeries {
  name: string;
  /** Optional explicit color override (HSL string). If omitted, theme palette is used. */
  color?: string;
}

/**
 * Spec for an inline chart rendered in chat.
 * - For line/bar/area: `data` is an array of objects keyed by `xKey` and one entry per series name.
 *   Example: { month: "Jan", revenue: 120, costs: 80 }, series=[{name:"revenue"},{name:"costs"}], xKey="month"
 * - For pie: `data` is an array of `{ name, value }`. xKey/series are ignored.
 */
export interface ChartSpec {
  kind: ChartKind;
  title?: string;
  subtitle?: string;
  xKey?: string;
  yLabel?: string;
  series?: ChartSeries[];
  data: Array<Record<string, string | number>>;
}

export interface Stock {
  symbol: string;
  name: string;
  currency: string;
  price: number;
  changePct: number;
  series: StockPoint[];
}

export interface AppDescriptor {
  id: string;
  name: string;
  iconHint?: string;
}

export interface AppLaunchResult {
  ok: boolean;
  message: string;
}
