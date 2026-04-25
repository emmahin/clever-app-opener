-- =========================================
-- 1. ENUM + table user_roles
-- =========================================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Un seul admin principal possible
CREATE UNIQUE INDEX user_roles_one_primary_idx
  ON public.user_roles ((1)) WHERE is_primary = true;

-- =========================================
-- 2. Fonction has_role (SECURITY DEFINER, anti-récursion)
-- =========================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========================================
-- 3. RLS sur user_roles
-- =========================================
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- INSERT/DELETE/UPDATE sont gérés UNIQUEMENT via RPC SECURITY DEFINER
-- (pas de policy = pas d'accès direct au front)

-- =========================================
-- 4. Élargir RLS existantes pour les admins
-- =========================================

-- profiles : admin voit tout
CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- user_credits : admin voit tout + peut update via RPC (pas de policy update direct)
CREATE POLICY "Admins can view all credits"
  ON public.user_credits FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- credit_transactions : admin voit tout
CREATE POLICY "Admins can view all transactions"
  ON public.credit_transactions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- =========================================
-- 5. RPC: promote_to_admin
-- =========================================
CREATE OR REPLACE FUNCTION public.promote_to_admin(_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin required';
  END IF;

  INSERT INTO public.user_roles (user_id, role, is_primary, granted_by)
  VALUES (_target_user_id, 'admin', false, auth.uid())
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'user_id', _target_user_id);
END;
$$;

-- =========================================
-- 6. RPC: revoke_admin (interdit sur admin principal)
-- =========================================
CREATE OR REPLACE FUNCTION public.revoke_admin(_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _is_primary boolean;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin required';
  END IF;

  SELECT is_primary INTO _is_primary
  FROM public.user_roles
  WHERE user_id = _target_user_id AND role = 'admin';

  IF _is_primary THEN
    RAISE EXCEPTION 'cannot revoke primary admin';
  END IF;

  DELETE FROM public.user_roles
  WHERE user_id = _target_user_id AND role = 'admin' AND is_primary = false;

  RETURN jsonb_build_object('ok', true, 'user_id', _target_user_id);
END;
$$;

-- =========================================
-- 7. RPC: admin_add_credits
-- =========================================
CREATE OR REPLACE FUNCTION public.admin_add_credits(
  _target_user_id uuid,
  _amount integer,
  _bucket text DEFAULT 'purchased'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin required';
  END IF;

  RETURN public.add_credits(
    _user_id := _target_user_id,
    _amount := _amount,
    _kind := 'admin_grant',
    _bucket := _bucket,
    _metadata := jsonb_build_object('granted_by', auth.uid())
  );
END;
$$;

-- =========================================
-- 8. RPC: admin_set_tier (change le plan + recharge crédits)
-- =========================================
CREATE OR REPLACE FUNCTION public.admin_set_tier(
  _target_user_id uuid,
  _tier text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _credits integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin required';
  END IF;

  IF _tier NOT IN ('free', 'starter', 'pro', 'ultra') THEN
    RAISE EXCEPTION 'invalid tier';
  END IF;

  -- Crédits abonnement par palier
  _credits := CASE _tier
    WHEN 'free'    THEN 50
    WHEN 'starter' THEN 500
    WHEN 'pro'     THEN 2000
    WHEN 'ultra'   THEN 10000
  END;

  INSERT INTO public.user_credits (user_id, subscription_tier, subscription_credits, subscription_renews_at)
  VALUES (_target_user_id, _tier, _credits, now() + interval '30 days')
  ON CONFLICT (user_id) DO UPDATE
    SET subscription_tier = _tier,
        subscription_credits = _credits,
        subscription_renews_at = now() + interval '30 days',
        updated_at = now();

  INSERT INTO public.credit_transactions (user_id, kind, amount, balance_after, metadata)
  SELECT _target_user_id, 'admin_set_tier', _credits,
         subscription_credits + purchased_credits,
         jsonb_build_object('tier', _tier, 'granted_by', auth.uid())
  FROM public.user_credits WHERE user_id = _target_user_id;

  RETURN jsonb_build_object('ok', true, 'tier', _tier, 'credits', _credits);
END;
$$;

-- =========================================
-- 9. RPC: list_all_users_admin (vue agrégée pour la page admin)
-- =========================================
CREATE OR REPLACE FUNCTION public.list_all_users_admin()
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  created_at timestamptz,
  subscription_tier text,
  subscription_credits integer,
  purchased_credits integer,
  total_consumed bigint,
  is_admin boolean,
  is_primary_admin boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin required';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.email,
    p.display_name,
    p.created_at,
    COALESCE(uc.subscription_tier, 'free'),
    COALESCE(uc.subscription_credits, 0),
    COALESCE(uc.purchased_credits, 0),
    COALESCE(uc.total_consumed, 0),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin'),
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin' AND ur.is_primary = true)
  FROM public.profiles p
  LEFT JOIN public.user_credits uc ON uc.user_id = p.id
  ORDER BY p.created_at DESC;
END;
$$;