CREATE OR REPLACE FUNCTION public.install_breadth_cron_jobs(_secret text)
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
   WHERE jobname IN ('ingest-bhavcopy-daily','compute-breadth-daily');

  -- 19:00 IST = 13:30 UTC: official NSE Bhavcopy ingestion.
  PERFORM cron.schedule('ingest-bhavcopy-daily', '30 13 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/ingest-bhavcopy',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{"days":2}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  -- 15 minutes later: recompute breadth for the freshly stored sessions.
  PERFORM cron.schedule('compute-breadth-daily', '45 13 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/backfill-bhavcopy',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{"days":3,"mode":"compute"}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  RETURN format('Installed %s breadth cron jobs', v_installed);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.install_breadth_cron_jobs(text) FROM authenticated, anon, public;
GRANT EXECUTE ON FUNCTION public.install_breadth_cron_jobs(text) TO service_role;