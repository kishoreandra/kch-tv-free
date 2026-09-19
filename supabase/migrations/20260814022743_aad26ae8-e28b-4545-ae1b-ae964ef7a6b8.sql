ALTER TABLE public.price_alerts
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS timeframe text NOT NULL DEFAULT 'D',
  ADD COLUMN IF NOT EXISTS params jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.bulk_block_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_date date NOT NULL,
  symbol text NOT NULL,
  client_name text,
  deal_type text,
  quantity bigint,
  price numeric,
  source text NOT NULL DEFAULT 'bulk',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_date, symbol, client_name, deal_type, source, quantity)
);

CREATE INDEX IF NOT EXISTS idx_bulk_block_deals_symbol_date ON public.bulk_block_deals (symbol, deal_date DESC);

GRANT SELECT ON public.bulk_block_deals TO authenticated;
GRANT ALL ON public.bulk_block_deals TO service_role;
ALTER TABLE public.bulk_block_deals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bulk_block_deals' AND policyname='Approved users can read deals') THEN
    CREATE POLICY "Approved users can read deals" ON public.bulk_block_deals
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;