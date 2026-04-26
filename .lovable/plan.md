## Objectif

Donner à Nex une vraie initiative : il pousse des **notifications natives OS** (PC + mobile, même app fermée) pour rappeler les events de l'agenda et faire des suggestions proactives, en analysant en arrière-plan ton agenda + tes mémoires.

---

## 1. Vraies notifs OS — Web Push (VAPID)

### a. Service worker minimal
- Création de `public/sw.js` : il ne fait **que** recevoir les pushes et afficher la notif (`self.addEventListener('push', …)`) + gérer le clic (`notificationclick` → ouvre `actionUrl`).
- Pas de `vite-plugin-pwa`, pas de cache, pas de précaching → zéro risque de casser le preview Lovable. SW enregistré uniquement hors iframe / hors host preview (garde standard).
- Manifeste déjà présent (`public/manifest.webmanifest`) → suffisant pour l'install mobile.

### b. Clés VAPID
- Génération d'une paire VAPID **une fois** dans une edge function utilitaire `vapid-init` (générée via `web-push` npm dans Deno) → on stocke `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY` comme secrets Lovable Cloud (j'utiliserai `add_secret` au moment de l'implémentation).
- Public key exposée via une edge fonction `vapid-public-key` (lecture publique).

### c. Table `push_subscriptions`
```
id uuid pk
user_id uuid
endpoint text unique
p256dh text
auth text
user_agent text
created_at, last_used_at
```
RLS : user voit/insère/supprime les siennes ; admin lit tout.

### d. Flow d'abonnement côté client
- Nouveau composant `NotificationsPermissionCard` dans **Settings** → bouton « Activer les notifications système » qui :
  1. Demande `Notification.requestPermission()`.
  2. `navigator.serviceWorker.register('/sw.js')`.
  3. `pushManager.subscribe({ applicationServerKey: VAPID_PUBLIC })`.
  4. Envoie la subscription à l'edge function `push-subscribe` qui upsert dans la table.
- Détection auto du support (Safari iOS ≥ 16.4 nécessite que l'app soit **installée à l'écran d'accueil** d'abord — un message clair explique cette étape).

### e. Edge function `push-send`
- Reçoit `{ user_id, title, body, url, icon }`.
- Récupère toutes les subscriptions du user.
- Utilise `npm:web-push` pour signer et envoyer chaque push avec les VAPID keys.
- Supprime automatiquement les subscriptions expirées (status 410/404).

### f. Intégration au `notificationService` existant
- Ajout d'une méthode `notifyPushed(input)` qui :
  - Crée la notif dans la liste locale (comme aujourd'hui).
  - Si la notif vient d'un push serveur (ou si elle est programmée et que l'app n'est pas focus), elle ne re-toast pas en double.
- Le hook `useNotifications` reste inchangé pour les composants UI.

---

## 2. IA proactive — cron serveur toutes les 20 min

### a. Edge function `proactive-tick` (cron)
Pour **chaque user** ayant au moins une push subscription active :

1. **Rappels d'agenda intelligents (smart timing)**  
   Lit `schedule_events` des prochaines 4h. Pour chaque event pas encore notifié :
   - Si `location` non vide et ≠ "maison/home/chez moi" → rappel **30 min avant**.
   - Si type détecté "examen / contrôle / interro / entretien / RDV médical" → **45 min avant**.
   - Si event court (<30 min, type "appel/call") → **5 min avant**.
   - Sinon → **15 min avant** (défaut).
   - Tag `notified_at` stocké dans une nouvelle table `event_notifications(event_id, kind, sent_at)` pour ne pas spammer.
   - Pousse via `push-send` : « ⏰ Cours de maths dans 15 min — Salle B204 ».

2. **Suggestions proactives (LLM léger)**  
   - Une fois par tranche de 4h max par user (anti-spam).
   - Construit un mini-contexte : 5 derniers `user_memories`, events des 24h passées + 24h à venir, dernière `conversation_summary`.
   - Appel `google/gemini-2.5-flash-lite` (cheap) avec un prompt « Propose AU PLUS UNE suggestion utile et concrète OU réponds {none:true} si rien d'utile à dire maintenant. Format JSON strict. ».
   - Si suggestion → push : « 💡 Suggestion de Nex : … » avec lien `/notifications`.
   - Coût plafonné via les crédits utilisateur (le user paie ses propres suggestions, comme le chat).

### b. pg_cron
- Job `proactive-tick-every-20-min` créé via insert SQL (pas migration, contient l'anon key) :
  ```
  */20 * * * *  →  net.http_post(.../proactive-tick)
  ```
- Activation `pg_cron` + `pg_net` si pas déjà actif.

### c. Préférences utilisateur (Settings)
Nouveau bloc dans `MemorySection`/`RecurringScheduleSection` ou section dédiée :
- Toggle global « Notifications système »
- Toggle « Rappels d'agenda automatiques »
- Toggle « Suggestions proactives de Nex »
- Plage horaire de silence (réutilise les `quietHours` déjà dans `notificationService` + on les sync vers `user_settings.notification_prefs` côté DB pour que le cron les respecte).

---

## 3. Heure courante pour l'IA (rappel — déjà en place)

Le système prompt injecte déjà l'heure locale + timezone (`buildSystemPrompt` dans `ai-orchestrator`). Rien à refaire ici, juste vérifier que `proactive-tick` fait pareil quand il appelle le LLM.

---

## 4. Récap des fichiers

**Nouveaux**
- `public/sw.js` — service worker push-only
- `src/services/pushService.ts` — subscribe/unsubscribe + détection support
- `src/components/settings/NotificationsPermissionCard.tsx`
- `src/components/settings/ProactivePreferencesCard.tsx`
- `supabase/functions/vapid-public-key/index.ts`
- `supabase/functions/push-subscribe/index.ts`
- `supabase/functions/push-send/index.ts`
- `supabase/functions/proactive-tick/index.ts`
- Migration : tables `push_subscriptions`, `event_notifications` + RLS + colonne `proactive_last_run_at` sur `user_settings`.

**Modifiés**
- `src/services/notificationService.ts` — sync prefs DB + flag « pushed »
- `src/pages/Settings.tsx` — ajout des 2 cartes
- `src/main.tsx` — register SW (avec garde iframe/preview)

**Secrets à demander**
- `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY` (je les générerai et te donnerai la commande pour les ajouter, ou je les générerai dans une edge function utilitaire et te demanderai juste de les coller).

---

## Limites honnêtes
- **iOS Safari** : les Web Push marchent **uniquement** si l'utilisateur a d'abord ajouté l'app à l'écran d'accueil (PWA installée). Une étape claire sera affichée sur iPhone.
- **Desktop** : marche partout (Chrome, Edge, Firefox, Safari macOS).
- **Quand l'app est fermée** : ça marche tant que l'OS / le navigateur tourne en arrière-plan (cas normal).
- Le cron toutes les 20 min veut dire que la précision d'un rappel « 15 min avant » sera entre 15 et 35 min avant (acceptable). Si tu veux pile à la minute on passe à 5 min mais ça multiplie les invocations.