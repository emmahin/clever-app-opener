

## Objectif
Réduire drastiquement la consommation de tokens lors du **montage vidéo automatique** (« monte tout seul » et autres commandes), en appliquant la même stratégie que pour les Documents : **moteur local gratuit** pour le montage, **IA uniquement pour l'explication** (~150 tokens).

## Diagnostic de la consommation actuelle
Aujourd'hui chaque message envoyé à `video-editor-agent` :
- Envoie tout l'état de la timeline (clips, durées, overlays, audios) à Gemini-2.5-flash
- Boucle jusqu'à 3 tours avec tool-calls (apply_actions + search_pixabay_audio)
- Renvoie un message + un tableau d'actions
→ Coût : **2 000 à 5 000 tokens par requête**, et beaucoup plus pour « monte tout seul » qui peut déclencher plusieurs aller-retours.

## Solution : moteur de montage 100 % local + IA pédagogique

### 1. Nouveau moteur local `src/lib/localVideoEditor.ts` (0 token)
Un module TypeScript pur qui prend l'état de la timeline et applique des règles de montage déterministes :

- **Auto-montage (« monte tout seul »)** :
  - Tri des clips par ordre d'import (ou alphabétique)
  - Trim automatique des silences en début/fin (10 % par défaut)
  - Limitation de durée par clip selon le preset (ex. Reels = 3-5 s/clip, YouTube = 8-15 s)
  - Ajout d'un texte d'intro sur le premier clip (nom du projet)
  - Ajout d'un fondu sortie sur le dernier clip
- **Commandes simples reconnues par regex/mots-clés** :
  - « coupe le clip X à Ys » → action `trim`
  - « supprime le clip X » → `remove_clip`
  - « réordonne X en position Y » → `reorder`
  - « ajoute le texte "..." sur clip X » → `add_text`
  - « format reels / youtube » → `set_format`
- **Recherche musique** : appel direct à `pixabay-search` (déjà gratuit, pas de token IA) avec mots-clés extraits localement.

Renvoie `{ actions: Action[], rulesApplied: string[], stats: {...} }`.

### 2. Nouvelle Edge Function `supabase/functions/explain-video-edit/index.ts` (~150 tokens)
Reçoit uniquement les **statistiques agrégées** (nb clips coupés, durée totale, format, musique ajoutée, règles appliquées) et demande à Gemini-2.5-flash-**lite** une explication pédagogique courte en français (4-6 phrases). Aucune donnée de timeline complète envoyée.

### 3. IA en fallback uniquement (optionnel, désactivable)
Si la commande utilisateur n'est reconnue par aucune règle locale, un toggle « Mode IA avancé » (off par défaut) permet d'envoyer la requête à l'agent Gemini actuel. Sinon, message clair : *« Commande non reconnue. Essaie : "monte tout seul", "coupe clip 1 à 5s"… »*.

### 4. Modifications de `src/pages/VideoEditor.tsx`
- Remplacer l'appel `fetch(AGENT_URL, ...)` par :
  1. Tentative de match local via `localVideoEditor.parseCommand(input, state)`
  2. Application immédiate des actions sur la timeline (0 token)
  3. Appel à `explain-video-edit` pour générer le résumé pédagogique (~150 tokens)
- Ajouter un badge **« Montage local »** + petit texte expliquant l'économie de tokens
- Afficher un loader « L'IA rédige son explication… » pendant l'étape 3
- Garder le `TokenCounter` à côté du bouton Envoyer pour visualiser le gain

### 5. UX cohérente avec la page Documents
- Même pattern visuel (badge vert « Tri/Montage local », texte d'info)
- Toggle optionnel « Mode IA avancé » pour les cas complexes
- Possibilité future d'ajouter un champ « règles personnalisées » comme pour Documents (ex. *« coupe clips > 10s »*)

## Gain attendu
| Action | Avant | Après |
|---|---|---|
| « monte tout seul » | 3 000-5 000 tokens | ~150 tokens (×20-30 moins) |
| « coupe clip 1 à 5s » | ~1 500 tokens | ~150 tokens |
| Recherche musique | ~2 000 tokens | 0 token (Pixabay direct) |

## Fichiers impactés
- **Créé** : `src/lib/localVideoEditor.ts` (parseur + moteur de règles)
- **Créé** : `supabase/functions/explain-video-edit/index.ts`
- **Édité** : `src/pages/VideoEditor.tsx` (handler chat, UI badge/toggle)
- **Conservé** : `supabase/functions/video-editor-agent/index.ts` (utilisé seulement en mode IA avancé)

