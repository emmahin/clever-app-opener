## Audit complet du projet

Voici tout ce qui ne va pas, classé par gravité, avec ce qui consomme tes crédits IA Lovable et ce qui ne s'enregistre nulle part.

---

### 🔴 PRIORITÉ 1 — Persistance manquante (perte de données au refresh)

**1. Historique de chat (Page principale `/`)**

- Fichier : `src/pages/Index.tsx` ligne 130 → `useState<ChatMessage[]>([])`
- Problème : **les messages ne sont stockés QUE en mémoire React**. Tu rafraîchis la page → tout est perdu.
- La sidebar « projets » sauve un snapshot, mais en mémoire aussi (voir point 2).
- **Correction proposée** : créer une table `conversations` + `chat_messages` en DB, charger la dernière conversation au mount, sauver chaque message à l'envoi/réception.

**2. Projets sauvegardés (sidebar "Mes chats")**

- Fichier : `src/contexts/ProjectsProvider.tsx` ligne 33 → `useState<SavedProject[]>([])`
- Problème : **aucune persistance, même pas localStorage**. Tu fermes l'onglet → tous tes chats sauvegardés disparaissent.
- **Correction proposée** : nouvelle table `saved_projects (id, user_id, category, name, data jsonb, created_at, updated_at)` avec RLS user, et synchro depuis le provider.

**3. WhatsApp — contacts et messages**

- on abandonne le projet whatsapp pour l'instant 

**4. Notifications**

- Fichier : `src/services/notificationService.ts` lignes 43-44 → localStorage
- Problème : pas synchro entre appareils. Mais comme les push web sont par-device, c'est moins grave.
- **Correction proposée** : créer table `app_notifications` et migrer (optionnel — à valider).

---

### 🟠 PRIORITÉ 2 — Incohérences (données dupliquées ou contradictoires)

**5. Agenda : double source de vérité**

- `src/services/scheduleService.ts` → localStorage (`app_schedule_events`)
- Table DB `schedule_events` → utilisée par `twinMemoryService` (tools de l'IA)
- `Index.tsx` ligne 215-224 → fait un merge des deux et déduplique à la volée. Fragile.
- Conséquence : un event créé par l'IA n'apparaît pas dans `scheduleService` local et inversement. Le widget calendrier risque de montrer des choses différentes selon d'où on vient.
- **Correction proposée** : **supprimer entièrement `scheduleService` localStorage** et faire passer TOUTES les opérations (add/remove/list) par la DB via `twinMemoryService` / `scheduleEventsService`. Une seule source de vérité.

**6. Trois systèmes de chat IA en parallèle**

- `supabase/functions/ai-chat/index.ts` — modèle `google/gemini-3-flash-preview` (semble obsolète, utilisé nulle part dans `src/services/`)
- `supabase/functions/ai-orchestrator/index.ts` — **le vrai chat actif**, appelé par `chatService.ts`
- `supabase/functions/twin-chat/index.ts` — chat séparé du « voice mode », appelé par `TwinVoiceProvider`
- **Correction proposée** : vérifier si `ai-chat` est encore référencé. Si non → la supprimer. Économise de la maintenance et évite que quelqu'un l'appelle par erreur.

---

### 💸 PRIORITÉ 3 — Usages IA Lovable (ce qui consomme tes crédits)

Voici **toutes** les fonctions qui appellent `LOVABLE_API_KEY` :


| Edge function               | Modèle                                                              | Quand c'est appelé                             | Coût estimé         |
| --------------------------- | ------------------------------------------------------------------- | ---------------------------------------------- | ------------------- |
| `ai-orchestrator`           | `gemini-3-flash-preview` (ou `gemini-3.1-pro-preview` si deepThink) | À chaque message de chat                       | 🔴 Élevé            |
| `ai-chat`                   | `gemini-3-flash-preview`                                            | Probablement plus utilisé (à confirmer)        | ⚪ Inactif ?         |
| `twin-chat`                 | `gemini-2.5-flash`                                                  | Mode appel vocal                               | 🟠 Moyen            |
| `voice-transcribe`          | `gemini-2.5-flash`                                                  | Chaque message vocal                           | 🟠 Moyen            |
| `proactive-tick`            | `gemini-2.5-flash-lite`                                             | **Cron toutes les 20 min, pour CHAQUE user**   | 🔴 Élevé en continu |
| `translate`                 | `gemini-2.5-flash-lite`                                             | Traduction news (à chaque load si langue ≠ FR) | 🟠 Moyen            |
| `organize-documents`        | `gemini-2.5-flash`                                                  | Quand tu tries des fichiers                    | 🟢 Ponctuel         |
| `explain-organization`      | `gemini-2.5-flash-lite`                                             | Après tri                                      | 🟢 Ponctuel         |
| `rules-from-prompt`         | `gemini-2.5-flash`                                                  | Création règles tri                            | 🟢 Ponctuel         |
| `video-editor-agent`        | `gemini-2.5-flash`                                                  | Éditeur vidéo                                  | 🟢 Ponctuel         |
| `video-command-from-prompt` | `gemini-2.5-flash-lite`                                             | Éditeur vidéo                                  | 🟢 Ponctuel         |
| `explain-video-edit`        | `gemini-2.5-flash-lite`                                             | Éditeur vidéo                                  | 🟢 Ponctuel         |
| `ai-orchestrator` (image)   | `gemini-2.5-flash-image`                                            | Génération images                              | 🟠 Moyen            |


**Recommandations crédits** :

- ✅ **Vérifier que `ai-chat` n'est plus appelée** et la supprimer.
- ⚠️ Le cron `proactive-tick` toutes les 20 min × tous les users = **gros poste de dépense silencieux**. À surveiller / rendre désactivable per-user (déjà partiellement fait via `proactive_prefs`, à vérifier que c'est bien respecté).
- ⚠️ `translate` peut tourner à chaque load des news — vérifier qu'il y a bien un cache.

---

### 🟡 PRIORITÉ 4 — Petits problèmes RLS/DB

**7. Table `event_notifications` sans DELETE/UPDATE pour les users**

- Impossible pour un user de réinitialiser ses notifs envoyées → si bug, le cron ne re-notifie jamais.
- **Correction** : ajouter policies DELETE pour `auth.uid() = user_id`.

**8. Mock du service news**

- `mockNewsService` : actus statiques fake. Pas un vrai bug mais à savoir.
- **Correction** (optionnel) : brancher `news-feed` edge function (déjà déployée).

---

### 📋 Plan d'exécution proposé

Si tu valides, je vais faire dans cet ordre :

1. **Migration SQL** : créer `conversations` + `chat_messages` (avec RLS), créer `saved_projects` (avec RLS), ajouter policies DELETE manquantes sur `event_notifications`.
2. **Persistance chat** : modifier `Index.tsx` + `chatService` pour charger/sauver les messages depuis la DB, créer une nouvelle conversation au "Nouveau chat".
3. **Persistance projets** : modifier `ProjectsProvider.tsx` pour synchro DB.
4. **Unifier l'agenda** : supprimer `scheduleService` localStorage, faire passer tous les usages (Index, widget, voice mode) par `twinMemoryService` (DB).
5. **Nettoyage** : vérifier `ai-chat` et la supprimer si inutilisée.
6. **(Optionnel)** : WhatsApp en DB, notifications en DB — à valider avec toi car gros chantier.

Dis-moi si tu veux que j'attaque tout, ou seulement certains points (par ex. juste 1+2+4 = persistance chat + agenda unifié, ce qui couvre 80% du problème).