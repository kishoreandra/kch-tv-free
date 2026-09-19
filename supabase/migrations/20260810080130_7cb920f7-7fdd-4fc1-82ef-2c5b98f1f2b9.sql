CREATE TABLE IF NOT EXISTS public.journal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  period_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  content text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, period_type, period_start)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_notes TO authenticated;
GRANT ALL ON public.journal_notes TO service_role;
ALTER TABLE public.journal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own journal notes" ON public.journal_notes
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER journal_notes_touch_updated_at BEFORE UPDATE ON public.journal_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();