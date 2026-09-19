# Plan: Price Bands, Volume Fix, Adaptive MAs

Three independent workstreams. I'll ship them in this order so you get value fast.

## 1) Adaptive Moving Averages (frontend only — shortest path)

**Default (a):** Treat every EMA/SMA period in `nse-mv:indicators` as *trading days*. Convert per timeframe at render time:
- Daily (`D`) → use as-is (50 → 50 daily bars)
- Weekly (`W`) → divide by 5, round (50 → 10 weekly bars ≈ 50 trading days)
- Monthly (`M`) → divide by 21, round (200 → 10 monthly bars)
- Hourly (`60`) → multiply by 6.5, round (50 → 325 hourly bars, capped at data length)
- Intraday `5/15/30` → convert via (6.5 × 60 / minutes)

So a global list of `[21, 50, 200]` automatically becomes `[4, 10, 40]` on weekly, `[137, 325, 1300]` on hourly, etc. Labels in the chart legend and top-bar hover show the *converted* number (e.g. "EMA 10W" on weekly view, tooltip "≈50 trading days").

**Override (b):** Add a "Per-timeframe overrides" section to `IndicatorsMenu`. Collapsible group with tabs `1H / D / W / M`; each tab has its own EMA + SMA period lists that, when non-empty, replace the auto-converted list for that timeframe. Stored under `nse-mv:indicators` as `{ ema, sma, vwap, anchoredVwaps, styles, overrides?: { "60"?: {ema, sma}, W?: {...}, M?: {...}, "60"?: {...} } }`.

Files:
- `src/components/LightweightChart.tsx` — resolve effective periods from `(indicators, interval)` before computing MA series; update legend/hover labels.
- `src/components/IndicatorsMenu.tsx` — add overrides UI, per-TF toggle "Use auto-adapted" vs "Override".
- Types + `resolveEffectiveIndicators(cfg, interval)` helper in a new `src/lib/indicators-adapt.ts`.

## 2) Price Bands / Circuit Limits (backend + filter)

**Data source:** NSE archive CSV `https://nsearchives.nseindia.com/content/equities/sec_bhavdata_full_<DDMMYYYY>.csv` includes `SERIES`, but the per-symbol band comes from `https://nsearchives.nseindia.com/content/equities/pricebands_<DDMMYYYY>.csv` (columns: SYMBOL, SERIES, PriceBand). NSE blocks datacenter IPs unless we prime cookies first (`GET https://www.nseindia.com/` then fetch archive with same cookie jar + browser UA).

**Schema:**
```sql
CREATE TABLE public.price_bands (
  symbol text PRIMARY KEY,     -- NSE symbol (e.g. RELIANCE)
  band_pct numeric NOT NULL,   -- 2 / 5 / 10 / 20  (No Band → 20)
  effective_date date NOT NULL,
  updated_at timestamptz DEFAULT now()
);
```
Grants: `SELECT` to `authenticated`, `ALL` to `service_role`. RLS on, policy `TO authenticated USING (true)` — reference data, not user-scoped.

**Cron endpoint** `src/routes/api/public/cron/refresh-price-bands.ts`:
1. Prime cookies via NSE homepage.
2. Fetch today's `pricebands_<DDMMYYYY>.csv`; if 404 (weekend/holiday), walk back up to 5 days.
3. Parse rows where `SERIES = 'EQ'`, map `PriceBand` (`No Band` → 20, `20%` → 20, etc.).
4. Upsert into `price_bands`.
5. Schedule via `pg_cron` daily at 09:30 IST (`0 4 * * 1-5`) using `apikey` header.

**Snapshot join & derived fields:** In `screener.functions.ts` bundle, LEFT JOIN `price_bands` and expose:
- `band_pct` (2/5/10/20)
- `pct_to_upper_circuit = (upper_ckt - price) / price * 100` where `upper_ckt = prev_close * (1 + band_pct/100)`
- `pct_to_lower_circuit` similarly

**Filter UI** (`src/lib/screener/filters.ts` + screener route):
- `band_pct` — equals selector (2 / 5 / 10 / 20 / any)
- `pct_to_upper_circuit` — numeric range (e.g. `< 2%` for near-upper-circuit scans)
- `pct_to_lower_circuit` — numeric range

## 3) Volume Data Audit

Yahoo `chart` intraday responses under-report volume vs NSE settled numbers, especially for the last bar of the day. Two fixes:

**a)** For **daily/weekly/monthly** volume shown in the top hover bar and in snapshot: switch from Yahoo `chart` (`1d` bars) to Yahoo `chart` with `events=div,split` and `includePrePost=false` — already correct, but validate against 3-4 known-good symbols and log the diff.

**b)** For **today's** volume in the screener snapshot (used by RVol, `Vol > 20D avg`, etc.), pull from NSE `quote-equity` endpoint (same cookie-prime pattern as price bands). Store as `today_volume_nse` in `stock_snapshot`, prefer over Yahoo when present.

Before touching code I need one sanity check from you — please share 1–2 specific symbols and the expected vs shown volume, and where you're comparing (NSE site / TradingView / Chartink). Volume mismatches can be legit differences (adjusted vs unadjusted, delivery vs traded), so I want to fix the actual bug and not just paper over it. I'll ship (1) and (2) right away and come back to (3) once you send an example.

## Order of work
1. Adaptive MAs (this turn, frontend only, no DB approval needed).
2. Price bands: migration → cron endpoint → snapshot join → filter UI (next turn, needs migration approval).
3. Volume audit: after you send example symbols.
