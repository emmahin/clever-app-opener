-- 1. Table des règles récurrentes
CREATE TABLE public.recurring_schedule_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time TIME NOT NULL,
  end_time TIME,
  location TEXT,
  notes TEXT,
  active_from DATE NOT NULL DEFAULT CURRENT_DATE,
  active_until DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  skip_school_holidays BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_schedule_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own recurring rules"
ON public.recurring_schedule_rules FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own recurring rules"
ON public.recurring_schedule_rules FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own recurring rules"
ON public.recurring_schedule_rules FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users delete their own recurring rules"
ON public.recurring_schedule_rules FOR DELETE
USING (auth.uid() = user_id);

CREATE POLICY "Admins view all recurring rules"
ON public.recurring_schedule_rules FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_recurring_rules_updated_at
BEFORE UPDATE ON public.recurring_schedule_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_recurring_rules_user_active
ON public.recurring_schedule_rules(user_id, is_active)
WHERE is_active = true;

-- 2. Zone scolaire dans les settings
ALTER TABLE public.user_settings
ADD COLUMN school_zone TEXT NOT NULL DEFAULT 'none'
CHECK (school_zone IN ('none', 'A', 'B', 'C'));

-- 3. Lien entre event et règle (anti-doublons)
ALTER TABLE public.schedule_events
ADD COLUMN recurring_rule_id UUID REFERENCES public.recurring_schedule_rules(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_schedule_events_rule_start
ON public.schedule_events(user_id, recurring_rule_id, start_iso)
WHERE recurring_rule_id IS NOT NULL;

-- 4. Activer pg_cron + pg_net pour le job quotidien
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;