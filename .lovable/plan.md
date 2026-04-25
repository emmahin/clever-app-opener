## 🎯 Objectif

Mettre en place un système de rôles sécurisé permettant :
- Un **admin principal** (toi), promu via SQL une seule fois et **non révocable**
- Des **admins secondaires** que tu peux promouvoir/révoquer depuis une page dédiée
- **Bypass complet des crédits** pour tous les admins (avec traçabilité)
- Une page `/admin/users` complète pour gérer users, plans, crédits et rôles

---

## 🗄️ Étape 1 — Schéma base de données (migration)

### Enum + table `user_roles`
```sql
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,  -- 🔒 admin principal intouchable
  granted_by uuid,
  granted_at timestamptz DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
```

### Fonction sécurisée `has_role()` (SECURITY DEFINER, évite la récursion RLS)
```sql
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role) $$;
```

### Policies RLS sur `user_roles`
- SELECT : user voit ses rôles OU est admin
- INSERT/DELETE : seulement admins, **et impossible de toucher une ligne `is_primary=true`**

### RPC `promote_to_admin(_target_user_id)` et `revoke_admin(_target_user_id)`
- SECURITY DEFINER, vérifient que l'appelant est admin
- `revoke_admin` lève une exception si la cible est `is_primary=true`

### Élargir les policies existantes pour les admins
- `user_credits`, `credit_transactions`, `profiles` → ajouter une policy SELECT permettant aux admins de tout voir
- `user_credits` → policy UPDATE pour admins (changement de plan, ajout de crédits via RPC)

### Nouvelle RPC `admin_add_credits(_target_user_id, _amount, _bucket)`
- Vérifie `has_role(auth.uid(), 'admin')` puis appelle `add_credits()` existante

### Nouvelle RPC `admin_set_tier(_target_user_id, _tier)`
- Met à jour `subscription_tier` + recharge les crédits du palier choisi

### 🔑 Promotion manuelle de l'admin principal
Après la migration, je lancerai une seule fois :
```sql
INSERT INTO public.user_roles (user_id, role, is_primary)
VALUES ('<TON_UUID>', 'admin', true);
```
👉 **Tu devras d'abord créer ton compte via `/auth`** puis me donner ton email pour que je récupère ton UUID.

---

## ⚙️ Étape 2 — Bypass crédits dans les edge functions

Modifier `supabase/functions/_shared/credits.ts` :
- Nouvelle fonction `isAdmin(supabase, userId)` qui appelle `has_role`
- Si admin → retourne `{ skipBilling: true }`

Modifier `ai-chat/index.ts` et `ai-orchestrator/index.ts` :
- Avant `estimateCredits` : check admin
- Si admin → skip pré-débit ET skip ajustement final
- Logger quand même une transaction `kind='admin_free'` avec `amount=0` pour audit

---

## 🎨 Étape 3 — UI

### Hook `useIsAdmin()`
- Query Supabase `has_role(auth.uid(), 'admin')` au login
- Cache via React Query, refresh à l'auth change

### Header (`Header.tsx`)
- Si admin : remplacer le compteur de crédits par un badge **"∞ Admin"** (gradient or)
- Si admin : afficher un bouton **🛡️ Admin** à côté de Crédits/Notifications → vers `/admin/users`

### Nouvelle page `/admin/users`
Protection : redirige vers `/` si pas admin (vérif côté client + RLS côté DB).

**Sections :**
1. **Liste des utilisateurs** (table)
   - Colonnes : email, plan, crédits (sub + purchased), total consommé, rôle, actions
   - Recherche + tri
   - Actions par ligne :
     - Bouton **Promouvoir admin** / **Révoquer admin** (désactivé + tooltip "Admin principal protégé" si `is_primary`)
     - Menu **Changer le plan** (Free / Starter / Pro / Ultra)
     - Bouton **+ Crédits** (modal : montant + bucket subscription/purchased)

2. **Onglet Transactions globales**
   - Liste paginée de toutes les `credit_transactions`
   - Filtres : user, kind, action, date
   - Affiche les `admin_free` avec un tag spécial

### Route dans `App.tsx`
- `/admin/users` protégée par `<AuthGuard>` + check admin

---

## 🛡️ Étape 4 — Sécurité

- ✅ Rôles dans table séparée (jamais sur profiles)
- ✅ `SECURITY DEFINER` pour éviter récursion RLS
- ✅ Toutes les actions admin passent par des RPC vérifiant `has_role()`
- ✅ Flag `is_primary` empêche la suppression de l'admin principal (au niveau RPC + RLS)
- ✅ Transactions `admin_free` loggées pour audit
- ✅ Vérification côté client ET côté serveur (jamais de confiance au front seul)

---

## 📋 Ordre d'exécution validé

1. Migration SQL (table, enum, fonctions, policies, RPCs)
2. Tu crées ton compte via `/auth` puis me donnes ton email
3. Je lance la requête de promotion admin principal
4. Bypass crédits dans les edge functions
5. Page `/admin/users` + hook + boutons header
6. Test complet ensemble

**Une fois validé, je passe en mode default et j'attaque l'étape 1.**