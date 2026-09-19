ALTER TABLE public.price_bands
  ADD COLUMN IF NOT EXISTS series text,
  ADD COLUMN IF NOT EXISTS security_name text,
  ADD COLUMN IF NOT EXISTS band text,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS source_date date;

ALTER TABLE public.price_bands ALTER COLUMN band_pct DROP NOT NULL;

UPDATE public.price_bands
SET band = CASE WHEN band_pct IS NULL THEN NULL ELSE trim(to_char(band_pct, 'FM999999990.##')) END
WHERE band IS NULL;

CREATE TABLE public.price_band_fetch_log (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_successful_fetch timestamptz,
  row_count integer NOT NULL DEFAULT 0,
  last_attempt_status text NOT NULL DEFAULT 'failed' CHECK (last_attempt_status IN ('ok', 'failed')),
  last_attempt_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.price_band_fetch_log TO authenticated;
GRANT ALL ON public.price_band_fetch_log TO service_role;
ALTER TABLE public.price_band_fetch_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Approved users can read price band freshness"
ON public.price_band_fetch_log FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_profiles up
  WHERE up.user_id = auth.uid() AND (up.approved = true OR up.is_admin = true)
));

GRANT SELECT ON public.price_bands TO authenticated;
GRANT ALL ON public.price_bands TO service_role;

CREATE OR REPLACE FUNCTION public.install_snapshot_cron_jobs(_secret text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'cron'
AS $function$
DECLARE
  v_installed int := 0;
  v_api_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzb3dlZHppeWJlbGtkc2Nkc2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjk3NDksImV4cCI6MjA5NTAwNTc0OX0.2nr4F7nCj0MJVKbE2UJ5ueEyrjFyxtBwgQvKIOWwt8I';
BEGIN
  IF _secret IS NULL OR length(_secret) < 16 THEN
    RAISE EXCEPTION 'Invalid secret';
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job
   WHERE jobname IN ('refresh-snapshot','refresh-snapshot-evening','snapshot-breadth','refresh-vol-maxes',
                     'refresh-stock-snapshot','snapshot-breadth-daily','refresh-price-bands',
                     'refresh-price-bands-groww','refresh-price-bands-nse')
      OR jobname LIKE 'refresh-price-bands-groww-%'
      OR jobname LIKE 'refresh-price-bands-groww-close-%';

  PERFORM cron.schedule('refresh-snapshot', '*/5 3-11 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/refresh-snapshot',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{"offset":0,"limit":500}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  PERFORM cron.schedule('refresh-snapshot-evening', '*/15 12-18 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/refresh-snapshot',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{"offset":0,"limit":500}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  PERFORM cron.schedule('snapshot-breadth', '20 11 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/snapshot-breadth',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  PERFORM cron.schedule('refresh-vol-maxes', '0 12 * * 6',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/refresh-vol-maxes',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  PERFORM cron.schedule('refresh-price-bands-nse', '30 12 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/refresh-price-bands',
      headers:=jsonb_build_object('Content-Type','application/json','apikey',%L),
      body:='{}'::jsonb); $job$, v_api_key));
  v_installed := v_installed + 1;

  RETURN format('Installed %s cron jobs', v_installed);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.install_snapshot_cron_jobs(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.install_snapshot_cron_jobs(text) TO service_role;