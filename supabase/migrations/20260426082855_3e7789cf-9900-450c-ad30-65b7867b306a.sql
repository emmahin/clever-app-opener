-- Table pour stocker les tokens OAuth Google par utilisateur
CREATE TABLE public.google_oauth_tokens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  scope TEXT NOT NULL DEFAULT '',
  google_email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.google_oauth_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view their own google tokens"
  ON public.google_oauth_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own google tokens"
  ON public.google_oauth_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own google tokens"
  ON public.google_oauth_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete their own google tokens"
  ON public.google_oauth_tokens FOR DELETE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins view all google tokens"
  ON public.google_oauth_tokens FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_google_oauth_tokens_updated_at
  BEFORE UPDATE ON public.google_oauth_tokens
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Lien event local <-> event Google Calendar
ALTER TABLE public.schedule_events
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_schedule_events_google_event_id
  ON public.schedule_events(google_event_id) WHERE google_event_id IS NOT NULL;