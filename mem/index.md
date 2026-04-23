# Project Memory

## Core
Architecture STRICTE : front (src/components, src/pages) ne fait JAMAIS d'appel direct à fetch/Supabase/Web APIs natives. Tout passe par `src/services/` (interfaces typées + impls swappables).
Cible de portage : VSCode + utilitaire Windows local pour l'indexation/lancement d'applications. Penser desktop-friendly.
Design : thème sombre violet/magenta, sidebar gradient violet→rose, glow radial, glassmorphism. Police par défaut. Pas de mode clair/dark switch.
Backend IA : Lovable AI Gateway (google/gemini-3-flash-preview par défaut) via edge function `ai-chat` en SSE streaming.
Voix : OpenAI Whisper via edge function `voice-transcribe` (clé OPENAI_API_KEY).
Actus IA : mock statique pour l'instant (`mockNewsService`).

## Memories
- [Service layer rules](mem://architecture/service-layer) — règles de séparation front/services et plan de portage VSCode/Windows
- [Local Agent](mem://architecture/local-agent) — agent Python FastAPI sur le PC pour ouvrir des apps natives
