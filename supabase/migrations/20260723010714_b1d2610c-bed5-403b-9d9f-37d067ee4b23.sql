DROP POLICY IF EXISTS "Signed-in users can read price bands" ON public.price_bands;
CREATE POLICY "Approved users can read price bands" ON public.price_bands
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND (up.approved = true OR up.is_admin = true)));