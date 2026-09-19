// Curated catalog of Indian indices and ETFs (NSE/BSE).
// Symbols use Yahoo Finance conventions so they pair with the existing
// chart route (/?symbol=<yahoo>).

export interface MarketItem {
  ticker: string;   // display ticker
  name: string;     // friendly name
  yahoo: string;    // chart symbol
  group: string;    // grouping within section
  // Indices / instruments quote page. FX, commodity futures and crypto use
  // their own exchange names, so this is a free-form string.
  exchange?: string;
  /** Lower number = pinned to the top of the Indices view. */
  priority?: number;
}

export interface MarketSection {
  id: string;
  label: string;
  /** Top-level split: Indices is the default view, ETFs sit behind a toggle. */
  kind: "index" | "etf";
  items: MarketItem[];
}

/** Top-level views on /markets. Indices is shown first by default. */
export const MARKET_UNIVERSES: { id: "index" | "etf"; label: string }[] = [
  { id: "index", label: "Indices" },
  { id: "etf", label: "ETFs" },
];

// ----- Indices -----
const BROAD_INDICES: MarketItem[] = [
  { ticker: "NIFTY 50", name: "Nifty 50", yahoo: "^NSEI", group: "Broad", exchange: "NSE", priority: 1 },
  { ticker: "NIFTY NEXT 50", name: "Nifty Next 50", yahoo: "^NSMIDCP", group: "Broad", exchange: "NSE" },
  { ticker: "NIFTY 100", name: "Nifty 100", yahoo: "^CNX100", group: "Broad", exchange: "NSE" },
  { ticker: "NIFTY 200", name: "Nifty 200", yahoo: "^CNX200", group: "Broad", exchange: "NSE" },
  { ticker: "NIFTY 500", name: "Nifty 500", yahoo: "^CRSLDX", group: "Broad", exchange: "NSE", priority: 2 },
  { ticker: "NIFTY MIDCAP 100", name: "Nifty Midcap 100", yahoo: "^NSEMDCP50", group: "Broad", exchange: "NSE" },
  { ticker: "NIFTY MIDCAP 150", name: "Nifty Midcap 150", yahoo: "NIFTY_MIDCAP_150.NS", group: "Broad", exchange: "NSE" },
  { ticker: "NIFTY SMALLCAP 250", name: "Nifty Smallcap 250", yahoo: "NIFTY_SMLCAP_250.NS", group: "Broad", exchange: "NSE" },
  { ticker: "SENSEX", name: "BSE Sensex", yahoo: "^BSESN", group: "Broad", exchange: "BSE" },
  { ticker: "BSE 100", name: "BSE 100", yahoo: "BSE-100.BO", group: "Broad", exchange: "BSE" },
  { ticker: "BSE 500", name: "BSE 500", yahoo: "BSE-500.BO", group: "Broad", exchange: "BSE" },
  { ticker: "INDIA VIX", name: "India VIX", yahoo: "^INDIAVIX", group: "Volatility", exchange: "NSE" },
];

