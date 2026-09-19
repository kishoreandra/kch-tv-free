SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ingest-bhavcopy';
SELECT cron.schedule(
  'ingest-bhavcopy',
  '15 13 * * 1-5',
  $$ SELECT net.http_post(
       url := 'https://kch-tv.lovable.app/api/public/cron/ingest-bhavcopy',
       headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzb3dlZHppeWJlbGtkc2Nkc2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjk3NDksImV4cCI6MjA5NTAwNTc0OX0.2nr4F7nCj0MJVKbE2UJ5ueEyrjFyxtBwgQvKIOWwt8I'),
       body := '{"days":3}'::jsonb
     ); $$
);