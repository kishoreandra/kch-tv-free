CREATE SCHEMA IF NOT EXISTS app_private;

CREATE OR REPLACE FUNCTION app_private.is_admin(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (SELECT 1 FROM public.user_profiles WHERE user_id = _uid AND is_admin = true);
$function$;

REVOKE ALL ON FUNCTION app_private.is_admin(uuid) FROM PUBLIC;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_admin(uuid) TO authenticated, service_role;

ALTER POLICY "admin write common" ON public.admin_common_settings
  USING (app_private.is_admin(auth.uid()))
  WITH CHECK (app_private.is_admin(auth.uid()));

ALTER POLICY "admins can delete overrides" ON public.admin_preset_overrides
  USING (app_private.is_admin(auth.uid()));
ALTER POLICY "admins can insert overrides" ON public.admin_preset_overrides
  WITH CHECK (app_private.is_admin(auth.uid()));
ALTER POLICY "admins can update overrides" ON public.admin_preset_overrides
  USING (app_private.is_admin(auth.uid()))
  WITH CHECK (app_private.is_admin(auth.uid()));

ALTER POLICY "preset_groups writable by admins" ON public.preset_groups
  USING (app_private.is_admin(auth.uid()))
  WITH CHECK (app_private.is_admin(auth.uid()));

ALTER POLICY "Admin reads all profiles" ON public.user_profiles
  USING (app_private.is_admin(auth.uid()));
ALTER POLICY "Admin updates approval" ON public.user_profiles
  USING (app_private.is_admin(auth.uid()))
  WITH CHECK (app_private.is_admin(auth.uid()));

REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO service_role;