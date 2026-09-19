CREATE TABLE IF NOT EXISTS public.data_ingest_status (
  id text PRIMARY KEY,
  expected_date date,
  fetched_date date,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  rows_ingested integer NOT NULL DEFAULT 0,
  symbols_checked integer NOT NULL DEFAULT 0,
  missing_symbols text[] NOT NULL DEFAULT '{}',
  message text,
  last_attempt_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.data_ingest_status TO authenticated;
GRANT ALL ON public.data_ingest_status TO service_role;

ALTER TABLE public.data_ingest_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read ingest status" ON public.data_ingest_status;
CREATE POLICY "Authenticated users can read ingest status"
  ON public.data_ingest_status FOR SELECT TO authenticated USING (true);

SELECT cron.unschedule('ingest-daily-retry') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingest-daily-retry');

SELECT cron.schedule(
  'ingest-daily-retry',
  '*/20 12-15 * * 1-5',
  $$SELECT net.http_post(
      url := 'https://kch-tv.lovable.app/api/public/cron/ingest-daily',
      headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzb3dlZHppeWJlbGtkc2Nkc2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjk3NDksImV4cCI6MjA5NTAwNTc0OX0.2nr4F7nCj0MJVKbE2UJ5ueEyrjFyxtBwgQvKIOWwt8I'),
      body := '{}'::jsonb
    );$$
);