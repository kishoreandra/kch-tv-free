import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowUpDown, ChevronDown, ChevronUp, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { AuthButton } from "@/components/AuthButton";
import { useAuth } from "@/hooks/use-auth";
import { getIndexConstituents, resolveConstituentParam, type ConstituentRow } from "@/lib/markets/constituents.functions";
import { saveResultsAsWatchlist } from "@/lib/screener/save-watchlist.functions";
import { MARKET_SECTIONS } from "@/data/markets-catalog";
import { chartUrlForSymbol } from "@/lib/chart-links";

export const Route = createFileRoute("/markets_/constituents/$symbol")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Index Constituents — NSE MultiView" },
      { name: "description", content: "View constituents of NSE indices with live performance and add them to a watchlist." },
    ],
  }),
  component: ConstituentsPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Constituents failed: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Not found.</div>,
});

type SortKey = keyof Pick<ConstituentRow, "ticker" | "price" | "change_pct" | "perf_1w" | "perf_1m" | "perf_1y" | "rsi14" | "pct_from_52w_high" | "market_cap" | "rel_vol">;

function fmtNum(n: number | null, d = 2): string {
  if (n == null || !isFinite(n)) return "—";
  return n.toFixed(d);
}
function fmtPct(n: number | null): string {
  if (n == null || !isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}
function fmtCr(n: number | null): string {
  if (n == null || !isFinite(n)) return "—";
  const cr = n / 1e7;
  return cr >= 1000 ? `${(cr / 1000).toFixed(2)} K Cr` : `${cr.toFixed(0)} Cr`;
}
function pctColor(n: number | null): string {
  if (n == null) return "text-muted-foreground";
  if (n > 0) return "text-emerald-500";
  if (n < 0) return "text-rose-500";
  return "text-muted-foreground";
}

function ConstituentsPage() {
  const { symbol } = Route.useParams();
  const requestedSymbol = resolveConstituentParam(symbol);
  const navigate = useNavigate();
  const { user, loading: authLoading, approved, isAdmin } = useAuth();
  const hasAccess = !!user && (approved || isAdmin);

  const fetchFn = useServerFn(getIndexConstituents);
  const saveFn = useServerFn(saveResultsAsWatchlist);

  const indexMeta = useMemo(() => {
    for (const s of MARKET_SECTIONS) {
      const found = s.items.find((i) => i.yahoo === requestedSymbol);
      if (found) return found;
    }
    return null;
  }, [requestedSymbol]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["constituents", requestedSymbol],
    queryFn: () => fetchFn({ data: { symbol: requestedSymbol } }),
    enabled: hasAccess && !authLoading,
    retry: false,
  });

  const rows: ConstituentRow[] = data?.rows ?? [];
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("market_cap");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => r.ticker.toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q) || (r.industry ?? "").toLowerCase().includes(q))
      : rows;
    const sorted = [...base].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const an = typeof av === "number" ? av : av == null ? -Infinity : Number(av);
      const bn = typeof bv === "number" ? bv : bv == null ? -Infinity : Number(bv);
      if (sortKey === "ticker") {
        return sortDir === "asc" ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
      }
      return sortDir === "asc" ? an - bn : bn - an;
    });
    return sorted;
  }, [rows, query, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (k === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "ticker" ? "asc" : "desc"); }
  }
  function toggleSel(y: string) {
    setSelected((s) => { const n = new Set(s); n.has(y) ? n.delete(y) : n.add(y); return n; });
  }
  function toggleSelAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((r) => r.yahoo)));
  }

  async function addToWatchlist(onlySelected: boolean) {
    const pool = onlySelected ? filtered.filter((r) => selected.has(r.yahoo)) : filtered;
    if (pool.length === 0) { toast.error("Nothing to add"); return; }
    setSaving(true);
    try {
      const name = `${indexMeta?.ticker ?? requestedSymbol}${onlySelected ? ` (${pool.length})` : ""}`;
      const res = await saveFn({
        data: {
          name,
          symbols: pool.map((r) => ({ ticker: r.ticker, name: r.name, yahoo: r.yahoo, sector: r.industry })),
        },
      });
      toast.success(`Created watchlist “${res.name}” (${res.count} symbols)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save watchlist");
    } finally {
      setSaving(false);
    }
  }

  const SortHead = ({ k, label, align = "right" }: { k: SortKey; label: string; align?: "left" | "right" }) => (
    <th
      onClick={() => toggleSort(k)}
      className={`px-2 py-2 text-xs font-medium text-muted-foreground select-none cursor-pointer hover:text-foreground ${align === "right" ? "text-right" : "text-left"}`}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === k ? (sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </span>
    </th>
  );

  return (
    <div className="dark h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2 shrink-0">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate({ to: "/markets" })}>
          <ArrowLeft className="h-4 w-4" /> Markets
        </Button>
        <h1 className="text-lg font-semibold">{indexMeta?.ticker ?? symbol}</h1>
        {indexMeta?.name && <span className="text-sm text-muted-foreground">{indexMeta.name}</span>}
        <span className="text-xs text-muted-foreground">{rows.length} constituents</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {user && (
            <>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search ticker / name…"
                className="w-56 h-8 text-sm"
              />
              <Button size="sm" variant="outline" disabled={saving || selected.size === 0} onClick={() => addToWatchlist(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add selected ({selected.size})
              </Button>
              <Button size="sm" disabled={saving || filtered.length === 0} onClick={() => addToWatchlist(false)}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                Add all to watchlist
              </Button>
            </>
          )}
          {!user && !authLoading && <AuthButton />}
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {authLoading ? (
          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Checking session…
          </div>
        ) : !user ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-muted-foreground">
            <p>Please sign in to view index constituents.</p>
            <AuthButton />
          </div>
        ) : !hasAccess ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 px-6 text-center text-sm text-muted-foreground">
            <p>Access pending admin approval (keechu7@gmail.com).</p>
          </div>
        ) : isLoading ? (

          <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading constituents…
          </div>
        ) : error ? (
          <div className="p-8 text-sm text-destructive">{(error as Error).message}</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground">
            No published constituents list for this index.
            <Link to="/markets" className="ml-2 underline">Back to Markets</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background border-b z-10">
              <tr>
                <th className="px-2 py-2 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size > 0 && selected.size === filtered.length}
                    onChange={toggleSelAll}
                    aria-label="Select all"
                  />
                </th>
                <SortHead k="ticker" label="Symbol" align="left" />
                <th className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">Industry</th>
                <SortHead k="price" label="Price" />
                <SortHead k="change_pct" label="1D %" />
                <SortHead k="perf_1w" label="1W %" />
                <SortHead k="perf_1m" label="1M %" />
                <SortHead k="perf_1y" label="1Y %" />
                <SortHead k="rsi14" label="RSI" />
                <SortHead k="pct_from_52w_high" label="% from 52H" />
                <SortHead k="rel_vol" label="RVol" />
                <SortHead k="market_cap" label="Mkt Cap" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.yahoo} className="border-b hover:bg-accent/40">
                  <td className="px-2 py-1.5">
                    <input
                      type="checkbox"
                      checked={selected.has(r.yahoo)}
                      onChange={() => toggleSel(r.yahoo)}
                      aria-label={`Select ${r.ticker}`}
                    />
                  </td>
                  <td className="px-2 py-1.5">
                    <a
                      href={chartUrlForSymbol(r.yahoo)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold hover:text-primary"
                    >
                      {r.ticker}
                    </a>
                    <div className="text-[11px] text-muted-foreground truncate max-w-[260px]">{r.name}</div>
                  </td>
                  <td className="px-2 py-1.5 text-xs text-muted-foreground">{r.industry || "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(r.price)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${pctColor(r.change_pct)}`}>{fmtPct(r.change_pct)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${pctColor(r.perf_1w)}`}>{fmtPct(r.perf_1w)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${pctColor(r.perf_1m)}`}>{fmtPct(r.perf_1m)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${pctColor(r.perf_1y)}`}>{fmtPct(r.perf_1y)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(r.rsi14, 1)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.pct_from_52w_high == null ? "—" : `-${r.pct_from_52w_high.toFixed(1)}%`}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmtNum(r.rel_vol)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{fmtCr(r.market_cap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
