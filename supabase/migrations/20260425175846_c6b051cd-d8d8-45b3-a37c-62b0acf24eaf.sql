-- =========================================================
-- TABLE: user_credits (solde de chaque utilisateur)
-- =========================================================
CREATE TABLE public.user_credits (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_credits INTEGER NOT NULL DEFAULT 0,
  purchased_credits INTEGER NOT NULL DEFAULT 0,
  subscription_tier TEXT NOT NULL DEFAULT 'free',
  subscription_renews_at TIMESTAMPTZ,
  total_consumed BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT subscription_credits_non_negative CHECK (subscription_credits >= 0),
  CONSTRAINT purchased_credits_non_negative CHECK (purchased_credits >= 0)
);

ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own credits"
  ON public.user_credits FOR SELECT
  USING (auth.uid() = user_id);

-- Pas d'INSERT/UPDATE/DELETE direct côté client : tout passe par les fonctions sécurisées

CREATE TRIGGER update_user_credits_updated_at
BEFORE UPDATE ON public.user_credits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- TABLE: credit_transactions (historique)
-- =========================================================
CREATE TABLE public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL, -- 'consume' | 'subscription_grant' | 'purchase' | 'refund' | 'admin_adjust'
  amount INTEGER NOT NULL, -- négatif pour consume, positif pour grant/purchase
  balance_after INTEGER NOT NULL,
  model TEXT, -- ex: 'google/gemini-3-flash-preview'
  action TEXT, -- ex: 'chat', 'image', 'transcribe'
  input_tokens INTEGER,
  output_tokens INTEGER,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_transactions_user_created ON public.credit_transactions(user_id, created_at DESC);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own transactions"
  ON public.credit_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- =========================================================
-- TABLE: credit_pricing (tarifs par modèle/action)
-- =========================================================
CREATE TABLE public.credit_pricing (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model TEXT NOT NULL,
  action TEXT NOT NULL DEFAULT 'chat', -- 'chat' | 'image' | 'transcribe' | 'fixed'
  credits_per_1k_input INTEGER NOT NULL DEFAULT 0,
  credits_per_1k_output INTEGER NOT NULL DEFAULT 0,
  fixed_cost INTEGER NOT NULL DEFAULT 0, -- pour image, transcribe (par unité)
  unit_label TEXT, -- ex: 'image', 'minute'
  active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(model, action)
);

ALTER TABLE public.credit_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view pricing"
  ON public.credit_pricing FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER update_credit_pricing_updated_at
BEFORE UPDATE ON public.credit_pricing
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- TARIFS PAR DÉFAUT
-- =========================================================
INSERT INTO public.credit_pricing (model, action, credits_per_1k_input, credits_per_1k_output, fixed_cost, unit_label) VALUES
  -- Gemini
  ('google/gemini-2.5-flash-lite', 'chat', 1, 2, 0, NULL),
  ('google/gemini-3-flash-preview', 'chat', 3, 6, 0, NULL),
  ('google/gemini-2.5-flash', 'chat', 3, 6, 0, NULL),
  ('google/gemini-2.5-pro', 'chat', 12, 25, 0, NULL),
  ('google/gemini-3.1-pro-preview', 'chat', 15, 30, 0, NULL),
  -- OpenAI
  ('openai/gpt-5-nano', 'chat', 2, 4, 0, NULL),
  ('openai/gpt-5-mini', 'chat', 5, 10, 0, NULL),
  ('openai/gpt-5', 'chat', 15, 30, 0, NULL),
  ('openai/gpt-5.2', 'chat', 18, 35, 0, NULL),
  -- Image
  ('google/gemini-2.5-flash-image', 'image', 0, 0, 20, 'image'),
  ('google/gemini-3.1-flash-image-preview', 'image', 0, 0, 25, 'image'),
  -- Transcription / voix
  ('voice-transcribe', 'transcribe', 0, 0, 5, 'minute');

