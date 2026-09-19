CREATE OR REPLACE FUNCTION public.install_snapshot_cron_jobs(_secret text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
DECLARE
  v_installed int := 0;
  v_i int;
  v_offset int;
  v_min int;
BEGIN
  IF _secret IS NULL OR length(_secret) < 16 THEN
    RAISE EXCEPTION 'Invalid secret';
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job
   WHERE jobname IN ('refresh-snapshot','refresh-snapshot-evening','snapshot-breadth','refresh-vol-maxes',
                     'refresh-stock-snapshot','snapshot-breadth-daily',
                     'refresh-price-bands','refresh-price-bands-groww')
      OR jobname LIKE 'refresh-price-bands-groww-%';

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

  -- Price bands: the endpoint can only fetch ~800 symbols per invocation
  -- (Cloudflare subrequest cap), so fan out 10 staggered pages to cover the
  -- whole ~8k NSE universe every weekday morning (03:15-03:42 UTC).
  FOR v_i IN 0..9 LOOP
    v_offset := v_i * 800;
    v_min := 15 + (v_i * 3);
    PERFORM cron.schedule(
      format('refresh-price-bands-groww-%s', v_i),
      format('%s 3 * * 1-5', v_min),
      format($job$ SELECT net.http_post(
        url:='https://kch-tv.lovable.app/api/public/cron/refresh-price-bands-groww',
        headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
        body:=%L::jsonb); $job$, _secret, json_build_object('offset', v_offset, 'limit', 800)::text));
    v_installed := v_installed + 1;
  END LOOP;

  RETURN format('Installed %s cron jobs', v_installed);
END
$function$;