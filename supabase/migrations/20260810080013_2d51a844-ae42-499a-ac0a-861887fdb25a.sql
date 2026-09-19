CREATE TABLE IF NOT EXISTS public.nifty500_constituents (
  symbol text PRIMARY KEY,
  company text,
  industry text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.nifty500_constituents TO authenticated;
GRANT ALL ON public.nifty500_constituents TO service_role;
ALTER TABLE public.nifty500_constituents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "constituents readable by approved users" ON public.nifty500_constituents
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND (up.approved OR up.is_admin)));

CREATE TABLE IF NOT EXISTS public.daily_prices (
  symbol text NOT NULL,
  trade_date date NOT NULL,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  prev_close numeric,
  volume bigint,
  turnover numeric,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, trade_date)
);
CREATE INDEX IF NOT EXISTS daily_prices_date_idx ON public.daily_prices (trade_date);
GRANT SELECT ON public.daily_prices TO authenticated;
GRANT ALL ON public.daily_prices TO service_role;
ALTER TABLE public.daily_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "daily prices readable by approved users" ON public.daily_prices
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND (up.approved OR up.is_admin)));

CREATE TABLE IF NOT EXISTS public.market_breadth_daily (
  trade_date date PRIMARY KEY,
  universe_count integer NOT NULL DEFAULT 0,
  liquidity_excluded integer NOT NULL DEFAULT 0,
  circuit_excluded integer NOT NULL DEFAULT 0,
  up4pct_count integer NOT NULL DEFAULT 0,
  down4pct_count integer NOT NULL DEFAULT 0,
  up4pct_ratio_5day numeric,
  up4pct_ratio_10day numeric,
  pct_above_50dma numeric,
  new_52w_highs integer NOT NULL DEFAULT 0,
  new_52w_lows integer NOT NULL DEFAULT 0,
  up25pct_month_count integer NOT NULL DEFAULT 0,
  down25pct_month_count integer NOT NULL DEFAULT 0,
  up25pct_quarter_count integer NOT NULL DEFAULT 0,
  down25pct_quarter_count integer NOT NULL DEFAULT 0,
  up50pct_month_count integer NOT NULL DEFAULT 0,
  up50pct_quarter_count integer NOT NULL DEFAULT 0,
  momentum_burst_5day_count integer NOT NULL DEFAULT 0,
  nifty_close numeric,
  history_days integer NOT NULL DEFAULT 0,
  computed_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.market_breadth_daily TO authenticated;
GRANT ALL ON public.market_breadth_daily TO service_role;
ALTER TABLE public.market_breadth_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "breadth readable by approved users" ON public.market_breadth_daily
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND (up.approved OR up.is_admin)));