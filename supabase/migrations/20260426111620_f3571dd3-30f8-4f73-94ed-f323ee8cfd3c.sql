-- 1. push_subscriptions
CREATE TABLE public.push_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_subs_user ON public.push_subscriptions(user_id);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own push subs" ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own push subs" ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own push subs" ON public.push_subscriptions
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own push subs" ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins view all push subs" ON public.push_subscriptions
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 2. event_notifications (anti-doublon)
CREATE TABLE public.event_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  event_id uuid NOT NULL,
  kind text NOT NULL DEFAULT 'reminder',
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(event_id, kind)
);
CREATE INDEX idx_event_notifs_user ON public.event_notifications(user_id);
ALTER TABLE public.event_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own event notifs" ON public.event_notifications
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins view all event notifs" ON public.event_notifications
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 3. user_settings: proactive prefs
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS proactive_last_run_at timestamptz,
  ADD COLUMN IF NOT EXISTS proactive_prefs jsonb NOT NULL DEFAULT
    '{"agenda_reminders":true,"ai_suggestions":true,"quiet_start":22,"quiet_end":8,"quiet_enabled":false}'::jsonb;