-- Supprime tous les events importés depuis un abonnement iCal
DELETE FROM public.schedule_events WHERE ical_subscription_id IS NOT NULL;

-- Retire la colonne FK puis supprime la table
ALTER TABLE public.schedule_events DROP COLUMN IF EXISTS ical_subscription_id;
DROP TABLE IF EXISTS public.ical_subscriptions;