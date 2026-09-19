CREATE TABLE IF NOT EXISTS public.price_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol text NOT NULL,
  left_field text NOT NULL DEFAULT 'price',
  operator text NOT NULL DEFAULT 'crosses_above',
  right_field text NOT NULL DEFAULT 'value',
  right_value numeric,
  tolerance_pct numeric NOT NULL DEFAULT 1,
  note text,
  enabled boolean NOT NULL DEFAULT true,
  repeat_alert boolean NOT NULL DEFAULT false,
  last_state boolean,
  last_triggered_at timestamptz,
  last_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS price_alerts_user_idx ON public.price_alerts (user_id);
CREATE INDEX IF NOT EXISTS price_alerts_symbol_idx ON public.price_alerts (symbol);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.price_alerts TO authenticated;
GRANT ALL ON public.price_alerts TO service_role;

ALTER TABLE public.price_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage their own price alerts" ON public.price_alerts;
CREATE POLICY "Users manage their own price alerts"
ON public.price_alerts FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_price_alerts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS price_alerts_touch ON public.price_alerts;
CREATE TRIGGER price_alerts_touch
BEFORE UPDATE ON public.price_alerts
FOR EACH ROW EXECUTE FUNCTION public.touch_price_alerts();

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
                     'refresh-price-bands-groww','refresh-price-bands-nse',
                     'refresh-snapshot-morning','refresh-snapshot-midday','refresh-snapshot-close',
                     'refresh-snapshot-post','refresh-snapshot-preopen',
                     'refresh-price-bands-nse-evening','refresh-price-bands-nse-morning',
                     'evaluate-price-alerts','evaluate-price-alerts-close')
      OR jobname LIKE 'refresh-price-bands-groww-%';

  PERFORM cron.schedule('refresh-snapshot-morning', '45 4 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/refresh-snapshot',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{"offset":0,"limit":500}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  PERFORM cron.schedule('refresh-snapshot-midday', '30 7 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/refresh-snapshot',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{"offset":0,"limit":500}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  PERFORM cron.schedule('refresh-snapshot-close', '5 10 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/refresh-snapshot',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{"offset":0,"limit":500}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  PERFORM cron.schedule('refresh-snapshot-post', '30 11 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/refresh-snapshot',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{"offset":0,"limit":500}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  PERFORM cron.schedule('refresh-snapshot-preopen', '30 2 * * 1-5',
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

  PERFORM cron.schedule('refresh-price-bands-nse-evening', '30 13 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/refresh-price-bands',
      headers:=jsonb_build_object('Content-Type','application/json','apikey',%L),
      body:='{}'::jsonb); $job$, v_api_key));
  v_installed := v_installed + 1;

  PERFORM cron.schedule('refresh-price-bands-nse-morning', '30 1 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/refresh-price-bands',
      headers:=jsonb_build_object('Content-Type','application/json','apikey',%L),
      body:='{}'::jsonb); $job$, v_api_key));
  v_installed := v_installed + 1;

  PERFORM cron.schedule('evaluate-price-alerts-close', '15 10 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/evaluate-alerts',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  PERFORM cron.schedule('evaluate-price-alerts', '45 11 * * 1-5',
    format($job$ SELECT net.http_post(
      url:='https://kch-tv.lovable.app/api/public/cron/evaluate-alerts',
      headers:=jsonb_build_object('Content-Type','application/json','x-cron-secret',%L),
      body:='{}'::jsonb); $job$, _secret));
  v_installed := v_installed + 1;

  RETURN format('Installed %s cron jobs', v_installed);
END
$function$;

REVOKE EXECUTE ON FUNCTION public.install_snapshot_cron_jobs(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.install_snapshot_cron_jobs(text) TO service_role;