const SECTOR_INDICES: MarketItem[] = [
  { ticker: "NIFTY BANK", name: "Nifty Bank", yahoo: "^NSEBANK", group: "Financials", exchange: "NSE", priority: 4 },
  { ticker: "NIFTY FIN SERVICES", name: "Nifty Financial Services", yahoo: "NIFTY_FIN_SERVICE.NS", group: "Financials", exchange: "NSE" },
  { ticker: "NIFTY PSU BANK", name: "Nifty PSU Bank", yahoo: "^CNXPSUBANK", group: "Financials", exchange: "NSE" },
  { ticker: "NIFTY PVT BANK", name: "Nifty Private Bank", yahoo: "NIFTY_PVT_BANK.NS", group: "Financials", exchange: "NSE" },
  { ticker: "NIFTY IT", name: "Nifty IT", yahoo: "^CNXIT", group: "Technology", exchange: "NSE" },
  { ticker: "NIFTY AUTO", name: "Nifty Auto", yahoo: "^CNXAUTO", group: "Cyclicals", exchange: "NSE", priority: 5 },
  { ticker: "NIFTY PHARMA", name: "Nifty Pharma", yahoo: "^CNXPHARMA", group: "Healthcare", exchange: "NSE" },
  { ticker: "NIFTY FMCG", name: "Nifty FMCG", yahoo: "^CNXFMCG", group: "Consumer", exchange: "NSE" },
  { ticker: "NIFTY CONSUMPTION", name: "Nifty Consumption", yahoo: "^CNXCONSUM", group: "Consumer", exchange: "NSE" },
  { ticker: "NIFTY METAL", name: "Nifty Metal", yahoo: "^CNXMETAL", group: "Commodities", exchange: "NSE" },
  { ticker: "NIFTY ENERGY", name: "Nifty Energy", yahoo: "^CNXENERGY", group: "Commodities", exchange: "NSE" },
  { ticker: "NIFTY REALTY", name: "Nifty Realty", yahoo: "^CNXREALTY", group: "Cyclicals", exchange: "NSE" },
  { ticker: "NIFTY INFRA", name: "Nifty Infrastructure", yahoo: "^CNXINFRA", group: "Cyclicals", exchange: "NSE" },
  { ticker: "NIFTY MEDIA", name: "Nifty Media", yahoo: "^CNXMEDIA", group: "Consumer", exchange: "NSE" },
  { ticker: "NIFTY PSE", name: "Nifty PSE", yahoo: "^CNXPSE", group: "Thematic", exchange: "NSE" },
  { ticker: "NIFTY COMMODITIES", name: "Nifty Commodities", yahoo: "^CNXCMDT", group: "Thematic", exchange: "NSE" },
  { ticker: "NIFTY MNC", name: "Nifty MNC", yahoo: "^CNXMNC", group: "Thematic", exchange: "NSE" },
  { ticker: "NIFTY SERVICES", name: "Nifty Services Sector", yahoo: "^CNXSERVICE", group: "Thematic", exchange: "NSE" },
];

// ----- NSE indices Yahoo does not carry -----
// Charts for these come from NSE's own daily index-close archive
// (`index_prices` table, filled by /api/public/cron/ingest-index-close), so the
// symbol must match the slug built from NSE's index name exactly — see
// `indexSymbolFromName()` in src/lib/markets/index-close.server.ts:
//   "NIFTY50 Equal Weight"   -> ^NIFTY50_EQUAL_WEIGHT
//   "Nifty Healthcare Index" -> ^NIFTY_HEALTHCARE_INDEX
//   "Nifty Oil & Gas"        -> ^NIFTY_OIL_GAS
const ARCHIVE_INDICES: MarketItem[] = [
  { ticker: "NIFTY 50 EQ WT", name: "Nifty 50 Equal Weight", yahoo: "^NIFTY50_EQUAL_WEIGHT", group: "Broad", exchange: "NSE", priority: 3 },
  { ticker: "NIFTY SMALLCAP 100", name: "Nifty Smallcap 100", yahoo: "^NIFTY_SMALLCAP_100", group: "Broad", exchange: "NSE" },
  { ticker: "NIFTY MICROCAP 250", name: "Nifty Microcap 250", yahoo: "^NIFTY_MICROCAP_250", group: "Broad", exchange: "NSE" },
  { ticker: "NIFTY HEALTHCARE", name: "Nifty Healthcare", yahoo: "^NIFTY_HEALTHCARE_INDEX", group: "Healthcare", exchange: "NSE" },
  { ticker: "NIFTY OIL & GAS", name: "Nifty Oil & Gas", yahoo: "^NIFTY_OIL_GAS", group: "Commodities", exchange: "NSE" },
];

