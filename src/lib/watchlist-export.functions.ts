import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";

interface ExportSymbolInput {
  ticker: string;
  yahoo: string;
  notes?: string;
}

interface QuoteRow {
  symbol: string;
  price: number | null;
  changePct: number | null;
  volume: number | null;
  avgVol10d: number | null;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0 Safari/537.36";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function hasMarketData(quote: QuoteRow | null | undefined) {
  return quote?.price != null || quote?.volume != null;
}

function mergeQuote(base: QuoteRow, fallback?: QuoteRow | null): QuoteRow {
  if (!fallback) return base;
  return {
    symbol: base.symbol,
    price: base.price ?? fallback.price,
    changePct: base.changePct ?? fallback.changePct,
    volume: base.volume ?? fallback.volume,
    avgVol10d: base.avgVol10d ?? fallback.avgVol10d,
  };
}

async function fetchQuoteAttempt(symbol: string, host: string): Promise<QuoteRow | null> {
  const url =
    `https://${host}/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?interval=1d&range=1mo&includePrePost=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" },
      signal: controller.signal,
    });
    if (res.status === 429 || res.status >= 500) return null;
    if (!res.ok) return { symbol, price: null, changePct: null, volume: null, avgVol10d: null };

    const json = (await res.json()) as any;
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result?.meta ?? {};
    const quote = result?.indicators?.quote?.[0] ?? {};
    const closes: (number | null)[] = quote.close ?? [];
    const volumes: (number | null)[] = quote.volume ?? [];
    const metaPrice = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
    const metaVolume = typeof meta.regularMarketVolume === "number" ? meta.regularMarketVolume : null;
    let lastIdx = -1;
    for (let i = closes.length - 1; i >= 0; i--) {
      if (typeof closes[i] === "number") { lastIdx = i; break; }
    }
    if (lastIdx < 0) return { symbol, price: metaPrice, changePct: null, volume: metaVolume, avgVol10d: null };

    const lastClose = metaPrice ?? (closes[lastIdx] as number);
    let prevClose: number | null = null;
    for (let i = lastIdx - 1; i >= 0; i--) {
      if (typeof closes[i] === "number") { prevClose = closes[i] as number; break; }
    }
    const changePct = prevClose && prevClose !== 0 ? ((lastClose - prevClose) / prevClose) * 100 : null;
    const volume = metaVolume ?? (typeof volumes[lastIdx] === "number" ? (volumes[lastIdx] as number) : null);
    const prevVols: number[] = [];
    for (let i = lastIdx - 1; i >= 0 && prevVols.length < 10; i--) {
      const v = volumes[i];
      if (typeof v === "number" && v > 0) prevVols.push(v);
    }
    const avgVol10d = prevVols.length === 10
      ? Math.round(prevVols.reduce((sum, v) => sum + v, 0) / prevVols.length)
      : null;

    return { symbol, price: lastClose, changePct, volume, avgVol10d };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchQuote(symbol: string): Promise<QuoteRow> {
  const delays = [0, 500, 1200, 2600, 4200];
  let best: QuoteRow | null = null;
  for (const delay of delays) {
    if (delay > 0) await sleep(delay + Math.floor(Math.random() * 300));
    for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
      const quote = await fetchQuoteAttempt(symbol, host);
      if (!quote) continue;
      best = best ? mergeQuote(best, quote) : quote;
      if (hasMarketData(best) && best.price != null && best.volume != null) return best;
    }
  }
  return best ?? { symbol, price: null, changePct: null, volume: null, avgVol10d: null };
}

async function fetchSparkBatch(symbols: string[]): Promise<Map<string, QuoteRow>> {
  const out = new Map<string, QuoteRow>();
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 60) chunks.push(symbols.slice(i, i + 60));

  for (const chunk of chunks) {
    const encoded = chunk.map(encodeURIComponent).join(",");
    for (const host of ["query1.finance.yahoo.com", "query2.finance.yahoo.com"]) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      try {
        const res = await fetch(
          `https://${host}/v7/finance/spark?symbols=${encoded}&range=5d&interval=1d`,
          { headers: { "User-Agent": UA, Accept: "application/json,text/plain,*/*" }, signal: controller.signal },
        );
        if (!res.ok) continue;
        const json = (await res.json()) as any;
        for (const item of json?.spark?.result ?? []) {
          const symbol = item?.symbol;
          const response = item?.response?.[0];
          if (typeof symbol !== "string" || !response) continue;
          const meta = response.meta ?? {};
          const closes: (number | null)[] = response.indicators?.quote?.[0]?.close ?? [];
          const price = typeof meta.regularMarketPrice === "number"
            ? meta.regularMarketPrice
            : [...closes].reverse().find((v) => typeof v === "number") ?? null;
          const volume = typeof meta.regularMarketVolume === "number" ? meta.regularMarketVolume : null;
          let prevClose: number | null = null;
          for (let i = closes.length - 2; i >= 0 && prevClose == null; i--) {
            if (typeof closes[i] === "number") prevClose = closes[i] as number;
          }
          if (prevClose == null && typeof meta.chartPreviousClose === "number") prevClose = meta.chartPreviousClose;
          const changePct = price != null && prevClose && prevClose !== 0 ? ((price - prevClose) / prevClose) * 100 : null;
          out.set(symbol, { symbol, price, changePct, volume, avgVol10d: null });
        }
        break;
      } catch {
        // Try the next host/chunk fallback.
      } finally {
        clearTimeout(timer);
      }
    }
  }
  return out;
}

