CREATE OR REPLACE FUNCTION public.install_snapshot_cron_jobs(_secret text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'cron'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean := false;
  v_installed int := 0;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  SELECT is_admin INTO v_is_admin FROM public.user_profiles WHERE user_id = v_caller;
  IF NOT COALESCE(v_is_admin, false) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;
  IF _secret IS NULL OR length(_secret) < 16 THEN
    RAISE EXCEPTION 'Invalid secret';
  END IF;

  PERFORM cron.unschedule(jobid) FROM cron.job
   WHERE jobname IN ('refresh-snapshot','snapshot-breadth','refresh-vol-maxes',
                     'refresh-stock-snapshot','snapshot-breadth-daily','refresh-price-bands');

  PERFORM cron.schedule(
    'refresh-snapshot', '*/5 3-11 * * 1-5',
    format($job$
      SELECT net.http_post(
        url:='https://kch-tv.lovable.app/api/public/cron/refresh-snapshot',
        headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
        body:='{"offset":0,"limit":500}'::jsonb);
    $job$, _secret)
  );
  v_installed := v_installed + 1;

  PERFORM cron.schedule(
    'snapshot-breadth', '20 11 * * 1-5',
    format($job$
      SELECT net.http_post(
        url:='https://kch-tv.lovable.app/api/public/cron/snapshot-breadth',
        headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
        body:='{}'::jsonb);
    $job$, _secret)
  );
  v_installed := v_installed + 1;

  PERFORM cron.schedule(
    'refresh-vol-maxes', '0 12 * * 6',
    format($job$
      SELECT net.http_post(
        url:='https://kch-tv.lovable.app/api/public/cron/refresh-vol-maxes',
        headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
        body:='{}'::jsonb);
    $job$, _secret)
  );
  v_installed := v_installed + 1;

  PERFORM cron.schedule(
    'refresh-price-bands', '5 4 * * 1-5',
    format($job$
      SELECT net.http_post(
        url:='https://kch-tv.lovable.app/api/public/cron/refresh-price-bands',
        headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
        body:='{}'::jsonb);
    $job$, _secret)
  );
  v_installed := v_installed + 1;

  RETURN format('Installed %s cron jobs', v_installed);
END $function$;