// ----- FX, commodity futures & crypto -----
// Yahoo encodes these with "=" (FX / futures) or a "-USD" suffix (crypto), so
// they carry no exchange suffix. All six were checked against the chart data
// path and return full daily history.
const GLOBAL_MARKETS: MarketItem[] = [
  { ticker: "USDINR", name: "US Dollar / Indian Rupee", yahoo: "USDINR=X", group: "Currency", exchange: "FX" },
  { ticker: "GOLD", name: "Gold Futures (COMEX)", yahoo: "GC=F", group: "Commodities", exchange: "COMEX" },
  { ticker: "SILVER", name: "Silver Futures (COMEX)", yahoo: "SI=F", group: "Commodities", exchange: "COMEX" },
  { ticker: "CRUDE OIL", name: "Crude Oil WTI (NYMEX)", yahoo: "CL=F", group: "Commodities", exchange: "NYMEX" },
  { ticker: "BTCUSD", name: "Bitcoin / US Dollar", yahoo: "BTC-USD", group: "Crypto", exchange: "Crypto" },
  { ticker: "ETHUSD", name: "Ethereum / US Dollar", yahoo: "ETH-USD", group: "Crypto", exchange: "Crypto" },
];

// ----- ETFs (Yahoo: <SYMBOL>.NS / .BO) -----
const EQUITY_ETFS: MarketItem[] = [
  { ticker: "NIFTYBEES", name: "Nippon India ETF Nifty 50 BeES", yahoo: "NIFTYBEES.NS", group: "Broad Equity" },
  { ticker: "JUNIORBEES", name: "Nippon India ETF Nifty Next 50", yahoo: "JUNIORBEES.NS", group: "Broad Equity" },
  { ticker: "SETFNIF50", name: "SBI ETF Nifty 50", yahoo: "SETFNIF50.NS", group: "Broad Equity" },
  { ticker: "NIFTYIETF", name: "ICICI Prudential Nifty 50 ETF", yahoo: "NIFTYIETF.NS", group: "Broad Equity" },
  { ticker: "HDFCNIFTY", name: "HDFC Nifty 50 ETF", yahoo: "HDFCNIFTY.NS", group: "Broad Equity" },
  { ticker: "NIFTY1", name: "Kotak Nifty 50 ETF", yahoo: "NIFTY1.NS", group: "Broad Equity" },
  { ticker: "MID150BEES", name: "Nippon India ETF Nifty Midcap 150", yahoo: "MID150BEES.NS", group: "Midcap" },
  { ticker: "MIDCAPETF", name: "ICICI Prudential Midcap Select ETF", yahoo: "MIDCAPETF.NS", group: "Midcap" },
  { ticker: "MIDCAPIETF", name: "ICICI Pru Nifty Midcap 150 ETF", yahoo: "MIDCAPIETF.NS", group: "Midcap" },
  { ticker: "MOM100", name: "Motilal Oswal Midcap 100 ETF", yahoo: "MOM100.NS", group: "Midcap" },
  { ticker: "SMALLCAP", name: "Nippon India ETF Nifty Smallcap 250", yahoo: "SMALLCAP.NS", group: "Smallcap" },
  { ticker: "NEXT50", name: "ICICI Pru Nifty Next 50 ETF", yahoo: "NEXT50.NS", group: "Broad Equity" },
  { ticker: "SETFNN50", name: "SBI ETF Nifty Next 50", yahoo: "SETFNN50.NS", group: "Broad Equity" },
  { ticker: "ALPHA", name: "Nippon India ETF Nifty Alpha 50", yahoo: "ALPHA.NS", group: "Factor" },
  { ticker: "ALPHAETF", name: "ICICI Pru Alpha Low Vol 30 ETF", yahoo: "ALPHAETF.NS", group: "Factor" },
  { ticker: "MOQUALITY", name: "Motilal Oswal Nifty 200 Momentum 30", yahoo: "MOQUALITY.NS", group: "Factor" },
  { ticker: "MOMOMENTUM", name: "Motilal Oswal Nifty 200 Momentum ETF", yahoo: "MOMOMENTUM.NS", group: "Factor" },
  { ticker: "MOVALUE", name: "Motilal Oswal Nifty 500 Value 50 ETF", yahoo: "MOVALUE.NS", group: "Factor" },
  { ticker: "LOWVOL", name: "ICICI Pru Nifty Low Vol 30 ETF", yahoo: "LOWVOL.NS", group: "Factor" },
  { ticker: "LOWVOL1", name: "Kotak Nifty Low Vol 30 ETF", yahoo: "LOWVOLIETF.NS", group: "Factor" },
];

