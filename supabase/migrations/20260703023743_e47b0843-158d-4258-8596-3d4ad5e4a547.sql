
CREATE TABLE public.admin_preset_overrides (
  preset_id text PRIMARY KEY,
  filters jsonb,
  hidden boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

GRANT SELECT ON public.admin_preset_overrides TO authenticated;
GRANT ALL ON public.admin_preset_overrides TO service_role;

ALTER TABLE public.admin_preset_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approved users can read overrides"
  ON public.admin_preset_overrides
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "admins can insert overrides"
  ON public.admin_preset_overrides
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admins can update overrides"
  ON public.admin_preset_overrides
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admins can delete overrides"
  ON public.admin_preset_overrides
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- Only one row can have is_default = true.
CREATE UNIQUE INDEX admin_preset_overrides_single_default
  ON public.admin_preset_overrides ((true))
  WHERE is_default;

CREATE TRIGGER admin_preset_overrides_touch_updated_at
  BEFORE UPDATE ON public.admin_preset_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
