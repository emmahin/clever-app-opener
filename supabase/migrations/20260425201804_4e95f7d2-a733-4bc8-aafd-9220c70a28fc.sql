-- ============================================
-- USER MEMORIES (faits / habitudes / préférences)
-- ============================================
CREATE TABLE public.user_memories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL DEFAULT 'fact',
  -- 'habit' | 'preference' | 'goal' | 'fact' | 'emotion' | 'relationship'
  content TEXT NOT NULL,
  importance INTEGER NOT NULL DEFAULT 3, -- 1..5
  source TEXT NOT NULL DEFAULT 'conversation', -- 'conversation' | 'manual' | 'voice'
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_referenced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_memories_category_chk CHECK (category IN ('habit','preference','goal','fact','emotion','relationship')),
  CONSTRAINT user_memories_importance_chk CHECK (importance BETWEEN 1 AND 5)
);

ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own memories"
  ON public.user_memories FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own memories"
  ON public.user_memories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own memories"
  ON public.user_memories FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete their own memories"
  ON public.user_memories FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all memories"
  ON public.user_memories FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_user_memories_user ON public.user_memories(user_id, created_at DESC);
CREATE INDEX idx_user_memories_category ON public.user_memories(user_id, category);

CREATE TRIGGER trg_user_memories_updated
  BEFORE UPDATE ON public.user_memories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- CONVERSATION SUMMARIES
-- ============================================
CREATE TABLE public.conversation_summaries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  period TEXT NOT NULL DEFAULT 'daily', -- 'daily' | 'weekly' | 'session'
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL,
  patterns JSONB NOT NULL DEFAULT '{}'::jsonb,
  emotional_tone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT conv_summaries_period_chk CHECK (period IN ('daily','weekly','session'))
);

ALTER TABLE public.conversation_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own summaries"
  ON public.conversation_summaries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own summaries"
  ON public.conversation_summaries FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own summaries"
  ON public.conversation_summaries FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all summaries"
  ON public.conversation_summaries FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_conv_summaries_user ON public.conversation_summaries(user_id, period_start DESC);

-- ============================================
-- SCHEDULE EVENTS (agenda partagé tous appareils)
-- ============================================
CREATE TABLE public.schedule_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  start_iso TIMESTAMPTZ NOT NULL,
  end_iso TIMESTAMPTZ,
  location TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'ai' | 'voice'
  external_id TEXT, -- pour synchro Google Calendar future
  external_provider TEXT, -- 'google_calendar' | null
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schedule_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own events"
  ON public.schedule_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own events"
  ON public.schedule_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own events"
  ON public.schedule_events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete their own events"
  ON public.schedule_events FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all events"
  ON public.schedule_events FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_schedule_events_user_start ON public.schedule_events(user_id, start_iso);

CREATE TRIGGER trg_schedule_events_updated
  BEFORE UPDATE ON public.schedule_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();