const SECTOR_ETFS: MarketItem[] = [
  { ticker: "BANKBEES", name: "Nippon India ETF Bank BeES", yahoo: "BANKBEES.NS", group: "Banking" },
  { ticker: "SETFNIFBK", name: "SBI ETF Nifty Bank", yahoo: "SETFNIFBK.NS", group: "Banking" },
  { ticker: "BANKNIFTY1", name: "Kotak Nifty Bank ETF", yahoo: "BANKNIFTY1.NS", group: "Banking" },
  { ticker: "PSUBANK", name: "Nippon India ETF PSU Bank BeES", yahoo: "PSUBNKBEES.NS", group: "Banking" },
  { ticker: "PVTBANIETF", name: "ICICI Pru Private Banks ETF", yahoo: "PVTBANIETF.NS", group: "Banking" },
  { ticker: "FINIETF", name: "ICICI Pru Nifty Financial Services ETF", yahoo: "FINIETF.NS", group: "Financials" },
  { ticker: "ITBEES", name: "Nippon India ETF Nifty IT", yahoo: "ITBEES.NS", group: "Technology" },
  { ticker: "ITETF", name: "ICICI Pru IT ETF", yahoo: "ITETF.NS", group: "Technology" },
  { ticker: "AUTOIETF", name: "ICICI Pru Auto ETF", yahoo: "AUTOIETF.NS", group: "Auto" },
  { ticker: "AUTOBEES", name: "Nippon India ETF Auto BeES", yahoo: "AUTOBEES.NS", group: "Auto" },
  { ticker: "PHARMABEES", name: "Nippon India ETF Pharma BeES", yahoo: "PHARMABEES.NS", group: "Pharma" },
  { ticker: "HEALTHIETF", name: "ICICI Pru Healthcare ETF", yahoo: "HEALTHIETF.NS", group: "Pharma" },
  { ticker: "FMCGIETF", name: "ICICI Pru FMCG ETF", yahoo: "FMCGIETF.NS", group: "FMCG" },
  { ticker: "CONSUMBEES", name: "Nippon India ETF Consumption", yahoo: "CONSUMBEES.NS", group: "Consumer" },
  { ticker: "METALIETF", name: "ICICI Pru Metal ETF", yahoo: "METALIETF.NS", group: "Metals" },
  { ticker: "INFRABEES", name: "Nippon India ETF Infra BeES", yahoo: "INFRABEES.NS", group: "Infra" },
  { ticker: "PSUBNKBEES", name: "PSU Bank BeES", yahoo: "PSUBNKBEES.NS", group: "Banking" },
];

const INTERNATIONAL_ETFS: MarketItem[] = [
  { ticker: "MON100", name: "Motilal Oswal NASDAQ 100 ETF", yahoo: "MON100.NS", group: "US" },
  { ticker: "MAFANG", name: "Mirae Asset NYSE FANG+ ETF", yahoo: "MAFANG.NS", group: "US" },
  { ticker: "MASPTOP50", name: "Mirae Asset S&P 500 Top 50 ETF", yahoo: "MASPTOP50.NS", group: "US" },
  { ticker: "HNGSNGBEES", name: "Nippon India ETF Hang Seng BeES", yahoo: "HNGSNGBEES.NS", group: "Asia" },
];

