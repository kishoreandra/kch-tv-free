-- Index price history for indices NSE publishes but Yahoo does not carry
-- (Nifty Healthcare, Nifty Oil & Gas, NIFTY50 Equal Weight, Smallcap 100,
-- Microcap 250, …).
--
-- Source: https://nsearchives.nseindia.com/content/indices/ind_close_all_DDMMYYYY.csv
-- Written by /api/public/cron/ingest-index-close (daily) and
-- /api/public/cron/backfill-index-close (history walk).

CREATE TABLE IF NOT EXISTS public.index_prices (
  symbol text NOT NULL,          -- "^NIFTY_OIL_GAS" — see src/lib/markets/index-close.server.ts
  index_name text NOT NULL,      -- NSE's own label, e.g. "Nifty Oil & Gas"
  trade_date date NOT NULL,
  open numeric,
  high numeric,
  low numeric,
  close numeric NOT NULL,
  volume bigint,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, trade_date)
);

CREATE INDEX IF NOT EXISTS index_prices_symbol_date_idx
  ON public.index_prices (symbol, trade_date DESC);

GRANT SELECT ON public.index_prices TO authenticated;
GRANT ALL ON public.index_prices TO service_role;

ALTER TABLE public.index_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Approved users can read index prices" ON public.index_prices;
CREATE POLICY "Approved users can read index prices" ON public.index_prices
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.user_id = auth.uid() AND (up.approved = true OR up.is_admin = true)));

-- 19:10 IST (13:40 UTC) on weekdays — after NSE publishes the index-close file,
-- and after the 19:00 IST Bhavcopy job so the two downloads don't compete.
CREATE OR REPLACE FUNCTION public.install_index_cron_jobs(_secret text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
DECLARE
  v_installed int := 0;
BEGIN
  IF _secret IS NULL OR length(_secret) < 16 THEN
    RAISE EXCEPTION 'Invalid secret';
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job
   WHERE jobname IN ('ingest-index-close-daily');

  PERFORM cron.schedule('ingest-index-close-daily', '40 13 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/ingest-index-close',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  RETURN format('Installed %s index cron jobs', v_installed);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.install_index_cron_jobs(text) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.install_index_cron_jobs(text) TO service_role;
