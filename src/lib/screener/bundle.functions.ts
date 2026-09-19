// Fetch OHLC chart data (daily / weekly / hourly) for a batch of scanner
// symbols so the client can package them into a downloadable JSON bundle
// for offline viewing via /viewer.
import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";

const MAX_SYMBOLS = 50;

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BundleSymbolData {
  D: Candle[];
  W: Candle[];
  "60": Candle[];
}

export interface BundleResponse {
  generatedAt: string;
  intervals: ("D" | "W" | "60")[];
  ohlc: Record<string, BundleSymbolData>;
  errors: Record<string, string>;
}

const YAHOO_RANGE: Record<string, { yInterval: string; range: string }> = {
  D: { yInterval: "1d", range: "1y" },
  W: { yInterval: "1wk", range: "5y" },
  "60": { yInterval: "60m", range: "3mo" },
};

async function fetchCandles(symbol: string, kind: "D" | "W" | "60"): Promise<Candle[]> {
  const { yInterval, range } = YAHOO_RANGE[kind];
  const encoded = encodeURIComponent(symbol);
  const cb = String(Math.floor(Date.now() / 60_000));
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?interval=${yInterval}&range=${range}&includePrePost=false&_=${cb}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; NSE-MultiView/1.0)",
      Accept: "application/json",
      "Cache-Control": "no-cache",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Yahoo ${res.status}`);
  const json = (await res.json()) as any;
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(json?.chart?.error?.description || "No data");
  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const opens: (number | null)[] = q.open ?? [];
  const highs: (number | null)[] = q.high ?? [];
  const lows: (number | null)[] = q.low ?? [];
  const closes: (number | null)[] = q.close ?? [];
  const volumes: (number | null)[] = q.volume ?? [];
  const out: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = opens[i],
      h = highs[i],
      l = lows[i],
      c = closes[i];
    if (o == null || h == null || l == null || c == null) continue;
    out.push({ time: timestamps[i], open: o, high: h, low: l, close: c, volume: volumes[i] ?? 0 });
  }
  return out;
}

export const getScannerBundle = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((data: { symbols: string[] }) => {
    if (!Array.isArray(data?.symbols) || data.symbols.length === 0) {
      throw new Error("symbols required");
    }
    return {
      symbols: data.symbols
        .map((s) => String(s).trim())
        .filter(Boolean)
        .slice(0, MAX_SYMBOLS),
    };
  })
  .handler(async ({ data }): Promise<BundleResponse> => {
    const intervals: ("D" | "W" | "60")[] = ["D", "W", "60"];
    const ohlc: Record<string, BundleSymbolData> = {};
    const errors: Record<string, string> = {};

    const CONCURRENCY = 4;
    let idx = 0;
    async function worker() {
      while (idx < data.symbols.length) {
        const my = idx++;
        const symbol = data.symbols[my];
        try {
          const [d, w, h] = await Promise.all([
            fetchCandles(symbol, "D"),
            fetchCandles(symbol, "W"),
            fetchCandles(symbol, "60"),
          ]);
          ohlc[symbol] = { D: d, W: w, "60": h };
        } catch (e: any) {
          errors[symbol] = e?.message ?? String(e);
        }
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, data.symbols.length) }, () => worker()),
    );

    return { generatedAt: new Date().toISOString(), intervals, ohlc, errors };
  });
