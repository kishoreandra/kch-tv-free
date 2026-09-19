// Shared helper: which tickers live in a user's custom watchlists.
//
// Watchlists are stored as a jsonb array on user_data.lists. "Scanning
// Process" lists are a workflow queue, not a curated watchlist, so they're
// always excluded.

export interface StoredList {
  id?: string;
  name?: string;
  color?: string;
  kind?: string;
  symbols?: Array<{ yahoo?: string; ticker?: string }>;
}

function norm(sym: string): string {
  return String(sym ?? "")
    .trim()
    .replace(/^(NSE|BSE):/i, "")
    .replace(/\.(NS|BO)$/i, "")
    .toUpperCase();
}

export function isScanningList(l: StoredList): boolean {
  return l.kind === "scanning" || (l.name ?? "").toLowerCase() === "scanning process";
}

/** ticker -> watchlist names it appears in (scanning lists excluded). */
export function watchlistMapFromLists(lists: StoredList[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const l of lists ?? []) {
    if (!l || isScanningList(l)) continue;
    const name = (l.name ?? "List").trim();
    for (const s of l.symbols ?? []) {
      const key = norm(s?.ticker || s?.yahoo || "");
      if (!key) continue;
      const cur = map.get(key);
      if (cur) {
        if (!cur.includes(name)) cur.push(name);
      } else {
        map.set(key, [name]);
      }
    }
  }
  return map;
}

/** Union of every user's watchlists — used by background jobs (Telegram). */
export async function loadAllWatchlistSymbols(): Promise<Map<string, string[]>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("user_data").select("lists");
  const merged = new Map<string, string[]>();
  for (const row of (data ?? []) as Array<{ lists: unknown }>) {
    const lists = Array.isArray(row.lists) ? (row.lists as StoredList[]) : [];
    for (const [sym, names] of watchlistMapFromLists(lists)) {
      const cur = merged.get(sym);
      if (cur) for (const n of names) { if (!cur.includes(n)) cur.push(n); }
      else merged.set(sym, [...names]);
    }
  }
  return merged;
}
