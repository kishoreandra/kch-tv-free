ALTER TABLE public.stock_snapshot ADD COLUMN IF NOT EXISTS first_trade_date timestamptz;
CREATE INDEX IF NOT EXISTS stock_snapshot_first_trade_date_idx ON public.stock_snapshot (first_trade_date);