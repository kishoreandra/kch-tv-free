
DROP POLICY IF EXISTS "Snapshot is publicly readable" ON public.stock_snapshot;
CREATE POLICY "Snapshot readable by authenticated" ON public.stock_snapshot
  FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON public.stock_snapshot FROM anon;

DROP POLICY IF EXISTS "Users view own screens" ON public.user_screens;
DROP POLICY IF EXISTS "Users insert own screens" ON public.user_screens;
DROP POLICY IF EXISTS "Users update own screens" ON public.user_screens;
DROP POLICY IF EXISTS "Users delete own screens" ON public.user_screens;

CREATE POLICY "Users view own screens" ON public.user_screens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own screens" ON public.user_screens
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own screens" ON public.user_screens
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own screens" ON public.user_screens
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
REVOKE ALL ON public.user_screens FROM anon;
