
-- Tighten stock_snapshot RLS
DROP POLICY IF EXISTS "Snapshot readable by authenticated" ON public.stock_snapshot;
CREATE POLICY "Snapshot readable by approved users"
  ON public.stock_snapshot FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid()
        AND (up.approved = true OR up.is_admin = true)
    )
  );

-- Tighten breadth_daily RLS
DROP POLICY IF EXISTS "Breadth readable by authenticated" ON public.breadth_daily;
CREATE POLICY "Breadth readable by approved users"
  ON public.breadth_daily FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid()
        AND (up.approved = true OR up.is_admin = true)
    )
  );

-- Tighten admin_preset_overrides read policy
DROP POLICY IF EXISTS "approved users can read overrides" ON public.admin_preset_overrides;
CREATE POLICY "approved users can read overrides"
  ON public.admin_preset_overrides FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid()
        AND (up.approved = true OR up.is_admin = true)
    )
  );

-- Revoke execute on SECURITY DEFINER admin function from public/anon
REVOKE ALL ON FUNCTION public.install_snapshot_cron_jobs(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.install_snapshot_cron_jobs(text) TO authenticated;
