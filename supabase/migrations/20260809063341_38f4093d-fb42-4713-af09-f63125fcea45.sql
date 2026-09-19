DO $migration$
DECLARE
  v_api_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzb3dlZHppeWJlbGtkc2Nkc2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjk3NDksImV4cCI6MjA5NTAwNTc0OX0.2nr4F7nCj0MJVKbE2UJ5ueEyrjFyxtBwgQvKIOWwt8I';
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname IN ('refresh-price-bands', 'refresh-price-bands-groww', 'refresh-price-bands-nse')
     OR jobname LIKE 'refresh-price-bands-groww-%'
     OR jobname LIKE 'refresh-price-bands-groww-close-%';

  PERFORM cron.schedule(
    'refresh-price-bands-nse',
    '30 12 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/refresh-price-bands',
      headers:=jsonb_build_object('Content-Type','application/json','apikey',%L),
      body:='{}'::jsonb); $job$, v_api_key)
  );
END
$migration$;