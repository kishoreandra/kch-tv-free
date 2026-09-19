import type { SnapshotRow } from "./filters";

const CACHE_MS = 6 * 60 * 60_000;
const cache = new Map<string, { at: number; price: number | null }>();

async function releaseClose(symbol: string, releaseDate: string): Promise<number | null> {
  const key = `${symbol}:${releaseDate.slice(0, 10)}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.price;

  let price: number | null = null;
  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&includePrePost=false`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } },
    );
    if (response.ok) {
      const result = ((await response.json()) as any)?.chart?.result?.[0];
      const timestamps: number[] = result?.timestamp ?? [];
      const closes: Array<number | null> = result?.indicators?.quote?.[0]?.close ?? [];
      const releaseTime = new Date(releaseDate).getTime();
      let bestTime = -Infinity;
      for (let i = 0; i < timestamps.length; i++) {
        const candleTime = timestamps[i] * 1000;
        const close = closes[i];
        if (candleTime <= releaseTime + 86_400_000 && candleTime > bestTime && typeof close === "number") {
          bestTime = candleTime;
          price = close;
        }
      }
    }
  } catch {
    price = null;
  }
  cache.set(key, { at: Date.now(), price });
  return price;
}

export async function enrichEarningsMoves(rows: SnapshotRow[]): Promise<SnapshotRow[]> {
  const candidates = rows.filter(
    (row) => row.earnings_release_date && typeof row.price === "number" && row.price > 0,
  );
  let index = 0;
  async function worker() {
    while (index < candidates.length) {
      const row = candidates[index++];
      const releaseDate = row.earnings_release_date;
      if (!releaseDate) continue;
      row.earnings_release_price = await releaseClose(row.symbol, releaseDate);
    }
  }
  await Promise.all(Array.from({ length: Math.min(16, candidates.length) }, () => worker()));
  return rows;
}