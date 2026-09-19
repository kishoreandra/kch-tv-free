CREATE TABLE public.price_bands (
  symbol text PRIMARY KEY,
  band_pct numeric NOT NULL,
  effective_date date NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.price_bands TO authenticated;
GRANT ALL ON public.price_bands TO service_role;

ALTER TABLE public.price_bands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read price bands"
  ON public.price_bands
  FOR SELECT
  TO authenticated
  USING (true);

CREATE INDEX price_bands_band_pct_idx ON public.price_bands (band_pct);