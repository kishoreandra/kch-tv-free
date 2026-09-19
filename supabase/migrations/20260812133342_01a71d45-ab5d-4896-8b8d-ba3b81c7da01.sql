
ALTER TABLE public.admin_common_settings
  ADD COLUMN IF NOT EXISTS hide_per_sector_save boolean NOT NULL DEFAULT false;

CREATE TABLE public.circuit_bands_history (
  id bigserial PRIMARY KEY,
  symbol text NOT NULL,
  band text,
  band_pct numeric,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  snapshot_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cbh_symbol_fetched ON public.circuit_bands_history (symbol, fetched_at DESC);
GRANT SELECT ON public.circuit_bands_history TO authenticated;
GRANT ALL ON public.circuit_bands_history TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.circuit_bands_history_id_seq TO service_role;
ALTER TABLE public.circuit_bands_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read band history"
  ON public.circuit_bands_history FOR SELECT TO authenticated USING (true);

CREATE TABLE public.circuit_band_changes (
  id bigserial PRIMARY KEY,
  symbol text NOT NULL,
  old_band text,
  new_band text,
  old_band_pct numeric,
  new_band_pct numeric,
  detected_at timestamptz NOT NULL DEFAULT now(),
  notified boolean NOT NULL DEFAULT false,
  digested boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cbc_detected ON public.circuit_band_changes (detected_at DESC);
CREATE INDEX idx_cbc_symbol ON public.circuit_band_changes (symbol);
GRANT SELECT ON public.circuit_band_changes TO authenticated;
GRANT ALL ON public.circuit_band_changes TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.circuit_band_changes_id_seq TO service_role;
ALTER TABLE public.circuit_band_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can read band changes"
  ON public.circuit_band_changes FOR SELECT TO authenticated USING (true);

CREATE TABLE public.band_watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  symbol text NOT NULL,
  notes text,
  added_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.band_watchlist TO authenticated;
GRANT ALL ON public.band_watchlist TO service_role;
ALTER TABLE public.band_watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own band watchlist"
  ON public.band_watchlist FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_band_watchlist()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

CREATE TRIGGER update_band_watchlist_updated_at
  BEFORE UPDATE ON public.band_watchlist
  FOR EACH ROW EXECUTE FUNCTION public.touch_band_watchlist();

SELECT cron.unschedule('refresh-price-bands-nse');
SELECT cron.schedule(
  'refresh-price-bands-nse',
  '30 13 * * 1-5',
  $$SELECT net.http_post(
      url := 'https://kch-tv.lovable.app/api/public/cron/refresh-price-bands',
      headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzb3dlZHppeWJlbGtkc2Nkc2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjk3NDksImV4cCI6MjA5NTAwNTc0OX0.2nr4F7nCj0MJVKbE2UJ5ueEyrjFyxtBwgQvKIOWwt8I'),
      body := '{}'::jsonb
    );$$
);
SELECT cron.schedule(
  'refresh-price-bands-nse-morning',
  '30 1 * * 1-5',
  $$SELECT net.http_post(
      url := 'https://kch-tv.lovable.app/api/public/cron/refresh-price-bands',
      headers := jsonb_build_object('Content-Type','application/json','apikey','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzb3dlZHppeWJlbGtkc2Nkc2tqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk0Mjk3NDksImV4cCI6MjA5NTAwNTc0OX0.2nr4F7nCj0MJVKbE2UJ5ueEyrjFyxtBwgQvKIOWwt8I'),
      body := '{}'::jsonb
    );$$
);
