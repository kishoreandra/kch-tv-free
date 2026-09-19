// The site is scoped to the NSE **EQ** series only.
//
// `src/data/nse-symbols.ts` is generated from NSE's `sec_list.csv` filtered to
// `series = EQ`, so membership in that catalog is the single source of truth
// for "is this a symbol the site shows". Every ingest that receives symbols
// from an outside feed (TradingView, NSE deal files, …) should screen them
// through here so SME (SM/ST), trade-for-trade (BE), BZ/SZ, trusts (IV/RR) and
// BSE-only rows never reach a table the UI reads.

import { NSE_SYMBOLS } from "@/data/nse-symbols";

export const EQ_TICKERS: ReadonlySet<string> = new Set(
  NSE_SYMBOLS.filter((s) => !s.isIndex).map((s) => s.ticker.toUpperCase()),
);

/** True only for NSE EQ symbols. BSE (`.BO`) and unsuffixed rows are rejected. */
export function isEqSymbol(symbol: string): boolean {
  const s = String(symbol ?? "");
  if (!/\.NS$/i.test(s)) return false;
  return EQ_TICKERS.has(s.slice(0, -3).toUpperCase());
}

/** Bare-ticker variant, for feeds that hand over symbols without a suffix. */
export function isEqTicker(symbol: string): boolean {
  return EQ_TICKERS.has(String(symbol ?? "").replace(/\.(NS|BO)$/i, "").toUpperCase());
}
