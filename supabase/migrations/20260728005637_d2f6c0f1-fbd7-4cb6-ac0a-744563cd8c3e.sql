DROP POLICY IF EXISTS "approved users can read overrides" ON public.admin_preset_overrides;

CREATE POLICY "approved users can read overrides"
  ON public.admin_preset_overrides
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      WHERE up.user_id = auth.uid()
        AND (up.approved = true OR up.is_admin = true)
    )
  );