/**
 * Point d'entrée unique du service layer.
 * Pour basculer vers une impl desktop, modifier UNIQUEMENT ce fichier.
 */
export { webChatService as chatService } from "./chatService";
export { webVoiceService as voiceService } from "./voiceService";
export { rssNewsService as newsService } from "./newsService";
export { yahooStockService as stockService } from "./stockService";
export { mockAppLauncherService as appLauncherService } from "./appLauncherService";
export * from "./types";
