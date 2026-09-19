
CREATE TABLE public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  entry_price numeric not null check (entry_price > 0),
  exit_price numeric check (exit_price is null or exit_price > 0),
  quantity integer not null check (quantity > 0),
  entry_at timestamptz not null,
  exit_at timestamptz,
  setup text,
  rationale text,
  outcome text,
  notes text,
  tags text[] not null default '{}',
  status text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;

ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trades_select_own_approved" ON public.trades FOR SELECT TO authenticated
  USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND (p.approved = true OR p.is_admin = true)));
CREATE POLICY "trades_insert_own_approved" ON public.trades FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND (p.approved = true OR p.is_admin = true)));
CREATE POLICY "trades_update_own_approved" ON public.trades FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND (p.approved = true OR p.is_admin = true)))
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "trades_delete_own_approved" ON public.trades FOR DELETE TO authenticated
  USING (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.user_id = auth.uid() AND (p.approved = true OR p.is_admin = true)));

CREATE INDEX trades_user_entry_idx ON public.trades (user_id, entry_at DESC);

CREATE TRIGGER trades_touch_updated_at BEFORE UPDATE ON public.trades
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
