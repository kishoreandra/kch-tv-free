// Maps our Yahoo-style symbols to the symbol TradingView uses on its
// public symbol pages. Keys are the exact yahoo strings from
// src/data/markets-catalog.ts (case-insensitive lookup).
const YAHOO_TO_TV: Record<string, string> = {
  // Broad NSE indices
  "^NSEI": "NSE:NIFTY",
  "^NSEBANK": "NSE:BANKNIFTY",
  "^NSMIDCP": "NSE:NIFTY_NEXT_50",
  "^CNX100": "NSE:CNX100",
  "^CNX200": "NSE:NIFTY200",
  "^CRSLDX": "NSE:CNX500",
  "^NSEMDCP50": "NSE:CNXMIDCAP",
  "NIFTY_MIDCAP_150.NS": "NSE:NIFTYMIDCAP150",
  "^CNXSC": "NSE:CNXSMALLCAP",
  "NIFTY_SMLCAP_250.NS": "NSE:NIFTYSMLCAP250",
  "NIFTY_MICROCAP250.NS": "NSE:NIFTYMICROCAP250",
  "^INDIAVIX": "NSE:INDIAVIX",

  // Sector / thematic NSE
  "NIFTY_FIN_SERVICE.NS": "NSE:CNXFINANCE",
  "^CNXPSUBANK": "NSE:CNXPSUBANK",
  "NIFTY_PVT_BANK.NS": "NSE:NIFTY_PVT_BANK",
  "^CNXIT": "NSE:CNXIT",
  "^CNXAUTO": "NSE:CNXAUTO",
  "^CNXPHARMA": "NSE:CNXPHARMA",
  "NIFTY_HEALTHCARE.NS": "NSE:CNXHEALTHCARE",
  "^CNXFMCG": "NSE:CNXFMCG",
  "^CNXCONSUM": "NSE:CNXCONSUMPTION",
  "^CNXMETAL": "NSE:CNXMETAL",
  "^CNXENERGY": "NSE:CNXENERGY",
  "NIFTY_OIL_AND_GAS.NS": "NSE:NIFTY_OIL_AND_GAS",
  "^CNXREALTY": "NSE:CNXREALTY",
  "^CNXINFRA": "NSE:CNXINFRA",
  "^CNXMEDIA": "NSE:CNXMEDIA",
  "^CNXPSE": "NSE:CNXPSE",
  "^CNXCMDT": "NSE:CNXCOMMODITIES",
  "^CNXMNC": "NSE:CNXMNC",
  "^CNXSERVICE": "NSE:CNXSERVICE",

  // BSE indices
  "^BSESN": "BSE:SENSEX",
  "BSE-100.BO": "BSE:BSE100",
  "BSE-500.BO": "BSE:BSE500",
  "BSE-MIDCAP.BO": "BSE:BSEMIDCAP",
  "BSE-SMLCAP.BO": "BSE:BSESMLCAP",

  // NSE indices served from our own index-close archive (no Yahoo series).
  "^NIFTY50_EQUAL_WEIGHT": "NSE:NIFTY50EQUALWEIGHT",
  "^NIFTY_HEALTHCARE_INDEX": "NSE:CNXHEALTHCARE",
  "^NIFTY_OIL_GAS": "NSE:NIFTY_OIL_AND_GAS",
  "^NIFTY_SMALLCAP_100": "NSE:CNXSMALLCAP",
  "^NIFTY_MICROCAP_250": "NSE:NIFTYMICROCAP250",

  // Global instruments: FX, commodity futures and crypto. Yahoo encodes these
  // with "=" (USDINR=X) or a "-USD" suffix, so the generic fallback below
  // would otherwise produce nonsense like "NSE:GC=F".
  "USDINR=X": "FX_IDC:USDINR",
  "GC=F": "COMEX:GC1!",
  "SI=F": "COMEX:SI1!",
  "CL=F": "NYMEX:CL1!",
  "BTC-USD": "BITSTAMP:BTCUSD",
  "ETH-USD": "BITSTAMP:ETHUSD",
};

/**
 * FX ("USDINR=X"), commodity futures ("GC=F") and crypto ("BTC-USD") — Yahoo
 * symbols that are neither NSE/BSE nor indices. They must not get a ".NS"
 * suffix appended.
 */
export function isGlobalSymbol(raw: string): boolean {
  const value = String(raw ?? "").trim();
  if (!value) return false;
  if (value.endsWith(".NS") || value.endsWith(".BO") || value.startsWith("^")) return false;
  return value.includes("=") || /-[A-Za-z]{3,4}$/.test(value);
}

/** True for NSE/BSE equity symbols (".NS"/".BO"); false for indices and global instruments. */
export function isIndianEquitySymbol(symbol: string): boolean {
  return /\.(NS|BO)$/i.test(String(symbol ?? "").trim());
}

export function normalizeChartSymbol(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (!value) return value;
  if (value.startsWith("NSE:")) return `${value.slice(4)}.NS`;
  if (value.startsWith("BSE:")) return `${value.slice(4)}.BO`;
  // FX / futures / crypto pass through untouched — no exchange suffix applies.
  if (isGlobalSymbol(value)) return value;
  if (value.startsWith("^") || value.endsWith(".NS") || value.endsWith(".BO")) return value;
  return `${value}.NS`;
}

export function chartUrlForSymbol(symbol: string): string {
  return `/?symbol=${encodeURIComponent(normalizeChartSymbol(symbol))}`;
}

/** Yahoo-style symbol -> TradingView "EXCHANGE:TICKER". */
export function yahooToTradingViewSymbol(yahoo: string): string {
  const raw = yahoo.trim();
  const key = raw.toUpperCase();
  if (YAHOO_TO_TV[key]) return YAHOO_TO_TV[key];
  if (YAHOO_TO_TV[raw]) return YAHOO_TO_TV[raw];
  // Generic fallbacks
  if (key.endsWith(".NS")) return `NSE:${key.slice(0, -3)}`;
  if (key.endsWith(".BO")) return `BSE:${key.slice(0, -3)}`;
  if (key.startsWith("^")) return `NSE:${key.slice(1)}`;
  return `NSE:${key}`;
}

export function tradingViewUrlForSymbol(symbol: string): string {
  const tv = yahooToTradingViewSymbol(symbol);
  // Open TradingView's chart view directly.
  return `https://in.tradingview.com/chart/?symbol=${encodeURIComponent(tv)}`;
}

/** Plain NSE ticker from a Yahoo-style symbol ("HFCL.NS" -> "HFCL"). */
export function nseTickerForSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/^(NSE|BSE):/, "").replace(/\.(NS|BO)$/, "");
}

/** Screener company page. */
export function screenerUrlForSymbol(symbol: string): string {
  const ticker = nseTickerForSymbol(symbol);
  if (!ticker) return "https://www.screener.in/";
  return `https://www.screener.in/company/${encodeURIComponent(ticker)}/`;
}

/**
 * NSE get-quote page.
 * With a company name we build the pretty path form NSE uses:
 *   /get-quote/equity/HFCL/HFCL-Limited
 * Without one we fall back to the query form, which NSE also accepts.
 */
export function nseUrlForSymbol(symbol: string, companyName?: string | null): string {
  const ticker = nseTickerForSymbol(symbol);
  if (!ticker) return "https://www.nseindia.com/";
  const slug = (companyName ?? "")
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
  if (!slug) return `https://www.nseindia.com/get-quote/equity?symbol=${encodeURIComponent(ticker)}`;
  return `https://www.nseindia.com/get-quote/equity/${encodeURIComponent(ticker)}/${encodeURIComponent(slug)}`;
}

