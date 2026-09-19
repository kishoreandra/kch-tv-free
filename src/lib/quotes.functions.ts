import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";

export interface QuoteRow {
  symbol: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  avgVol10d: number | null;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchOneAttempt(symbol: string): Promise<QuoteRow | null> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=1mo&includePrePost=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" },
      signal: controller.signal,
    });
    if (res.status === 429 || res.status >= 500) return null; // retry
    if (!res.ok) {
      return { symbol, price: null, changePct: null, volume: null, avgVol10d: null };
    }
    const json = (await res.json()) as any;
    const result = json?.chart?.result?.[0];
    if (!result) {
      // Empty response — often a transient rate-limit; signal retry
      return null;
    }
    const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close ?? [];
    const volumes: (number | null)[] = result?.indicators?.quote?.[0]?.volume ?? [];
    let lastIdx = -1;
    for (let i = closes.length - 1; i >= 0; i--) {
      if (typeof closes[i] === "number" && closes[i] !== null) { lastIdx = i; break; }
    }
    if (lastIdx < 0) {
      return { symbol, price: null, changePct: null, volume: null, avgVol10d: null };
    }
    const lastClose = closes[lastIdx] as number;
    let prevClose: number | null = null;
    for (let i = lastIdx - 1; i >= 0; i--) {
      if (typeof closes[i] === "number" && closes[i] !== null) { prevClose = closes[i] as number; break; }
    }
    const changePct = prevClose && prevClose !== 0 ? ((lastClose - prevClose) / prevClose) * 100 : null;
    const lastVol = typeof volumes[lastIdx] === "number" ? (volumes[lastIdx] as number) : null;
    const prevVols: number[] = [];
    for (let i = lastIdx - 1; i >= 0 && prevVols.length < 10; i--) {
      const v = volumes[i];
      if (typeof v === "number" && v > 0) prevVols.push(v);
    }
    const avgVol10d = prevVols.length > 0
      ? Math.round(prevVols.reduce((a, b) => a + b, 0) / prevVols.length)
      : null;
    return { symbol, price: lastClose, changePct, volume: lastVol, avgVol10d };
  } catch {
    return null; // retry
  } finally {
    clearTimeout(timer);
  }
}

async function fetchOne(symbol: string): Promise<QuoteRow> {
  const delays = [0, 400, 1000, 2200];
  for (let i = 0; i < delays.length; i++) {
    if (delays[i] > 0) await sleep(delays[i] + Math.floor(Math.random() * 250));
    const r = await fetchOneAttempt(symbol);
    if (r) return r;
  }
  return { symbol, price: null, changePct: null, volume: null, avgVol10d: null };
}

export const getQuotes = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((data: { symbols: string[] }) => {
    if (!Array.isArray(data?.symbols)) throw new Error("symbols[] required");
    const cleaned = data.symbols
      .filter((s) => typeof s === "string" && s.length > 0 && s.length < 40)
      .slice(0, 500);
    return { symbols: cleaned };
  })
  .handler(async ({ data }): Promise<{ quotes: QuoteRow[] }> => {
    if (data.symbols.length === 0) return { quotes: [] };
    // Concurrency-limited parallel fetch
    const out: QuoteRow[] = [];
    const CONCURRENCY = 4;
    let idx = 0;
    async function worker() {
      while (idx < data.symbols.length) {
        const my = idx++;
        const sym = data.symbols[my];
        const r = await fetchOne(sym);
        out[my] = r;
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, data.symbols.length) }, worker));
    return { quotes: out };
  });
