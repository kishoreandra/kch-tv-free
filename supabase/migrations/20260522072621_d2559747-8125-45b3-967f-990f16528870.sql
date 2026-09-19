
-- User data table: one row per user holding all synced state as jsonb.
create table if not exists public.user_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  panes jsonb,
  indicators jsonb,
  chart_cfg jsonb,
  selected text,
  watchlist jsonb,
  lists jsonb,
  last_list_id text,
  alerts jsonb,
  alert_sound boolean default false,
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

create policy "Users can view own data"
  on public.user_data for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own data"
  on public.user_data for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own data"
  on public.user_data for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own data"
  on public.user_data for delete
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

create trigger user_data_touch_updated_at
  before update on public.user_data
  for each row execute function public.touch_updated_at();
