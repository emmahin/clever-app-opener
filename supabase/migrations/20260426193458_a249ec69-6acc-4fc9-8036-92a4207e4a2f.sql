-- ─────────────────────────────────────────────────────────────
-- Table 1 : message_moods — analyse émotionnelle par message
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.message_moods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  message_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  mood TEXT NOT NULL DEFAULT 'neutral',
  intensity NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  themes TEXT[] NOT NULL DEFAULT '{}',
  summary TEXT NOT NULL DEFAULT '',
  model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT message_moods_intensity_range CHECK (intensity >= 0 AND intensity <= 1),
  CONSTRAINT message_moods_message_unique UNIQUE (message_id)
);

CREATE INDEX idx_message_moods_user_created
  ON public.message_moods (user_id, created_at DESC);
CREATE INDEX idx_message_moods_conversation
  ON public.message_moods (conversation_id);

ALTER TABLE public.message_moods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own moods"
  ON public.message_moods FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own moods"
  ON public.message_moods FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own moods"
  ON public.message_moods FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete their own moods"
  ON public.message_moods FOR DELETE
  USING (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────
-- Table 2 : mood_insights — insights hebdomadaires auto-générés
-- ─────────────────────────────────────────────────────────────
CREATE TABLE public.mood_insights (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  insight TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'pattern',
  themes TEXT[] NOT NULL DEFAULT '{}',
  suggested_action TEXT,
  dismissed BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT mood_insights_category_valid
    CHECK (category IN ('pattern', 'positive', 'concern', 'suggestion'))
);

CREATE INDEX idx_mood_insights_user_created
  ON public.mood_insights (user_id, created_at DESC);
CREATE INDEX idx_mood_insights_user_active
  ON public.mood_insights (user_id, dismissed, created_at DESC)
  WHERE dismissed = false;

ALTER TABLE public.mood_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own insights"
  ON public.mood_insights FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own insights"
  ON public.mood_insights FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own insights"
  ON public.mood_insights FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete their own insights"
  ON public.mood_insights FOR DELETE
  USING (auth.uid() = user_id);