async function fetchQuotes(symbols: string[]): Promise<QuoteRow[]> {
  const sparkMap = await fetchSparkBatch(symbols);
  const out: QuoteRow[] = [];
  const concurrency = 3;
  let idx = 0;
  async function worker() {
    while (idx < symbols.length) {
      const current = idx++;
      const symbol = symbols[current];
      const chartQuote = await fetchQuote(symbol);
      out[current] = mergeQuote(chartQuote, sparkMap.get(symbol));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, symbols.length) }, worker));
  return out;
}

export const exportWatchlistExcel = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((data: { listName: string; symbols: ExportSymbolInput[] }) => {
    if (!Array.isArray(data?.symbols)) throw new Error("symbols[] required");
    return {
      listName: typeof data.listName === "string" && data.listName.trim() ? data.listName.trim().slice(0, 60) : "List",
      symbols: data.symbols
        .filter((s) => s && typeof s.ticker === "string" && typeof s.yahoo === "string")
        .map((s) => ({
          ticker: s.ticker.trim().slice(0, 40),
          yahoo: s.yahoo.trim().slice(0, 60),
          notes: typeof s.notes === "string" ? s.notes.slice(0, 1000) : "",
        }))
        .filter((s) => s.ticker && s.yahoo)
        .slice(0, 500),
    };
  })
  .handler(async ({ data }) => {
    if (data.symbols.length === 0) throw new Error("List is empty");

    const quoteRows = await fetchQuotes(data.symbols.map((s) => s.yahoo));
    const quotesMap = new Map(quoteRows.map((q) => [q.symbol, q]));
    const rows = data.symbols.map((s) => {
      const q = quotesMap.get(s.yahoo);
      const price = q?.price ?? null;
      const volume = q?.volume ?? null;
      const avg = q?.avgVol10d ?? null;
      const aboveAvg = volume != null && avg != null && avg > 0 ? (volume > avg ? "Yes" : "No") : "";
      const turnoverCr = price != null && volume != null ? (price * volume) / 1e7 : null;
      return {
        Symbol: s.ticker,
        Notes: s.notes ?? "",
        "Closing Price": price != null ? Number(price.toFixed(2)) : "",
        "% Day Change": q?.changePct != null ? Number(q.changePct.toFixed(2)) : "",
        "Price * Volume (Cr)": turnoverCr != null ? Number(turnoverCr.toFixed(2)) : "",
        Volume: volume ?? "",
        "Above 10d Avg Vol": aboveAvg,
      };
    });

    const missingCount = rows.filter((row) => row["Closing Price"] === "" || row.Volume === "").length;
    return { rows, missingCount, rowCount: rows.length };
  });