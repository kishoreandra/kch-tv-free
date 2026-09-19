-- Extend admin_preset_overrides to support grouping and unlocking presets.
ALTER TABLE public.admin_preset_overrides
  ADD COLUMN IF NOT EXISTS group_name text,
  ADD COLUMN IF NOT EXISTS unlocked boolean NOT NULL DEFAULT false;

-- Admin-defined preset groups (Daily, Weekly, custom names) with sort order.
CREATE TABLE IF NOT EXISTS public.preset_groups (
  name text PRIMARY KEY,
  sort_order integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.preset_groups TO authenticated;
GRANT ALL ON public.preset_groups TO service_role;

ALTER TABLE public.preset_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "preset_groups readable by approved users" ON public.preset_groups;
CREATE POLICY "preset_groups readable by approved users"
  ON public.preset_groups FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles p
      WHERE p.user_id = auth.uid()
        AND (p.approved OR p.is_admin)
    )
  );

DROP POLICY IF EXISTS "preset_groups writable by admins" ON public.preset_groups;
CREATE POLICY "preset_groups writable by admins"
  ON public.preset_groups FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- Seed the two canonical groups.
INSERT INTO public.preset_groups(name, sort_order) VALUES
  ('Daily', 10), ('Weekly', 20), ('Playbooks', 30), ('Volume', 40), ('General', 100)
ON CONFLICT (name) DO NOTHING;