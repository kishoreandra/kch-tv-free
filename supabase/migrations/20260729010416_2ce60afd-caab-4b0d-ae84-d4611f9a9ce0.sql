ALTER TABLE public.stock_snapshot
  ADD COLUMN IF NOT EXISTS week_open numeric,
  ADD COLUMN IF NOT EXISTS prev_week_close numeric,
  ADD COLUMN IF NOT EXISTS week_gap_pct numeric,
  ADD COLUMN IF NOT EXISTS week_low numeric;