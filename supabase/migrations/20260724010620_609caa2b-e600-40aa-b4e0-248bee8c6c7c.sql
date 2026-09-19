CREATE OR REPLACE FUNCTION public.install_snapshot_cron_jobs(_secret text)
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
   WHERE jobname IN ('refresh-snapshot','refresh-snapshot-evening','snapshot-breadth','refresh-vol-maxes',
                     'refresh-stock-snapshot','snapshot-breadth-daily',
                     'refresh-price-bands','refresh-price-bands-groww');

  -- Intraday refresh: every 5 min during market hours (08:30–17:29 IST = 03:00–11:59 UTC)
  PERFORM cron.schedule('refresh-snapshot', '*/5 3-11 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/refresh-snapshot',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{"offset":0,"limit":500}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  -- Evening refresh: every 15 min from 18:00–23:45 IST (12:30–18:15 UTC) to catch
  -- post-market earnings releases (net_profit_qoq, sales_qoq, earnings_release_date).
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

  PERFORM cron.schedule('refresh-price-bands-groww', '15 4 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/refresh-price-bands-groww',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  RETURN format('Installed %s cron jobs', v_installed);
END
$function$;