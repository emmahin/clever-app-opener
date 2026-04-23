---
name: Local PC agent
description: Agent Python FastAPI sur 127.0.0.1:17345 pour ouvrir des apps natives Windows depuis l'IA
type: feature
---

## Composants
- `local-agent/agent.py` — FastAPI, écoute sur 127.0.0.1:17345, auth Bearer (`NEX_AGENT_TOKEN`), endpoints `/ping` et `/launch`. Utilise `os.startfile` (Windows), `open` (macOS), `xdg-open` (Linux), avec fallback `shutil.which` puis `start` shell sur Windows.
- `src/services/localAgentService.ts` — service unique côté web. Config (URL/token/enabled) en `localStorage` clé `nex.localAgent.config.v1`. Méthodes `loadConfig`, `saveConfig`, `isConfigured`, `ping`, `launch`.
- `src/components/chatbot/LocalAgentSection.tsx` — UI dans Paramètres pour configurer + tester.
- `src/components/chatbot/widgets/LocalAppLaunchWidget.tsx` — widget chat qui appelle l'agent automatiquement quand l'IA renvoie `launch_local_app`.
- Outil IA `launch_local_app` ajouté dans `supabase/functions/ai-orchestrator/index.ts`. La edge function NE PEUT PAS joindre l'agent (le 127.0.0.1 c'est le PC user) — elle émet juste le widget, c'est le navigateur qui appelle l'agent.

## Flux d'appel
`Chat user → orchestrator (tool) → widget launch_local_app → fetch http://127.0.0.1:17345/launch (Bearer) → os.startfile`

## Sécurité
- Listening 127.0.0.1 only.
- Bearer token obligatoire (`NEX_AGENT_TOKEN`).
- CORS limité à `*.lovable.app`, `*.lovableproject.com`, localhost.
- Allowlist optionnelle via `NEX_AGENT_ALLOWLIST`.
- Chrome autorise les requêtes HTTPS → `http://127.0.0.1` (potentially trustworthy origin), Firefox/Safari peuvent bloquer.

## Why
Le navigateur ne peut pas lancer d'apps natives (sandbox). L'agent Python est le seul pont possible avant le portage Electron prévu.

## How to apply
- Toute modif liée à l'ouverture d'apps PC passe par ces 5 fichiers.
- Ne JAMAIS appeler l'agent depuis une edge function : le 127.0.0.1 vu côté Supabase n'est pas celui de l'utilisateur.
- Garder la règle service layer : aucun composant n'appelle `fetch` directement vers l'agent, tout passe par `localAgentService`.