export type ChatRole = "user" | "assistant" | "system";

export type ChatWidget =
  | { type: "news"; items: NewsItem[] }
  | { type: "stocks"; items: Stock[] }
  | { type: "image"; url: string; prompt: string }
  | { type: "image_gallery"; query: string; items: GalleryImage[] }
  | { type: "videos"; query?: string; items: VideoItem[] }
  | { type: "web_sources"; items: WebSource[] };

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
