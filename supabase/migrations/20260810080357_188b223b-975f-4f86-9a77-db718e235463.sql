REVOKE ALL ON FUNCTION public.compute_market_breadth(date, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_todays_movers(date, integer) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.get_todays_movers(_date date DEFAULT NULL, _limit integer DEFAULT 50)
RETURNS TABLE (
  symbol text, trade_date date, close numeric, change_pct numeric,
  volume bigint, turnover numeric, rel_volume numeric, gain_5day numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ok AS (
    SELECT EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.user_id = auth.uid() AND (up.approved OR up.is_admin)
    ) AS allowed
  ), d AS (
    SELECT coalesce(_date, (SELECT max(trade_date) FROM public.daily_prices)) AS dt
  ), px AS (
    SELECT p.symbol, p.trade_date, p.close, p.prev_close, p.volume, p.turnover,
           row_number() OVER (PARTITION BY p.symbol ORDER BY p.trade_date DESC) AS rn
    FROM public.daily_prices p
    JOIN public.nifty500_constituents u ON u.symbol = p.symbol, d, ok
    WHERE ok.allowed AND p.trade_date <= d.dt AND p.trade_date > d.dt - INTERVAL '120 days'
  ), s AS (
    SELECT symbol,
      max(trade_date) FILTER (WHERE rn = 1) AS last_date,
      max(close) FILTER (WHERE rn = 1) AS c0,
      max(prev_close) FILTER (WHERE rn = 1) AS pc_col,
      max(close) FILTER (WHERE rn = 2) AS c1,
      max(close) FILTER (WHERE rn = 6) AS c5,
      max(volume) FILTER (WHERE rn = 1) AS v0,
      max(turnover) FILTER (WHERE rn = 1) AS t0,
      avg(volume) FILTER (WHERE rn BETWEEN 2 AND 21) AS avgv
    FROM px GROUP BY symbol
  )
  SELECT s.symbol, d.dt, s.c0,
    round((s.c0 - coalesce(s.pc_col, s.c1)) / NULLIF(coalesce(s.pc_col, s.c1), 0) * 100, 2),
    s.v0, s.t0,
    round(s.v0::numeric / NULLIF(s.avgv, 0), 2),
    round((s.c0 - s.c5) / NULLIF(s.c5, 0) * 100, 2)
  FROM s, d
  WHERE s.last_date = d.dt
    AND (
      ((s.c0 - coalesce(s.pc_col, s.c1)) / NULLIF(coalesce(s.pc_col, s.c1), 0) * 100 >= 4
        AND s.v0 > coalesce(s.avgv, 0))
      OR ((s.c0 - s.c5) / NULLIF(s.c5, 0) * 100 >= 20)
    )
  ORDER BY (s.c0 - coalesce(s.pc_col, s.c1)) / NULLIF(coalesce(s.pc_col, s.c1), 0) DESC
  LIMIT least(coalesce(_limit, 50), 200);
$$;

REVOKE ALL ON FUNCTION public.get_todays_movers(date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_todays_movers(date, integer) TO authenticated, service_role;