export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary?: string;
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
