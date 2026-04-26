-- Table des abonnements iCal (Pronote, EDT universitaire, etc.)
CREATE TABLE public.ical_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  label TEXT NOT NULL DEFAULT 'iCal',
  provider TEXT NOT NULL DEFAULT 'pronote',
  url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  events_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ical_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own ical subs"
  ON public.ical_subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own ical subs"
  ON public.ical_subscriptions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own ical subs"
  ON public.ical_subscriptions FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete their own ical subs"
  ON public.ical_subscriptions FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all ical subs"
  ON public.ical_subscriptions FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_ical_subs_updated_at
  BEFORE UPDATE ON public.ical_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ical_subs_user_active ON public.ical_subscriptions(user_id, is_active);

-- Colonnes pour relier les events à un abonnement iCal et dédupliquer par UID iCal
ALTER TABLE public.schedule_events
  ADD COLUMN IF NOT EXISTS external_uid TEXT,
  ADD COLUMN IF NOT EXISTS ical_subscription_id UUID REFERENCES public.ical_subscriptions(id) ON DELETE CASCADE;

-- Unicité par (user, abonnement, UID iCal) pour éviter les doublons à chaque sync
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_events_ical_uid
  ON public.schedule_events(user_id, ical_subscription_id, external_uid)
  WHERE external_uid IS NOT NULL AND ical_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_events_ical_sub
  ON public.schedule_events(ical_subscription_id);