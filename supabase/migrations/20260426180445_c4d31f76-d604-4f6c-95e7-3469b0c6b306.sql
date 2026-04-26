-- 1) CONVERSATIONS
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Nouveau chat',
  last_message_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_user_recent ON public.conversations(user_id, last_message_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own conversations" ON public.conversations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own conversations" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own conversations" ON public.conversations
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own conversations" ON public.conversations
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins view all conversations" ON public.conversations
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) CHAT MESSAGES
CREATE TABLE public.chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL DEFAULT '',
  widgets JSONB NOT NULL DEFAULT '[]'::jsonb,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_conv ON public.chat_messages(conversation_id, position ASC);
CREATE INDEX idx_chat_messages_user ON public.chat_messages(user_id);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own messages" ON public.chat_messages
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own messages" ON public.chat_messages
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own messages" ON public.chat_messages
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own messages" ON public.chat_messages
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins view all messages" ON public.chat_messages
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- 3) SAVED PROJECTS
CREATE TABLE public.saved_projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'Sans titre',
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_saved_projects_user_cat ON public.saved_projects(user_id, category, updated_at DESC);

ALTER TABLE public.saved_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own projects" ON public.saved_projects
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own projects" ON public.saved_projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own projects" ON public.saved_projects
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own projects" ON public.saved_projects
  FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins view all projects" ON public.saved_projects
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_saved_projects_updated_at
  BEFORE UPDATE ON public.saved_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) EVENT NOTIFICATIONS — autoriser DELETE pour les users
CREATE POLICY "Users delete own event notifs" ON public.event_notifications
  FOR DELETE USING (auth.uid() = user_id);