-- ============== stock_snapshot ==============
CREATE TABLE public.stock_snapshot (
  symbol text PRIMARY KEY,
  ticker text NOT NULL,
  name text,
  sector text,
  exchange text NOT NULL DEFAULT 'NSE',
  price numeric,
  prev_close numeric,
  change_pct numeric,
  volume bigint,
  avg_vol_10d bigint,
  avg_vol_30d bigint,
  rel_vol numeric,
  liquidity numeric,
  market_cap numeric,
  pe_ratio numeric,
  dividend_yield numeric,
  ema20 numeric,
  ema50 numeric,
  ema200 numeric,
  rsi14 numeric,
  perf_1m numeric,
  perf_3m numeric,
  perf_6m numeric,
  perf_1y numeric,
  perf_ytd numeric,
  high_52w numeric,
  low_52w numeric,
  pct_from_52w_high numeric,
  pct_from_52w_low numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_snapshot_market_cap ON public.stock_snapshot(market_cap);
CREATE INDEX idx_stock_snapshot_sector ON public.stock_snapshot(sector);

GRANT SELECT ON public.stock_snapshot TO anon, authenticated;
GRANT ALL ON public.stock_snapshot TO service_role;

ALTER TABLE public.stock_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Snapshot is publicly readable"
  ON public.stock_snapshot FOR SELECT
  USING (true);

-- ============== user_screens ==============
CREATE TABLE public.user_screens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  filters jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_screens_user_id ON public.user_screens(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_screens TO authenticated;
GRANT ALL ON public.user_screens TO service_role;

ALTER TABLE public.user_screens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own screens"
  ON public.user_screens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own screens"
  ON public.user_screens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own screens"
  ON public.user_screens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own screens"
  ON public.user_screens FOR DELETE
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_user_screens_updated_at
  BEFORE UPDATE ON public.user_screens
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== pg_cron + pg_net for daily refresh ==============
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;