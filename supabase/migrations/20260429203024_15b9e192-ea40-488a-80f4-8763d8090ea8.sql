
-- 1. Réduire les crédits offerts à l'inscription (handle_new_user) via user_credits default 25
ALTER TABLE public.user_credits ALTER COLUMN subscription_credits SET DEFAULT 25;

-- 2. Mettre à jour le palier 'free' dans admin_set_tier (50 -> 25)
CREATE OR REPLACE FUNCTION public.admin_set_tier(_target_user_id uuid, _tier text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _credits integer;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden: admin required';
  END IF;

  IF _tier NOT IN ('free', 'starter', 'pro', 'ultra') THEN
    RAISE EXCEPTION 'invalid tier';
  END IF;

  _credits := CASE _tier
    WHEN 'free'    THEN 25
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
$function$;

-- 3. RPC publique pour lire son solde sans table scan (pratique côté client + edge)
CREATE OR REPLACE FUNCTION public.get_my_credits()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'balance', COALESCE(subscription_credits + purchased_credits, 0),
    'subscription_credits', COALESCE(subscription_credits, 0),
    'purchased_credits', COALESCE(purchased_credits, 0),
    'subscription_tier', COALESCE(subscription_tier, 'free')
  )
  FROM public.user_credits
  WHERE user_id = auth.uid();
$$;
