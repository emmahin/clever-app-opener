

## Système d'authentification + comptes connectés

### Vue d'ensemble
Auth e-mail/mot de passe (Lovable Cloud) avec :
- Page **`/auth`** unifiée (Sign up / Sign in / Mot de passe oublié)
- **Garde de routes** : tout sauf `/auth` redirige vers `/auth` si non connecté
- **Préférences synchronisées** côté serveur (Settings, langue, instructions IA, prefs notifications)
- Table **`connected_accounts`** prête pour intégrer plus tard WhatsApp, ChatGPT, Notion, Google, etc. — chaque connecteur stocke ses credentials chiffrés dans une colonne `JSONB credentials` (clé/token/secret + métadonnées)
- Migration **transparente du localStorage → cloud** au premier login (one-shot, marquée pour ne pas se répéter)

Auto-confirm des e-mails **activé** (mode dev) pour ne pas bloquer le flux. Tu pourras le désactiver plus tard.

### Architecture backend (Lovable Cloud)

**Tables**
```text
profiles
├── id (uuid, PK, FK → auth.users.id, on delete cascade)
├── email (text)
├── display_name (text, nullable)
├── created_at / updated_at

user_settings
├── user_id (uuid, PK, FK → auth.users.id, on delete cascade)
├── detail_level (text)             ← short/normal/detailed
├── typewriter (bool)
├── custom_instructions (text)
├── ai_name (text)
├── language (text)                 ← fr/en/es/de
├── notification_prefs (jsonb)      ← quiet hours, do not disturb, etc.
├── updated_at

connected_accounts
├── id (uuid, PK)
├── user_id (uuid, FK → auth.users.id, on delete cascade)
├── provider (text)                 ← 'whatsapp' | 'chatgpt' | 'notion' | 'google' | …
├── account_label (text)            ← affiché dans l'UI ("Compte perso", numéro masqué…)
├── credentials (jsonb)             ← {api_key, refresh_token, phone_number, …}
├── status (text)                   ← 'active' | 'expired' | 'revoked'
├── connected_at / last_used_at
├── UNIQUE(user_id, provider, account_label)
```

**RLS** : sur les 3 tables, chaque user ne voit/modifie QUE ses lignes (`auth.uid() = user_id`).

**Trigger** `handle_new_user` : à chaque insert dans `auth.users`, crée automatiquement la ligne `profiles` + `user_settings` (defaults).

### Frontend

**Nouveaux fichiers**
- `src/pages/Auth.tsx` — UI Sign up / Sign in / Forgot password (3 onglets), redirige vers `/` au succès
- `src/components/AuthGuard.tsx` — wrap des routes protégées, montre splash le temps de `getSession()`, redirige vers `/auth` sinon
- `src/hooks/useAuth.ts` — `{ user, session, loading, signOut }` avec `onAuthStateChange` (setup AVANT `getSession`)
- `src/services/userPreferencesService.ts` — `loadPrefs()` / `savePrefs()` côté serveur + migration one-shot du localStorage (clé `app.settings.v1` → `user_settings`)
- `src/services/connectedAccountsService.ts` — `list()` / `add({provider, label, credentials})` / `remove(id)` / `getByProvider(provider)` (générique pour tous les providers futurs)

**Fichiers modifiés**
- `src/App.tsx` — route `/auth` publique, toutes les autres entourées de `<AuthGuard>`
- `src/contexts/SettingsProvider.tsx` — au mount : si user connecté, charge depuis Cloud (fallback localStorage), sauvegarde dans Cloud à chaque update (debounced 500 ms), garde localStorage en miroir pour mode hors-ligne
- `src/components/chatbot/Header.tsx` — l'icône user devient un menu avec "Mon compte" + "Se déconnecter"
- `src/pages/Settings.tsx` — nouvelle section **"Comptes connectés"** : liste des `connected_accounts`, bouton "Ajouter un compte" avec un menu (WhatsApp / ChatGPT / Notion / Google), pour l'instant juste un dialog placeholder par provider (saisie API key) → câblage réel viendra par provider plus tard

### Flux migration localStorage → cloud
Au premier login après mise à jour :
1. Lire `localStorage["app.settings.v1"]`
2. UPSERT dans `user_settings` (en gardant les valeurs serveur si plus récentes)
3. Marquer `localStorage["__migrated_to_cloud_v1"] = "1"`
4. Garder `localStorage` en miroir lecture seule pour usage hors-ligne

WhatsApp local (`wa_contacts`, `wa_messages`) **non migré pour l'instant** (ce n'est qu'un mock UI) — sera traité quand tu connecteras l'API WhatsApp Business via `connected_accounts`.

### Détails techniques

- `supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + '/' } })`
- `supabase.auth.signInWithPassword({ email, password })`
- `supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/auth?mode=reset' })`
- `useAuth` : appelle `supabase.auth.onAuthStateChange(...)` PUIS `supabase.auth.getSession()` (ordre critique — recommandation Supabase)
- Auto-confirm e-mail activé via `configure_auth({ auto_confirm_email: true, ... })` pour éviter le blocage en dev
- HIBP (vérification mot de passe compromis) **activé**
- Aucun stockage clair des secrets dans le front : les `credentials` JSONB sont protégés par RLS strict + chiffrement au repos par Postgres

### Sécurité
- RLS partout (`auth.uid() = user_id`)
- Pas de rôles admin pour l'instant (single-user perspective)
- `credentials` JSONB jamais loggué côté client, jamais exposé via une view
- Trigger `handle_new_user` en `SECURITY DEFINER` avec `SET search_path = public`

### Hors-périmètre (à faire plus tard)
- Implémentation réelle des connecteurs WhatsApp Business / OpenAI / Notion (chacun nécessitera une edge function dédiée pour utiliser les credentials)
- Migration des messages WhatsApp locaux vers cloud
- Google OAuth (peut être ajouté en 1 étape via Lovable Cloud, à activer quand tu veux)

