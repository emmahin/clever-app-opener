---
name: Service layer rules
description: Règles strictes de séparation front/services et plan de portage vers VSCode + utilitaire Windows
type: preference
---

## Règles
1. Aucun composant React n'importe `@/integrations/supabase/client` directement, ni n'appelle `fetch`/`navigator.mediaDevices`/etc. Il importe UNIQUEMENT depuis `@/services`.
2. Chaque service expose une **interface** (`IChatService`, `IVoiceService`, `INewsService`, `IAppLauncherService`) + au moins une implémentation.
3. Le fichier `src/services/index.ts` est le **seul point de swap** : il choisit l'impl active. Les composants importent `chatService`, `voiceService`, etc. depuis `@/services`.
4. Toute nouvelle fonctionnalité backend → créer/étendre un service avant d'écrire le composant.

## Plan de portage VSCode → Windows
- `appLauncherService` : remplacer `mockAppLauncherService` par une impl reliée à l'utilitaire Windows (Electron IPC, native messaging, ou REST localhost). Aucun composant ne change.
- `voiceService` : peut rester web (MediaRecorder) ou être remplacé par une capture native côté Electron.
- `chatService` : peut continuer à appeler la edge function, ou être remplacé par un appel direct à l'API ChatGPT côté main process Electron (clé en local).

**Why:** Le projet sera basculé vers VSCode pour ajouter une couche desktop (lancement d'applications Windows). Sans cette discipline, le portage forcerait une réécriture du front.

**How to apply:** Avant chaque modif touchant des données/IO, demander : "ce code peut-il être appelé depuis un Electron renderer aussi bien qu'un navigateur web ?". Si non → refactorer en service.
