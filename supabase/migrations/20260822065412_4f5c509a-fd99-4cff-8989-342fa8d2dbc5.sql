ALTER TABLE public.custom_reminders
  ADD COLUMN IF NOT EXISTS repeat_minutes integer,
  ADD COLUMN IF NOT EXISTS repeat_until timestamptz,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz;