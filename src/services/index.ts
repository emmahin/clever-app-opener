/**
 * Point d'entrée unique du service layer.
 * Pour basculer vers une impl desktop, modifier UNIQUEMENT ce fichier.
 */
export { webChatService as chatService } from "./chatService";
export type { ChatAttachment } from "./chatService";
export { webVoiceService as voiceService } from "./voiceService";
export { rssNewsService as newsService } from "./newsService";
export { yahooStockService as stockService } from "./stockService";
export {
  APP_CATALOG,
  findAppInCatalog,
  openAppTarget,
  buildAppCatalogHint,
} from "./appLauncherService";
export type { AppEntry, AppKind } from "./appLauncherService";
export { localAgentService } from "./localAgentService";
export type {
  ILocalAgentService,
  LocalAgentConfig,
  LocalAgentPing,
  LaunchResult,
  DetectedApp,
  ListAppsResult,
  CachedApps,
} from "./localAgentService";
export { n8nService } from "./n8nService";
export type { IN8nService, N8nConfig, N8nAction, N8nTriggerResult } from "./n8nService";
export { twinMemoryService } from "./twinMemoryService";
export type {
  ITwinMemoryService,
  UserMemory,
  MemoryCategory,
  ConversationSummary,
  ScheduleEventDB,
} from "./twinMemoryService";
export { googleCalendarService } from "./googleCalendarService";
export type { GCalStatus, GCalSyncResult } from "./googleCalendarService";
export { moodService } from "./moodService";
export type { Mood, MoodEntry, MoodInsight, InsightCategory } from "./moodService";
export * from "./types";