const COMMODITY_ETFS: MarketItem[] = [
  { ticker: "GOLDBEES", name: "Nippon India ETF Gold BeES", yahoo: "GOLDBEES.NS", group: "Gold" },
  { ticker: "GOLDIETF", name: "ICICI Pru Gold ETF", yahoo: "GOLDIETF.NS", group: "Gold" },
  { ticker: "SETFGOLD", name: "SBI ETF Gold", yahoo: "SETFGOLD.NS", group: "Gold" },
  { ticker: "GOLD1", name: "Kotak Gold ETF", yahoo: "GOLD1.NS", group: "Gold" },
  { ticker: "HDFCGOLD", name: "HDFC Gold ETF", yahoo: "HDFCGOLD.NS", group: "Gold" },
  { ticker: "AXISGOLD", name: "Axis Gold ETF", yahoo: "AXISGOLD.NS", group: "Gold" },
  { ticker: "SILVERBEES", name: "Nippon India Silver ETF", yahoo: "SILVERBEES.NS", group: "Silver" },
  { ticker: "SILVERIETF", name: "ICICI Pru Silver ETF", yahoo: "SILVERIETF.NS", group: "Silver" },
  { ticker: "SILVER", name: "Aditya Birla Sun Life Silver ETF", yahoo: "SILVER.NS", group: "Silver" },
];

const DEBT_ETFS: MarketItem[] = [
  { ticker: "LIQUIDBEES", name: "Nippon India ETF Liquid BeES", yahoo: "LIQUIDBEES.NS", group: "Liquid" },
  { ticker: "LIQUIDIETF", name: "ICICI Pru Liquid ETF", yahoo: "LIQUIDIETF.NS", group: "Liquid" },
  { ticker: "GILT5YBEES", name: "Nippon India ETF 5Y Gilt", yahoo: "GILT5YBEES.NS", group: "G-Sec" },
  { ticker: "BBETF0432", name: "Bharat Bond ETF April 2032", yahoo: "BBETF0432.NS", group: "Bharat Bond" },
  { ticker: "EBBETF0431", name: "Bharat Bond ETF April 2031", yahoo: "EBBETF0431.NS", group: "Bharat Bond" },
  { ticker: "EBBETF0430", name: "Bharat Bond ETF April 2030", yahoo: "EBBETF0430.NS", group: "Bharat Bond" },
  { ticker: "EBBETF0425", name: "Bharat Bond ETF April 2025", yahoo: "EBBETF0425.NS", group: "Bharat Bond" },
];

export const MARKET_SECTIONS: MarketSection[] = [
  { id: "broad-indices", label: "Broad Indices", kind: "index", items: BROAD_INDICES },
  { id: "sector-indices", label: "Sector & Thematic Indices", kind: "index", items: SECTOR_INDICES },
  { id: "archive-indices", label: "NSE Archive Indices", kind: "index", items: ARCHIVE_INDICES },
  { id: "global-markets", label: "FX, Commodities & Crypto", kind: "index", items: GLOBAL_MARKETS },
  { id: "equity-etfs", label: "Equity ETFs", kind: "etf", items: EQUITY_ETFS },
  { id: "sector-etfs", label: "Sector ETFs", kind: "etf", items: SECTOR_ETFS },
  { id: "international-etfs", label: "International ETFs", kind: "etf", items: INTERNATIONAL_ETFS },
  { id: "commodity-etfs", label: "Commodity ETFs", kind: "etf", items: COMMODITY_ETFS },
  { id: "debt-etfs", label: "Debt & Liquid ETFs", kind: "etf", items: DEBT_ETFS },
];

/**
 * Yahoo ids of the curated BSE *indices* (BSE Sensex, BSE 100, BSE 500).
 * Everything else on the site is NSE: any other ".BO" id is a BSE-listed
 * stock and must never be charted — see the guard in `getOhlc`
 * (`src/lib/ohlc.functions.ts`) and `customSymbol` (`src/routes/index.tsx`).
 */
export const BSE_INDEX_YAHOOS: ReadonlySet<string> = new Set(
  MARKET_SECTIONS.flatMap((s) =>
    s.items.filter((i) => i.exchange === "BSE").map((i) => i.yahoo.toUpperCase()),
  ),
);
