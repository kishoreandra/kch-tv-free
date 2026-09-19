import { SymbolLink, TradingViewLink } from "@/components/SymbolLink";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Bell, Plus, RefreshCw, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { ApprovalGate } from "@/components/ApprovalGate";
import { AuthButton } from "@/components/AuthButton";
import { ProfileMenu } from "@/components/ProfileMenu";
import {
  listBandChanges,
  listBandWatchlist,
  listAllWatchlistSymbols,
  addBandWatch,
  removeBandWatch,
  sendTelegramTest,
  sendLatestBandChanges,
} from "@/lib/bands/band-alerts.functions";
import { refreshPriceBandsNow } from "@/lib/admin/refresh-price-bands.functions";

export const Route = createFileRoute("/band-alerts")({
  component: BandAlertsPage,
  head: () => ({
    meta: [
      { title: "Circuit Band Alerts · NSE Band Change Tracker" },
      {
        name: "description",
        content:
          "Track NSE circuit band changes per symbol, watch specific tickers, and get Telegram alerts when a band tightens on your open positions.",
      },
      { property: "og:title", content: "Circuit Band Alerts · NSE Band Change Tracker" },
      {
        property: "og:description",
        content: "Historical NSE circuit band changes with Telegram alerts for held and watched symbols.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/** 20% band first, then 10%, then everything else. */
function bandRank(band: string | null, pct: number | null): number {
  const n = pct ?? Number(String(band ?? "").replace(/[^\d.]/g, ""));
  if (n === 20) return 0;
  if (n === 10) return 1;
  return 2;
}

function bandLabel(band: string | null, pct: number | null): string {
  if (band && band.trim()) return band.includes("%") ? band : `${band}%`;
  if (pct != null) return `${pct}%`;
  return "—";
}

function BandAlertsPage() {
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const changesFn = useServerFn(listBandChanges);
  const watchFn = useServerFn(listBandWatchlist);
  const addFn = useServerFn(addBandWatch);
  const removeFn = useServerFn(removeBandWatch);
  const testFn = useServerFn(sendTelegramTest);
  const refreshFn = useServerFn(refreshPriceBandsNow);
  const sendLatestFn = useServerFn(sendLatestBandChanges);
  const watchlistSymbolsFn = useServerFn(listAllWatchlistSymbols);
  const [symbol, setSymbol] = useState("");
  const [notes, setNotes] = useState("");

  const changesQuery = useQuery({
    queryKey: ["band-changes"],
    queryFn: () => changesFn(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const watchQuery = useQuery({
    queryKey: ["band-watchlist"],
    queryFn: () => watchFn(),
    enabled: !!user,
    staleTime: 60_000,
  });
  const watchlistSymbolsQuery = useQuery({
    queryKey: ["band-watchlist-symbols"],
    queryFn: () => watchlistSymbolsFn(),
    enabled: !!user,
    staleTime: 60_000,
  });

  const addMut = useMutation({
    mutationFn: () => addFn({ data: { symbol, notes: notes || null } }),
    onSuccess: () => {
      setSymbol("");
      setNotes("");
      qc.invalidateQueries({ queryKey: ["band-watchlist"] });
      toast.success("Added to band watchlist");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add"),
  });
  const removeMut = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["band-watchlist"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to remove"),
  });
  const testMut = useMutation({
    mutationFn: () => testFn(),
    onSuccess: () => toast.success("Telegram test message sent"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Telegram test failed"),
  });
  const refreshMut = useMutation({
    mutationFn: () => refreshFn(),
    onSuccess: (r) => {
      // Bands are joined from price_bands at read time, so anything holding a
      // cached copy has to be dropped for the new bands to show up immediately.
      for (const key of ["band-changes", "symbol-stats", "screener", "price-band-freshness"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      // A refresh that found changes but failed to push them is not a success.
      if (r?.alerted === false) {
        toast.warning(r.message ?? "Bands refreshed, but the Telegram alert was not delivered");
      } else {
        toast.success(r?.message ?? "Bands refreshed");
      }
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Band refresh failed"),
  });
  const sendLatestMut = useMutation({
    mutationFn: () => sendLatestFn(),
    onSuccess: (r) => toast.success(`Sent ${r.count} change${r.count === 1 ? "" : "s"} for ${r.day}`),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Telegram send failed"),
  });

  const watched = new Set((watchQuery.data ?? []).map((w) => w.symbol));
  const allWatchlistSymbols = watchlistSymbolsQuery.data ?? new Map<string, string[]>();

  // Group detected changes by calendar day (newest first).
  const byDay = (() => {
    const map = new Map<string, typeof changesQuery.data extends undefined ? never : NonNullable<typeof changesQuery.data>>();
    for (const c of changesQuery.data ?? []) {
      const key = new Date(c.detected_at).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
      const list = map.get(key) ?? [];
      list.push(c);
      map.set(key, list);
    }
    // Within each day: moves to a 20% band first, then to 10%, then the rest.
    for (const [, list] of map) list.sort((a, b) => bandRank(a.new_band, a.new_band_pct) - bandRank(b.new_band, b.new_band_pct));
    return Array.from(map.entries());
  })();

  return (
    <ApprovalGate
      signedOut={
        <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-center">
          <h1 className="text-2xl font-semibold">Circuit band alerts</h1>
          <p className="text-sm text-muted-foreground">Please sign in to track NSE circuit band changes.</p>
          <AuthButton />
        </div>
      }
    >
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Button asChild variant="ghost" size="sm">
            <Link to="/">
              <ArrowLeft className="mr-1 h-4 w-4" /> Charts
            </Link>
          </Button>
          <h1 className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="h-4 w-4 text-amber-500" /> Circuit band alerts
          </h1>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {isAdmin && (
              <Button
                size="sm"
                variant="outline"
                title="Fetch NSE sec_list.csv and rebuild the price_bands table"
                onClick={() => refreshMut.mutate()}
                disabled={refreshMut.isPending}
              >
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshMut.isPending ? "animate-spin" : ""}`} /> Refresh sec bands
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => sendLatestMut.mutate()}
              disabled={sendLatestMut.isPending || (changesQuery.data?.length ?? 0) === 0}
            >
              <Send className="mr-1 h-3.5 w-3.5" /> Send latest to Telegram
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => testMut.mutate()}
              disabled={testMut.isPending}
            >
              <Send className="mr-1 h-3.5 w-3.5" /> Test Telegram
            </Button>
            <ProfileMenu />
          </div>
        </header>

        <main className="grid flex-1 grid-cols-1 gap-4 p-3 lg:grid-cols-[320px_1fr]">
          <section className="rounded-lg border border-border p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Alert watchlist ({watchQuery.data?.length ?? 0})
            </h2>
            <div className="mb-3 space-y-2">
              <Input
                placeholder="Symbol (e.g. RELIANCE)"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                placeholder="Note (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-8 text-sm"
              />
              <Button
                size="sm"
                className="w-full"
                disabled={!symbol.trim() || addMut.isPending}
                onClick={() => addMut.mutate()}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Add symbol
              </Button>
            </div>
            <ul className="space-y-1">
              {(watchQuery.data ?? []).map((w) => (
                <li
                  key={w.id}
                  className="flex items-center gap-2 rounded border border-border px-2 py-1 text-sm"
                >
                  <SymbolLink symbol={w.symbol} className="font-medium" />
                  <TradingViewLink symbol={w.symbol} />
                  {w.notes && <span className="truncate text-xs text-muted-foreground">{w.notes}</span>}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="ml-auto h-6 w-6"
                    onClick={() => removeMut.mutate(w.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
              {watchQuery.data?.length === 0 && (
                <li className="text-xs text-muted-foreground">
                  No symbols yet. Open positions are always alerted automatically.
                </li>
              )}
            </ul>
          </section>

          <section className="min-w-0 rounded-lg border border-border p-3">
            <h2 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Detected band changes
            </h2>
            {changesQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {changesQuery.data?.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No changes recorded yet. The NSE band list is fetched twice daily (7 PM and 7 AM IST);
                changes appear here from the next run onward.
              </p>
            )}
            {(changesQuery.data?.length ?? 0) > 0 && (
              <div className="space-y-4 overflow-auto">
                {byDay.map(([day, rows]) => (
                  <div key={day}>
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-foreground">{day}</h3>
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                        {rows.length} change{rows.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-xs text-muted-foreground">
                          <th className="py-1 pr-3">Symbol</th>
                          <th className="py-1 pr-3">Old</th>
                          <th className="py-1 pr-3">New</th>
                          <th className="py-1 pr-3">Time</th>
                          <th className="py-1">Alerted</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((c) => {
                          const tightened =
                            c.new_band_pct != null && c.old_band_pct != null && c.new_band_pct < c.old_band_pct;
                          const inWatchlists = allWatchlistSymbols.get(c.symbol.toUpperCase());
                          return (
                            <tr key={c.id} className={`border-b border-border/50 ${inWatchlists ? "bg-amber-50/30" : ""}`}>
                              <td className="py-1 pr-3 font-medium">
                                <span className="inline-flex items-center gap-1">
                                  {inWatchlists ? (
                                    <span className="font-bold underline">
                                      <SymbolLink symbol={c.symbol} />
                                    </span>
                                  ) : (
                                    <SymbolLink symbol={c.symbol} />
                                  )}
                                  <TradingViewLink symbol={c.symbol} />
                                  {inWatchlists && <span className="text-[10px] text-amber-500">🔥</span>}
                                  {watched.has(c.symbol) && <span className="text-[10px] text-amber-500">★</span>}
                                  {inWatchlists && (
                                    <span className="text-[10px] text-muted-foreground">({inWatchlists.join(", ")})</span>
                                  )}
                                </span>
                              </td>
                              <td className="py-1 pr-3 text-muted-foreground">
                                {bandLabel(c.old_band, c.old_band_pct)}
                              </td>
                              <td className={`py-1 pr-3 font-medium ${tightened ? "text-red-500" : "text-emerald-500"}`}>
                                {bandLabel(c.new_band, c.new_band_pct)}
                              </td>
                              <td className="py-1 pr-3 text-xs text-muted-foreground">
                                {new Date(c.detected_at).toLocaleTimeString("en-IN")}
                              </td>
                              <td className="py-1 text-xs">
                                {c.notified ? (
                                  "Yes"
                                ) : c.digested ? (
                                  <span className="text-muted-foreground">Digest</span>
                                ) : (
                                  <span
                                    className="font-medium text-amber-600"
                                    title="No Telegram message carried this change"
                                  >
                                    not sent
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </ApprovalGate>
  );
}
