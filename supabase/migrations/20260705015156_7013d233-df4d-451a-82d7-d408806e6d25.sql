
-- 1) Per-scanner column overrides
ALTER TABLE public.admin_preset_overrides
  ADD COLUMN IF NOT EXISTS columns JSONB;

-- 2) Common (cross-scanner) settings — singleton row model with rules
CREATE TABLE IF NOT EXISTS public.admin_common_settings (
  id TEXT PRIMARY KEY DEFAULT 'singleton',
  common_filters JSONB NOT NULL DEFAULT '[]'::jsonb,
  common_columns JSONB,
  apply_scope TEXT NOT NULL DEFAULT 'all',   -- 'all' | 'selected' | 'excluded'
  apply_ids TEXT[] NOT NULL DEFAULT '{}',
  columns_scope TEXT NOT NULL DEFAULT 'all', -- 'all' | 'selected' | 'excluded'
  columns_ids TEXT[] NOT NULL DEFAULT '{}',
  updated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT admin_common_settings_singleton CHECK (id = 'singleton')
);

GRANT SELECT ON public.admin_common_settings TO authenticated;
GRANT ALL ON public.admin_common_settings TO service_role;

ALTER TABLE public.admin_common_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approved read common" ON public.admin_common_settings;
CREATE POLICY "approved read common" ON public.admin_common_settings
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid()
        AND (up.approved = true OR up.is_admin = true)
    )
  );

DROP POLICY IF EXISTS "admin write common" ON public.admin_common_settings;
CREATE POLICY "admin write common" ON public.admin_common_settings
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.admin_common_settings (id) VALUES ('singleton')
ON CONFLICT (id) DO NOTHING;
