ALTER TABLE public.stock_snapshot
ADD COLUMN IF NOT EXISTS earnings_release_price numeric;

COMMENT ON COLUMN public.stock_snapshot.earnings_release_price IS
  'Closing price on the latest earnings release trading date, used to calculate move since earnings.';