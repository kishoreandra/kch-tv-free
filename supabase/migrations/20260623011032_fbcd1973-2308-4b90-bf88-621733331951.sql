CREATE TABLE public.breadth_daily (
  day date PRIMARY KEY,
  ts timestamptz NOT NULL DEFAULT now(),
  total integer NOT NULL DEFAULT 0,
  up_4pct integer NOT NULL DEFAULT 0,
  down_4pct integer NOT NULL DEFAULT 0,
  up_25pct_1m integer NOT NULL DEFAULT 0,
  down_25pct_1m integer NOT NULL DEFAULT 0,
  up_25pct_1q integer NOT NULL DEFAULT 0,
  down_25pct_1q integer NOT NULL DEFAULT 0,
  above_ema50 integer NOT NULL DEFAULT 0,
  above_ema200 integer NOT NULL DEFAULT 0,
  new_highs_52w integer NOT NULL DEFAULT 0,
  new_lows_52w integer NOT NULL DEFAULT 0,
  t2108 numeric
);

GRANT SELECT ON public.breadth_daily TO authenticated;
GRANT ALL ON public.breadth_daily TO service_role;

ALTER TABLE public.breadth_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Breadth readable by authenticated"
  ON public.breadth_daily FOR SELECT
  TO authenticated
  USING (true);
