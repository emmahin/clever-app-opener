

## Système de notifications complet

### Vue d'ensemble
Centre de notifications hybride : **toast immédiat** (apparition au moment de l'événement) + **cloche persistante** dans le header (historique consultable). Stockage localStorage. Sources multiples : chat, WhatsApp, actus, bourse, système, rappels IA.

### Architecture

**1. Service central `notificationService` (`src/services/notificationService.ts` — nouveau)**

Source de vérité unique. API simple :
- `notify({ type, title, body, icon?, source, actionUrl?, scheduledFor? })` → crée + déclenche toast
- `getAll()`, `getUnreadCount()`, `markAsRead(id)`, `markAllAsRead()`, `dismiss(id)`, `clearAll()`
- `subscribe(listener)` → permet aux composants UI de réagir en temps réel
- Gère un **scheduler interne** (setInterval) pour les notifs programmées (rappels)
- Persistance auto dans `localStorage` (`app_notifications`, max 100 entrées)

**Types de notifications** :
```ts
type NotificationType = 
  | "chat_response"      // IA a fini une réponse hors-focus
  | "whatsapp_message"   // nouveau message WhatsApp simulé
  | "news"               // breaking news
  | "stock_alert"        // mouvement boursier important
  | "reminder"           // rappel créé par l'IA ou l'utilisateur
  | "ai_insight"         // suggestion proactive
  | "system"             // organisation/vidéo terminée, etc.
```

**2. Hook `useNotifications()` (`src/hooks/useNotifications.ts` — nouveau)**

Wrapper React qui s'abonne au service et expose `{ notifications, unreadCount, markAsRead, ... }`. Utilisé par la cloche et la page dédiée.

**3. Cloche dans le header (`src/components/chatbot/NotificationBell.tsx` — nouveau)**

- Icône cloche avec badge compteur (rouge, animé si nouveau)
- Au clic : Popover avec liste des 10 dernières notifs (icône typée, titre, snippet, temps relatif "il y a 5 min")
- Actions par notif : marquer comme lu, supprimer, "Voir tout" → /notifications
- Bouton "Tout marquer comme lu"
- Filtre rapide par type (puces : Tout / Chat / WhatsApp / Actus / Système)

**4. Page dédiée `/notifications` (`src/pages/Notifications.tsx` — nouveau)**

Vue complète avec :
- Filtres avancés (type, lu/non-lu, source)
- Recherche texte
- Groupement par jour ("Aujourd'hui", "Hier", "Cette semaine")
- Actions par lot : tout supprimer, archiver
- État vide stylé (illustration + texte)
- Lien dans la sidebar avec badge

**5. Toasts en temps réel**

Utilise sonner (déjà installé). Le service appelle `toast.custom()` avec un design adapté au type (couleur/icône). Toasts cliquables → naviguent vers `actionUrl`.

### Sources qui déclenchent des notifications

| Source | Quand | Implémentation |
|---|---|---|
| **Réponse IA** | `streamChat.onDone` + onglet hors focus (`document.hidden`) | Dans `Index.tsx` |
| **WhatsApp** | Quand un faux contact "répond" (simulation: 50% des envois après 3-15s) | Hook dans `WhatsApp.tsx` |
| **Actus** | Polling périodique (toutes les 30 min) du `newsService` | Background dans `App.tsx` |
| **Bourse** | Variations > seuil (configurable, défaut ±3%) sur watchlist | `stockService` étendu |
| **Système** | Fin d'organisation docs / édition vidéo | Hook dans pages concernées |
| **Rappels IA** | Outil `create_reminder({ title, body, when })` côté orchestrator | Edge function + scheduler client |
| **Insights IA** | Outil `create_insight({ title, body })` que l'IA peut appeler après analyse | Edge function |

### Outils IA ajoutés (`supabase/functions/ai-orchestrator/index.ts`)

```ts
{ name: "create_reminder",
  parameters: { title, body?, when_iso }, // ex: "2026-04-21T15:00:00"
  returns: { widget: "reminder_created" } }

{ name: "create_insight",
  parameters: { title, body },
  returns: { widget: "insight_created" } }
```

Ces outils retournent un widget de confirmation dans le chat ET poussent une notif via le service côté client (au rendu du widget).

### Widgets de confirmation (`MessageWidgets.tsx`)

- `reminder_created` : carte avec horaire + bouton "Voir mes rappels"
- `insight_created` : carte violette avec ampoule

### Structure visuelle de la cloche

```text
Header
 └─ [🔍 Search] [🔔³] [⚙️ Options]
                  └─ Popover (320px)
                      ├─ "Notifications (3 non lues)"  [Tout marquer]
                      ├─ Filtres : [Tout] [Chat] [WhatsApp] [Actus]
                      ├─ ┌─────────────────────────────┐
                      │  │ 💬 Léa t'a répondu          │
                      │  │ "Salut, ok pour 15h !"      │
                      │  │ il y a 2 min          ✕     │
                      │  ├─────────────────────────────┤
                      │  │ 📰 Breaking: ...            │
                      │  └─────────────────────────────┘
                      └─ "Voir tout →"
```

### Préférences utilisateur (`SettingsProvider`)

Nouvelles options dans `/settings` :
- Activer/désactiver par catégorie (toggles)
- Mode "Ne pas déranger" (silence toasts, garde historique)
- Heures silencieuses (ex: 22h-8h)
- Seuil d'alerte boursière (%)

### Fichiers créés / modifiés

**Créés** :
- `src/services/notificationService.ts`
- `src/hooks/useNotifications.ts`
- `src/components/chatbot/NotificationBell.tsx`
- `src/pages/Notifications.tsx`
- `src/components/chatbot/widgets/ReminderWidget.tsx`
- `src/components/chatbot/widgets/InsightWidget.tsx`

**Modifiés** :
- `src/services/types.ts` — types `Notification` + nouveaux widgets
- `src/components/chatbot/Header.tsx` — intégrer la cloche
- `src/components/chatbot/Sidebar.tsx` — entrée "Notifications" avec badge
- `src/components/chatbot/MessageWidgets.tsx` — gérer les 2 nouveaux widgets
- `src/App.tsx` — route `/notifications` + démarrage scheduler/pollers
- `src/pages/Index.tsx` — notifier fin de réponse IA si onglet caché
- `src/pages/WhatsApp.tsx` — déclencher notif sur "réponse simulée"
- `src/contexts/SettingsProvider.tsx` — préférences notifs
- `src/pages/Settings.tsx` — section "Notifications"
- `supabase/functions/ai-orchestrator/index.ts` — outils `create_reminder` + `create_insight` + mention dans system prompt

### Notes techniques

- **Pas de backend nécessaire** (tout en localStorage, comme WhatsApp).
- Scheduler basé sur `setInterval(60s)` côté client : vérifie les rappels dont `scheduledFor <= now`.
- API Web Notifications (notifications natives navigateur) **optionnelle** : on demandera la permission au premier rappel programmé, fallback sur toast si refusée.
- Limite 100 notifs en stockage (FIFO) pour éviter de gonfler localStorage.
- Tout est typé strictement et stylé dans le thème violet/noir existant.

