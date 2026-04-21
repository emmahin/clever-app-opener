# Service Layer

**Règle stricte : la couche front (composants React) NE DOIT JAMAIS appeler directement
Supabase, fetch, Web APIs natives, ou des modules backend. Elle passe TOUJOURS par
les services typés exposés ici.**

## Pourquoi
Cette appli est destinée à être portée vers VSCode + un utilitaire Windows local
(indexation/lancement d'applications). Le service layer permet de remplacer une
implémentation web par une implémentation desktop (IPC, native messaging, REST
local…) sans toucher au front.

## Structure
- `types.ts` — types/interfaces partagés (Message, NewsItem, AppDescriptor…)
- `chatService.ts` — interface `IChatService` + `webChatService` (Lovable AI)
- `voiceService.ts` — interface `IVoiceService` + `webVoiceService` (Whisper edge fn)
- `newsService.ts` — interface `INewsService` + `mockNewsService`
- `appLauncherService.ts` — interface `IAppLauncherService` + `mockAppLauncherService`
  (à remplacer côté VSCode par un launcher branché sur l'utilitaire Windows)
- `index.ts` — exporte les implémentations actives (point de swap unique)

## Comment porter vers desktop
1. Créer une nouvelle impl, ex. `desktopAppLauncherService.ts`, qui satisfait
   `IAppLauncherService` (via `window.electron.ipcRenderer` ou similaire).
2. Modifier `src/services/index.ts` pour exporter cette impl à la place.
3. Aucun composant React ne change.
