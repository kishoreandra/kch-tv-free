ALTER TABLE public.stock_snapshot
  ADD COLUMN IF NOT EXISTS day_low numeric;