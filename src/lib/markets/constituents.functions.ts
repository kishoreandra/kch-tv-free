// Fetch index constituents from NSE archives + enrich with latest snapshot.

import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";

// Yahoo symbol → NSE archives CSV file name
const INDEX_CSV: Record<string, string> = {
  "^NSEI": "ind_nifty50list.csv",
  "^NSMIDCP": "ind_niftynext50list.csv",
  "^CNX100": "ind_nifty100list.csv",
  "^CNX200": "ind_nifty200list.csv",
  "^CRSLDX": "ind_nifty500list.csv",
  "^NSEMDCP50": "ind_niftymidcap50list.csv",
  "NIFTY_MIDCAP_150.NS": "ind_niftymidcap150list.csv",
  "^NIFTY_SMALLCAP_100": "ind_niftysmallcap100list.csv",
  "NIFTY_SMLCAP_250.NS": "ind_niftysmallcap250list.csv",
  "^NIFTY_MICROCAP_250": "ind_niftymicrocap250_list.csv",
  "^NIFTY50_EQUAL_WEIGHT": "ind_nifty50equalweightlist.csv",
  "^NSEBANK": "ind_niftybanklist.csv",
  "NIFTY_FIN_SERVICE.NS": "ind_niftyfinancelist.csv",
  "^CNXPSUBANK": "ind_niftypsubanklist.csv",
  "NIFTY_PVT_BANK.NS": "ind_nifty_privatebanklist.csv",
  "^CNXIT": "ind_niftyitlist.csv",
  "^CNXAUTO": "ind_niftyautolist.csv",
  "^CNXPHARMA": "ind_niftypharmalist.csv",
  "^NIFTY_HEALTHCARE_INDEX": "ind_niftyhealthcarelist.csv",
  "^CNXFMCG": "ind_niftyfmcglist.csv",
  "^CNXCONSUM": "ind_niftyconsumptionlist.csv",
  "^CNXMETAL": "ind_niftymetallist.csv",
  "^CNXENERGY": "ind_niftyenergylist.csv",
  "^NIFTY_OIL_GAS": "ind_niftyoilgaslist.csv",
  "^CNXREALTY": "ind_niftyrealtylist.csv",
  "^CNXINFRA": "ind_niftyinfralist.csv",
  "^CNXMEDIA": "ind_niftymedialist.csv",
  "^CNXPSE": "ind_niftypselist.csv",
  "^CNXCMDT": "ind_niftycommoditieslist.csv",
  "^CNXMNC": "ind_niftymnclist.csv",
  "^CNXSERVICE": "ind_niftyservicelist.csv",
};

export function indexHasConstituents(yahoo: string): boolean {
  return !!INDEX_CSV[yahoo];
}

const INDEX_SLUG: Record<string, string> = Object.fromEntries(
  Object.keys(INDEX_CSV).map((symbol) => [symbolToConstituentParam(symbol), symbol]),
);

export function symbolToConstituentParam(yahoo: string): string {
  return yahoo.replace(/\^/g, "NSEIDX_").replace(/\./g, "_DOT_");
}

export function resolveConstituentParam(param: string): string {
  return INDEX_CSV[param] ? param : (INDEX_SLUG[param] ?? param);
}

function parseCsv(text: string): { name: string; industry: string; symbol: string }[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length <= 1) return [];
  const out: { name: string; industry: string; symbol: string }[] = [];
  for (let i = 1; i < lines.length; i++) {
    // Naive CSV split (company names may contain commas — handle quoted)
    const row: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { row.push(cur); cur = ""; continue; }
      cur += ch;
    }
    row.push(cur);
    const [name, industry, symbol] = row;
    if (!symbol) continue;
    out.push({ name: name?.trim() ?? "", industry: industry?.trim() ?? "", symbol: symbol.trim() });
  }
  return out;
}

export interface ConstituentRow {
  ticker: string;
  yahoo: string;
  name: string;
  industry: string;
  price: number | null;
  change_pct: number | null;
  perf_1w: number | null;
  perf_1m: number | null;
  perf_1y: number | null;
  rsi14: number | null;
  pct_from_52w_high: number | null;
  market_cap: number | null;
  rel_vol: number | null;
}

export const getIndexConstituents = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .inputValidator((data: { symbol: string }) => {
    if (!data?.symbol) throw new Error("symbol required");
    return { symbol: data.symbol };
  })
  .handler(async ({ data, context }): Promise<{ symbol: string; indexName: string; rows: ConstituentRow[] }> => {
    const requestedSymbol = resolveConstituentParam(data.symbol);
    const csv = INDEX_CSV[requestedSymbol];
    if (!csv) {
      return { symbol: requestedSymbol, indexName: requestedSymbol, rows: [] };
    }
    // NSE archives (archives.nseindia.com) is fronted by Akamai and 503s
    // non-browser requests from edge workers. niftyindices.com publishes the
    // same files under /IndexConstituent/ and serves them to plain fetches.
    const sources = [
      `https://niftyindices.com/IndexConstituent/${csv}`,
      `https://archives.nseindia.com/content/indices/${csv}`,
    ];
    let text = "";
    let lastErr: string = "";
    for (const url of sources) {
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            Accept: "text/csv,text/plain,*/*",
            "Accept-Language": "en-US,en;q=0.9",
            Referer: "https://www.niftyindices.com/",
          },
        });
        if (res.ok) {
          text = await res.text();
          if (text.toLowerCase().includes("symbol")) break;
        }
        lastErr = `${url} → ${res.status}`;
      } catch (e) {
        lastErr = `${url} → ${(e as Error).message}`;
      }
    }
    if (!text) throw new Error(`Constituents fetch failed (${lastErr})`);
    const parsed = parseCsv(text);

    const yahoos = parsed.map((p) => `${p.symbol}.NS`);
    const { supabase } = context;
    const { data: snap, error } = await supabase
      .from("stock_snapshot")
      .select("symbol,ticker,name,price,change_pct,perf_1w,perf_1m,perf_1y,rsi14,pct_from_52w_high,market_cap,rel_vol")
      .in("symbol", yahoos);
    if (error) throw new Error(error.message);
    const byYahoo = new Map<string, any>();
    for (const r of snap ?? []) byYahoo.set(r.symbol as string, r);

    const rows: ConstituentRow[] = parsed.map((p) => {
      const y = `${p.symbol}.NS`;
      const s = byYahoo.get(y) ?? {};
      return {
        ticker: p.symbol,
        yahoo: y,
        name: s.name || p.name,
        industry: p.industry,
        price: s.price ?? null,
        change_pct: s.change_pct ?? null,
        perf_1w: s.perf_1w ?? null,
        perf_1m: s.perf_1m ?? null,
        perf_1y: s.perf_1y ?? null,
        rsi14: s.rsi14 ?? null,
        pct_from_52w_high: s.pct_from_52w_high ?? null,
        market_cap: s.market_cap ?? null,
        rel_vol: s.rel_vol ?? null,
      };
    });

    return { symbol: requestedSymbol, indexName: requestedSymbol, rows };
  });
