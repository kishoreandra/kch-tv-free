ALTER TABLE public.stock_snapshot
  ADD COLUMN IF NOT EXISTS max_vol_all bigint,
  ADD COLUMN IF NOT EXISTS max_vol_252d bigint,
  ADD COLUMN IF NOT EXISTS max_vol_63d bigint,
  ADD COLUMN IF NOT EXISTS rs_rating numeric;