-- =========================================================
-- FONCTION: consume_credits (sécurisée, appelée par edge functions)
-- =========================================================
CREATE OR REPLACE FUNCTION public.consume_credits(
  _user_id UUID,
  _amount INTEGER,
  _model TEXT DEFAULT NULL,
  _action TEXT DEFAULT NULL,
  _input_tokens INTEGER DEFAULT NULL,
  _output_tokens INTEGER DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.user_credits%ROWTYPE;
  _from_sub INTEGER := 0;
  _from_purchased INTEGER := 0;
  _new_total INTEGER;
BEGIN
  IF _amount <= 0 THEN
    RAISE EXCEPTION 'amount must be positive';
  END IF;

  SELECT * INTO _row FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.user_credits(user_id) VALUES (_user_id) RETURNING * INTO _row;
  END IF;

  IF (_row.subscription_credits + _row.purchased_credits) < _amount THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'insufficient_credits',
      'balance', _row.subscription_credits + _row.purchased_credits,
      'required', _amount
    );
  END IF;

  -- Consomme d'abord les crédits abonnement, puis les achetés
  IF _row.subscription_credits >= _amount THEN
    _from_sub := _amount;
  ELSE
    _from_sub := _row.subscription_credits;
    _from_purchased := _amount - _from_sub;
  END IF;

  UPDATE public.user_credits
    SET subscription_credits = subscription_credits - _from_sub,
        purchased_credits = purchased_credits - _from_purchased,
        total_consumed = total_consumed + _amount,
        updated_at = now()
    WHERE user_id = _user_id
    RETURNING * INTO _row;

  _new_total := _row.subscription_credits + _row.purchased_credits;

  INSERT INTO public.credit_transactions(
    user_id, kind, amount, balance_after, model, action, input_tokens, output_tokens, metadata
  ) VALUES (
    _user_id, 'consume', -_amount, _new_total, _model, _action, _input_tokens, _output_tokens, _metadata
  );

  RETURN jsonb_build_object(
    'ok', true,
    'consumed', _amount,
    'balance', _new_total,
    'subscription_credits', _row.subscription_credits,
    'purchased_credits', _row.purchased_credits
  );
END;
$$;

-- =========================================================
-- FONCTION: add_credits (utilisée par webhooks paiement)
-- =========================================================
CREATE OR REPLACE FUNCTION public.add_credits(
  _user_id UUID,
  _amount INTEGER,
  _kind TEXT, -- 'subscription_grant' | 'purchase' | 'refund' | 'admin_adjust'
  _bucket TEXT DEFAULT 'purchased', -- 'subscription' | 'purchased'
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.user_credits%ROWTYPE;
  _new_total INTEGER;
BEGIN
  IF _amount = 0 THEN
    RAISE EXCEPTION 'amount cannot be zero';
  END IF;

  SELECT * INTO _row FROM public.user_credits WHERE user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.user_credits(user_id) VALUES (_user_id) RETURNING * INTO _row;
  END IF;

  IF _bucket = 'subscription' THEN
    UPDATE public.user_credits
      SET subscription_credits = GREATEST(0, subscription_credits + _amount),
          updated_at = now()
      WHERE user_id = _user_id
      RETURNING * INTO _row;
  ELSE
    UPDATE public.user_credits
      SET purchased_credits = GREATEST(0, purchased_credits + _amount),
          updated_at = now()
      WHERE user_id = _user_id
      RETURNING * INTO _row;
  END IF;

  _new_total := _row.subscription_credits + _row.purchased_credits;

  INSERT INTO public.credit_transactions(
    user_id, kind, amount, balance_after, metadata
  ) VALUES (
    _user_id, _kind, _amount, _new_total, _metadata || jsonb_build_object('bucket', _bucket)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'balance', _new_total,
    'subscription_credits', _row.subscription_credits,
    'purchased_credits', _row.purchased_credits
  );
END;
$$;

-- =========================================================
-- TRIGGER: créer une ligne user_credits à l'inscription
-- (on étend handle_new_user existant)
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.user_settings (user_id) VALUES (NEW.id);

  INSERT INTO public.user_credits (user_id) VALUES (NEW.id);

  RETURN NEW;
END;
$$;

-- Crée les lignes user_credits manquantes pour les utilisateurs existants
INSERT INTO public.user_credits (user_id)
SELECT id FROM auth.users
WHERE id NOT IN (SELECT user_id FROM public.user_credits)
ON CONFLICT (user_id) DO NOTHING;