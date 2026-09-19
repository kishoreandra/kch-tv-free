CREATE OR REPLACE FUNCTION public.compute_market_breadth(
  _date date,
  _min_turnover numeric DEFAULT 10000000,
  _nifty_close numeric DEFAULT NULL
)
RETURNS public.market_breadth_daily
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public.market_breadth_daily;
  v_hist integer;
BEGIN
  SELECT count(DISTINCT trade_date) INTO v_hist FROM public.daily_prices;

  WITH px AS (
    SELECT p.symbol, p.trade_date, p.close, p.high, p.low, p.turnover, p.prev_close,
           row_number() OVER (PARTITION BY p.symbol ORDER BY p.trade_date DESC) AS rn
    FROM public.daily_prices p
    JOIN public.nifty500_constituents u ON u.symbol = p.symbol
    WHERE p.trade_date <= _date AND p.trade_date > _date - INTERVAL '420 days'
  ),
  stats AS (
    SELECT symbol,
      max(trade_date) FILTER (WHERE rn = 1) AS last_date,
      max(close) FILTER (WHERE rn = 1) AS c0,
      max(high) FILTER (WHERE rn = 1) AS h0,
      min(low) FILTER (WHERE rn = 1) AS l0,
      max(prev_close) FILTER (WHERE rn = 1) AS pc_col,
      max(close) FILTER (WHERE rn = 2) AS c1,
      max(close) FILTER (WHERE rn = 6) AS c5,
      max(close) FILTER (WHERE rn = 22) AS c21,
      max(close) FILTER (WHERE rn = 64) AS c63,
      avg(close) FILTER (WHERE rn <= 50) AS ma50,
      count(*) FILTER (WHERE rn <= 50) AS n50,
      max(high) FILTER (WHERE rn <= 252) AS hh252,
      min(low) FILTER (WHERE rn <= 252) AS ll252,
      count(*) FILTER (WHERE rn <= 252) AS n252,
      avg(turnover) FILTER (WHERE rn <= 20) AS avg_to
    FROM px GROUP BY symbol
  ),
  base AS (
    SELECT s.*,
      coalesce(s.pc_col, s.c1) AS pc,
      b.band_pct
    FROM stats s
    LEFT JOIN public.price_bands b ON b.symbol = s.symbol
    WHERE s.last_date = _date AND s.c0 IS NOT NULL
  ),
  scored AS (
    SELECT b.*,
      CASE WHEN b.pc IS NOT NULL AND b.pc > 0 THEN (b.c0 - b.pc) / b.pc * 100 END AS chg,
      (b.avg_to IS NOT NULL AND b.avg_to >= _min_turnover) AS liquid
    FROM base b
  ),
  flagged AS (
    SELECT s.*,
      (s.band_pct IS NOT NULL AND s.chg IS NOT NULL AND abs(s.chg) >= s.band_pct - 0.1) AS frozen
    FROM scored s
  ),
  elig AS (SELECT * FROM flagged WHERE liquid)
  SELECT
    (SELECT count(*) FROM elig)::int,
    (SELECT count(*) FROM flagged WHERE NOT liquid)::int,
    (SELECT count(*) FROM elig WHERE frozen)::int,
    (SELECT count(*) FROM elig WHERE NOT frozen AND chg >= 4)::int,
    (SELECT count(*) FROM elig WHERE NOT frozen AND chg <= -4)::int,
    (SELECT round(avg(CASE WHEN ma50 IS NOT NULL AND n50 >= 50 AND c0 > ma50 THEN 100.0 ELSE 0 END), 2)
       FROM elig WHERE ma50 IS NOT NULL AND n50 >= 50),
    (SELECT count(*) FROM elig WHERE n252 >= 200 AND h0 >= hh252)::int,
    (SELECT count(*) FROM elig WHERE n252 >= 200 AND l0 <= ll252)::int,
    (SELECT count(*) FROM elig WHERE c21 IS NOT NULL AND c21 > 0 AND (c0 - c21) / c21 * 100 >= 25)::int,
    (SELECT count(*) FROM elig WHERE c21 IS NOT NULL AND c21 > 0 AND (c0 - c21) / c21 * 100 <= -25)::int,
    (SELECT count(*) FROM elig WHERE c63 IS NOT NULL AND c63 > 0 AND (c0 - c63) / c63 * 100 >= 25)::int,
    (SELECT count(*) FROM elig WHERE c63 IS NOT NULL AND c63 > 0 AND (c0 - c63) / c63 * 100 <= -25)::int,
    (SELECT count(*) FROM elig WHERE c21 IS NOT NULL AND c21 > 0 AND (c0 - c21) / c21 * 100 >= 50)::int,
    (SELECT count(*) FROM elig WHERE c63 IS NOT NULL AND c63 > 0 AND (c0 - c63) / c63 * 100 >= 50)::int,
    (SELECT count(*) FROM elig WHERE c5 IS NOT NULL AND c5 > 0 AND (c0 - c5) / c5 * 100 >= 20)::int
  INTO
    rec.universe_count, rec.liquidity_excluded, rec.circuit_excluded,
    rec.up4pct_count, rec.down4pct_count, rec.pct_above_50dma,
    rec.new_52w_highs, rec.new_52w_lows,
    rec.up25pct_month_count, rec.down25pct_month_count,
    rec.up25pct_quarter_count, rec.down25pct_quarter_count,
    rec.up50pct_month_count, rec.up50pct_quarter_count,
    rec.momentum_burst_5day_count;

  INSERT INTO public.market_breadth_daily AS m (
    trade_date, universe_count, liquidity_excluded, circuit_excluded,
    up4pct_count, down4pct_count, pct_above_50dma, new_52w_highs, new_52w_lows,
    up25pct_month_count, down25pct_month_count, up25pct_quarter_count, down25pct_quarter_count,
    up50pct_month_count, up50pct_quarter_count, momentum_burst_5day_count,
    nifty_close, history_days, computed_at
  ) VALUES (
    _date, coalesce(rec.universe_count,0), coalesce(rec.liquidity_excluded,0), coalesce(rec.circuit_excluded,0),
    coalesce(rec.up4pct_count,0), coalesce(rec.down4pct_count,0), rec.pct_above_50dma,
    coalesce(rec.new_52w_highs,0), coalesce(rec.new_52w_lows,0),
    coalesce(rec.up25pct_month_count,0), coalesce(rec.down25pct_month_count,0),
    coalesce(rec.up25pct_quarter_count,0), coalesce(rec.down25pct_quarter_count,0),
    coalesce(rec.up50pct_month_count,0), coalesce(rec.up50pct_quarter_count,0),
    coalesce(rec.momentum_burst_5day_count,0),
    _nifty_close, v_hist, now()
  )
  ON CONFLICT (trade_date) DO UPDATE SET
    universe_count = excluded.universe_count,
    liquidity_excluded = excluded.liquidity_excluded,
    circuit_excluded = excluded.circuit_excluded,
    up4pct_count = excluded.up4pct_count,
    down4pct_count = excluded.down4pct_count,
    pct_above_50dma = excluded.pct_above_50dma,
    new_52w_highs = excluded.new_52w_highs,
    new_52w_lows = excluded.new_52w_lows,
    up25pct_month_count = excluded.up25pct_month_count,
    down25pct_month_count = excluded.down25pct_month_count,
    up25pct_quarter_count = excluded.up25pct_quarter_count,
    down25pct_quarter_count = excluded.down25pct_quarter_count,
    up50pct_month_count = excluded.up50pct_month_count,
    up50pct_quarter_count = excluded.up50pct_quarter_count,
    momentum_burst_5day_count = excluded.momentum_burst_5day_count,
    nifty_close = coalesce(excluded.nifty_close, m.nifty_close),
    history_days = excluded.history_days,
    computed_at = now();

  -- trailing 5/10 session ratios, recomputed for this date and the next few
  WITH w AS (
    SELECT trade_date,
      sum(up4pct_count) OVER (ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS u5,
      sum(down4pct_count) OVER (ORDER BY trade_date ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS d5,
      sum(up4pct_count) OVER (ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) AS u10,
      sum(down4pct_count) OVER (ORDER BY trade_date ROWS BETWEEN 9 PRECEDING AND CURRENT ROW) AS d10
    FROM public.market_breadth_daily
  )
  UPDATE public.market_breadth_daily m
     SET up4pct_ratio_5day = round(w.u5::numeric / NULLIF(w.d5, 0), 3),
         up4pct_ratio_10day = round(w.u10::numeric / NULLIF(w.d10, 0), 3)
    FROM w
   WHERE w.trade_date = m.trade_date AND m.trade_date >= _date - 10;

  SELECT * INTO rec FROM public.market_breadth_daily WHERE trade_date = _date;
  RETURN rec;
END;
$$;

REVOKE ALL ON FUNCTION public.compute_market_breadth(date, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.compute_market_breadth(date, numeric, numeric) TO service_role;

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
  WITH d AS (
    SELECT coalesce(_date, (SELECT max(trade_date) FROM public.daily_prices)) AS dt
  ), px AS (
    SELECT p.symbol, p.trade_date, p.close, p.prev_close, p.volume, p.turnover,
           row_number() OVER (PARTITION BY p.symbol ORDER BY p.trade_date DESC) AS rn
    FROM public.daily_prices p
    JOIN public.nifty500_constituents u ON u.symbol = p.symbol, d
    WHERE p.trade_date <= d.dt AND p.trade_date > d.dt - INTERVAL '120 days'
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
  SELECT s.symbol, (SELECT dt FROM d), s.c0,
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

REVOKE ALL ON FUNCTION public.get_todays_movers(date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_todays_movers(date, integer) TO authenticated, service_role;