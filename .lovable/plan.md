# Plan — Diagnostic de la clé OpenAI

## Objectif

Créer un outil pour voir exactement à quoi votre clé `OPENAI_API_KEY` (celle de platform.openai.com, avec ses règles de projet) a accès : liste des modèles, accès Whisper, accès TTS, accès Chat Completions.

## Ce qui existe déjà (rappel)

- `**voice-tts**` = seule fonction qui parle directement à `api.openai.com` avec votre clé. C'est elle qui plante avec `model_not_found`.
- Tout le reste (chat, transcription, traduction…) passe par **Lovable AI Gateway**, donc ne touche pas à votre clé OpenAI.
- Aucune fonction d'introspection n'existe.

## Ce qu'on va construire

### 1. Nouvelle edge function `openai-diagnostics`

Fichier : `supabase/functions/openai-diagnostics/index.ts`

Appelle directement l'API OpenAI avec votre `OPENAI_API_KEY` (jamais Lovable AI Gateway) et retourne un rapport JSON :

- `**GET /v1/models**` → liste complète des modèles accessibles à la clé, regroupés par famille :
  - Chat (`gpt-4o`, `gpt-4o-mini`, `gpt-4-turbo`, `gpt-3.5-*`, `o1-*`, `gpt-5-*`…)
  - Audio TTS (`tts-1`, `tts-1-hd`, `gpt-4o-mini-tts`…)
  - Audio STT / Whisper (`whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`…)
  - Embeddings, Images, Moderation, Realtime, autres
- **Tests d'accès réels** (probe minimal pour distinguer "listé" vs "vraiment utilisable") :
  - Test Whisper : POST minimal sur `/v1/audio/transcriptions` avec un mini buffer audio silencieux → on regarde si on récupère 200, 401, 403 ou `model_not_found`.
  - Test TTS : POST sur `/v1/audio/speech` avec `tts-1` + 1 mot → idem.
  - Test Chat : POST sur `/v1/chat/completions` avec `gpt-4o-mini` + 1 token max.
- Renvoie pour chaque test : `{ ok: boolean, status: number, errorCode?: string, errorMessage?: string }`.

Auth : la fonction exige un JWT utilisateur valide (lecture du header `Authorization`) pour éviter qu'un visiteur anonyme l'utilise pour pinger OpenAI à votre place.

### 2. Nouvelle page front `/openai-diagnostics`

Fichier : `src/pages/OpenAIDiagnostics.tsx` + route ajoutée dans `src/App.tsx`.

Interface simple (shadcn `Card` + `Badge` + `Button`) , accessible meme sans être logué (pour l'instant) :

- Bouton **« Lancer le diagnostic »** qui appelle `supabase.functions.invoke("openai-diagnostics")`.
- Affichage :
  - **Bandeau de capacités** : 4 badges colorés (Chat / Whisper / TTS / Embeddings) → vert si accessible, rouge sinon, avec le message d'erreur OpenAI exact en tooltip.
  - **Tableau des modèles** : liste complète retournée par `/v1/models`, groupée par catégorie, avec ID + date de création + propriétaire.
  - **Détails bruts** : section pliable avec la réponse JSON complète pour debug.
- État de chargement et gestion d'erreur propre (clé absente, 401, réseau).

### 3. Accès à la page

Ajouter un lien discret dans la sidebar (ou via une URL directe `/openai-diagnostics`). Dites-moi votre préférence si vous voulez un emplacement précis — sinon je la mets en accès direct par URL + lien dans Settings.

## Détails techniques

- Pas de modification de `voice-tts` dans ce plan — on traite d'abord le diagnostic. Une fois que vous saurez quels modèles TTS sont réellement accessibles à votre clé, on ajustera `voice-tts` pour n'utiliser que ceux-là (ou on basculera la transcription vers Whisper si vous y avez accès).
- Aucune utilisation du Lovable AI Gateway dans cette nouvelle fonction.
- CORS standard, `verify_jwt = false` côté config (la fonction valide le JWT manuellement) — cohérent avec les autres fonctions du projet.
- Aucune migration DB nécessaire.

## Livrable

Après approbation :

1. Edge function `openai-diagnostics` déployée.
2. Page `/openai-diagnostics` accessible et fonctionnelle.
3. Vous pourrez voir en un clic : liste exacte des modèles + statut Whisper/TTS/Chat derrière votre clé.