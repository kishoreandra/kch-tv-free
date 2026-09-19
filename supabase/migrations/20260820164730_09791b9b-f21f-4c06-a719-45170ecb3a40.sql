CREATE TABLE public.custom_reminders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  send_at timestamptz NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_reminders TO authenticated;
GRANT ALL ON public.custom_reminders TO service_role;

ALTER TABLE public.custom_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own reminders"
  ON public.custom_reminders FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER custom_reminders_touch_updated_at
  BEFORE UPDATE ON public.custom_reminders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX custom_reminders_due_idx ON public.custom_reminders (send_at) WHERE enabled AND sent_at IS NULL;