ALTER TABLE public.stock_snapshot
  ADD COLUMN IF NOT EXISTS max_vol_all_age_days int,
  ADD COLUMN IF NOT EXISTS rs_score_raw numeric,
  ADD COLUMN IF NOT EXISTS rs_rating_n50 numeric,
  ADD COLUMN IF NOT EXISTS rs_rating_n100 numeric,
  ADD COLUMN IF NOT EXISTS rs_rating_n200 numeric,
  ADD COLUMN IF NOT EXISTS rs_rating_n500 numeric;