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
} from "./localAgentService";
export * from "./types";
