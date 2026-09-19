ALTER TABLE public.stock_snapshot
  ADD COLUMN IF NOT EXISTS ema10 numeric,
  ADD COLUMN IF NOT EXISTS ema100 numeric,
  ADD COLUMN IF NOT EXISTS perf_1d numeric,
  ADD COLUMN IF NOT EXISTS perf_1w numeric,
  ADD COLUMN IF NOT EXISTS adr_20 numeric,
  ADD COLUMN IF NOT EXISTS ath numeric;