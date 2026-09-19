-- Purge "phantom sessions": dates on which NSE never traded, but for which the
-- app stored a full copy of the previous session's data.
--
-- Why they exist
-- --------------
-- `nsearchives.nseindia.com` answers a date it has *no* file for with HTTP 200
-- and the previous session's CSV, rather than a 404. Verified from this machine:
--
--   14-Sep-2026 (Ganesh Chaturthi) -> served the 11-Sep file
--   01-May-2026 (Maharashtra Day)  -> served the 30-Apr file
--   15-Aug-2022 (Independence Day) -> served the 12-Aug file
--
-- The ingest used to stamp whatever it downloaded with the date it asked for, so
-- every such date became a duplicate of the day before — a phantom candle that
-- rendered as "today, same as Friday" on every chart, and a matching breadth row.
-- The writers now verify the file's own DATE1 (`assertBhavcopyForDate`), so no new
-- phantom sessions can be created; this migration removes the existing ones.
--
-- Detection is deliberately independent of the holiday list (the list was itself
-- missing 14-Sep-2026): a session is treated as a phantom only when *every* one of
-- its rows is identical — symbol, OHLC and volume — to the previous session, which
-- no two real sessions ever are. Weekday only, and never more rows than the day
-- before, since a real session's universe only grows.
--
-- Safe to re-run: the second run finds nothing.
--
-- Expected result: a single row for 2026-09-14 (echo of 2026-09-11), or no rows if
-- this was already applied.

DROP TABLE IF EXISTS pg_temp.phantom_sessions;

CREATE TEMP TABLE phantom_sessions AS
WITH per_date AS (
  SELECT trade_date,
         count(*)    AS n,
         sum(volume) AS total_volume,
         sum(close)  AS total_close
  FROM public.daily_prices
  GROUP BY trade_date
),
windowed AS (
  SELECT trade_date                                        AS d,
         lag(trade_date) OVER (ORDER BY trade_date)        AS p,
         n,
         lag(n)          OVER (ORDER BY trade_date)        AS prev_n,
         total_volume,
         lag(total_volume) OVER (ORDER BY trade_date)      AS prev_volume,
         total_close,
         lag(total_close)  OVER (ORDER BY trade_date)      AS prev_close
  FROM per_date
),
candidates AS (
  SELECT d, p
  FROM windowed
  WHERE p IS NOT NULL
    AND extract(isodow FROM d) < 6          -- a weekend can never be a session
    AND n >= 50                             -- ignore half-empty days
    AND n <= prev_n                         -- a real session never shrinks
    -- Same symbol count: the cheap sums must match exactly before we pay for a
    -- row-by-row comparison. Fewer rows: a partial backfill, compare symbol by
    -- symbol (the row-level test below is then authoritative).
    AND (n < prev_n
      OR (total_volume IS NOT DISTINCT FROM prev_volume
          AND total_close IS NOT DISTINCT FROM prev_close))
)
SELECT c.d AS trade_date, c.p AS echoed_from
FROM candidates c
WHERE (SELECT count(*)
         FROM public.daily_prices x
         JOIN public.daily_prices y ON y.symbol = x.symbol AND y.trade_date = c.p
        WHERE x.trade_date = c.d)
      = (SELECT count(*) FROM public.daily_prices x WHERE x.trade_date = c.d)
  AND NOT EXISTS (
        SELECT 1
          FROM public.daily_prices x
          JOIN public.daily_prices y ON y.symbol = x.symbol AND y.trade_date = c.p
         WHERE x.trade_date = c.d
           AND (x.open   IS DISTINCT FROM y.open
             OR x.high   IS DISTINCT FROM y.high
             OR x.low    IS DISTINCT FROM y.low
             OR x.close  IS DISTINCT FROM y.close
             OR x.volume IS DISTINCT FROM y.volume));

DELETE FROM public.daily_prices        d USING phantom_sessions p WHERE d.trade_date = p.trade_date;
DELETE FROM public.market_breadth_daily m USING phantom_sessions p WHERE m.trade_date = p.trade_date;
DELETE FROM public.breadth_daily        b USING phantom_sessions p WHERE b.day        = p.trade_date;

-- Belt and braces: no writer should ever have produced a weekend-dated row.
DELETE FROM public.daily_prices        WHERE extract(isodow FROM trade_date) >= 6;
DELETE FROM public.market_breadth_daily WHERE extract(isodow FROM trade_date) >= 6;
DELETE FROM public.breadth_daily        WHERE extract(isodow FROM day) >= 6;

-- Report what was removed (the SQL Editor shows this as the result set).
SELECT trade_date AS deleted_session, echoed_from AS was_a_copy_of
FROM phantom_sessions
ORDER BY trade_date;
