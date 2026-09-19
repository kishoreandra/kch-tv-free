ALTER TABLE public.stock_snapshot
  ADD COLUMN IF NOT EXISTS net_profit_yoy numeric,
  ADD COLUMN IF NOT EXISTS sales_yoy numeric;