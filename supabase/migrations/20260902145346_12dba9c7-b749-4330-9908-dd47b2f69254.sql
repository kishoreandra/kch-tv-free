CREATE OR REPLACE FUNCTION public.compute_market_breadth(_date date, _min_turnover numeric DEFAULT 10000000, _nifty_close numeric DEFAULT NULL::numeric)
 RETURNS market_breadth_daily
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec public.market_breadth_daily;
  v_hist integer;
BEGIN
  SELECT count(DISTINCT trade_date) INTO v_hist FROM public.daily_prices;

  WITH px AS (
    SELECT p.symbol, p.trade_date, p.close, p.high, p.low, p.turnover, p.prev_close,
           row_number() OVER (PARTITION BY p.symbol ORDER BY p.trade_date DESC) AS rn
    FROM public.daily_prices p
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
    -- 52-week highs/lows follow the exchange convention: every traded security,
    -- no liquidity filter and no minimum-history requirement.
    (SELECT count(*) FROM flagged WHERE hh252 IS NOT NULL AND h0 >= hh252)::int,
    (SELECT count(*) FROM flagged WHERE ll252 IS NOT NULL AND l0 <= ll252)::int,
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
    _nifty_close, coalesce(v_hist,0), now()
  )
  ON CONFLICT (trade_date) DO UPDATE SET
    universe_count = EXCLUDED.universe_count,
    liquidity_excluded = EXCLUDED.liquidity_excluded,
    circuit_excluded = EXCLUDED.circuit_excluded,
    up4pct_count = EXCLUDED.up4pct_count,
    down4pct_count = EXCLUDED.down4pct_count,
    pct_above_50dma = EXCLUDED.pct_above_50dma,
    new_52w_highs = EXCLUDED.new_52w_highs,
    new_52w_lows = EXCLUDED.new_52w_lows,
    up25pct_month_count = EXCLUDED.up25pct_month_count,
    down25pct_month_count = EXCLUDED.down25pct_month_count,
    up25pct_quarter_count = EXCLUDED.up25pct_quarter_count,
    down25pct_quarter_count = EXCLUDED.down25pct_quarter_count,
    up50pct_month_count = EXCLUDED.up50pct_month_count,
    up50pct_quarter_count = EXCLUDED.up50pct_quarter_count,
    momentum_burst_5day_count = EXCLUDED.momentum_burst_5day_count,
    nifty_close = coalesce(EXCLUDED.nifty_close, m.nifty_close),
    history_days = EXCLUDED.history_days,
    computed_at = now()
  RETURNING * INTO rec;

  UPDATE public.market_breadth_daily t
  SET up4pct_ratio_5day = r5.v, up4pct_ratio_10day = r10.v
  FROM (
    SELECT sum(up4pct_count)::numeric / NULLIF(sum(down4pct_count),0) AS v
    FROM (SELECT up4pct_count, down4pct_count FROM public.market_breadth_daily
          WHERE trade_date <= _date ORDER BY trade_date DESC LIMIT 5) a
  ) r5,
  (
    SELECT sum(up4pct_count)::numeric / NULLIF(sum(down4pct_count),0) AS v
    FROM (SELECT up4pct_count, down4pct_count FROM public.market_breadth_daily
          WHERE trade_date <= _date ORDER BY trade_date DESC LIMIT 10) b
  ) r10
  WHERE t.trade_date = _date;

  SELECT * INTO rec FROM public.market_breadth_daily WHERE trade_date = _date;
  RETURN rec;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.compute_market_breadth(date, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_market_breadth(date, numeric, numeric) TO service_role;