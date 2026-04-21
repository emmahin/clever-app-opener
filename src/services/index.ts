/**
 * Point d'entrée unique du service layer.
 * Pour basculer vers une impl desktop, modifier UNIQUEMENT ce fichier.
 */
export { webChatService as chatService } from "./chatService";
export { webVoiceService as voiceService } from "./voiceService";
export { mockNewsService as newsService } from "./newsService";
export { mockAppLauncherService as appLauncherService } from "./appLauncherService";
export * from "./types";
