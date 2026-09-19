import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Search, ChevronDown, ChevronRight, X, LayoutGrid, LineChart, ChevronLeft } from "lucide-react";
import { ProfileMenu } from "@/components/ProfileMenu";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MARKET_SECTIONS, MARKET_UNIVERSES, type MarketItem } from "@/data/markets-catalog";
import { chartUrlForSymbol } from "@/lib/chart-links";
import { TVChart, type TvInterval } from "@/components/TVChart";
import { indexHasConstituents, symbolToConstituentParam } from "@/lib/markets/constituents.functions";
import { List as ListIcon } from "lucide-react";

const VIEW_KEY = "nse-mv:markets-view";
const TF_KEY = "nse-mv:markets-tf";
const ROWS_KEY = "nse-mv:markets-rows";
const COLS_KEY = "nse-mv:markets-cols";
const PAGE_KEY = "nse-mv:markets-page";

type ViewMode = "cards" | "charts";

const TIMEFRAMES: { id: TvInterval; label: string }[] = [
  { id: "60", label: "1H" },
  { id: "D", label: "1D" },
  { id: "W", label: "1W" },
  { id: "M", label: "1M" },
];

export const Route = createFileRoute("/markets")({
  head: () => ({
    meta: [
      { title: "Indices & ETFs — NSE MultiView" },
      { name: "description", content: "Browse Indian indices and ETFs (NSE & BSE). Click any card to open the chart view." },
    ],
  }),
  component: MarketsPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Markets page failed: {error.message}</div>
  ),
  notFoundComponent: () => <div className="p-8">Not found.</div>,
});

function openChart(yahoo: string) {
  window.open(chartUrlForSymbol(yahoo), "_blank", "noopener,noreferrer");
}

function readNum(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === "undefined") return fallback;
  const v = parseInt(localStorage.getItem(key) ?? "", 10);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

const TILE_GRID =
  "grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

function MarketTile({ it }: { it: MarketItem }) {
  const hasConst = indexHasConstituents(it.yahoo);
  return (
    <div className="group relative flex flex-col items-start gap-1 rounded-lg border bg-card p-3 text-left transition-all hover:border-primary hover:shadow-md">
      <button
        onClick={() => openChart(it.yahoo)}
        className="absolute inset-0"
        title={`Open ${it.name} chart in new tab`}
        aria-label={`Open ${it.name} chart`}
      />
      <div className="relative flex w-full items-center justify-between gap-2 pointer-events-none">
        <span className="truncate text-sm font-semibold group-hover:text-primary">{it.ticker}</span>
        {it.exchange && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {it.exchange}
          </span>
        )}
      </div>
      <span className="relative line-clamp-1 text-xs text-muted-foreground pointer-events-none">
        {it.name}
      </span>
      {hasConst && (
        <Link
          to="/markets/constituents/$symbol"
          params={{ symbol: symbolToConstituentParam(it.yahoo) }}
          target="_blank"
          rel="noopener noreferrer"
          className="relative z-10 mt-1 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          <ListIcon className="h-3 w-3" /> Constituents
        </Link>
      )}
    </div>
  );
}

function MarketsPage() {
  const [query, setQuery] = useState("");
  // Two sections: Indices (default) and ETFs. Nothing is removed — switching
  // the toggle swaps which half of MARKET_SECTIONS is in play.
  const [universe, setUniverse] = useState<"index" | "etf">("index");
  const [activeSections, setActiveSections] = useState<Set<string>>(
    () => new Set(MARKET_SECTIONS.map((s) => s.id)),
  );
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "cards";
    return (localStorage.getItem(VIEW_KEY) as ViewMode) || "cards";
  });
  const [tf, setTf] = useState<TvInterval>(() => {
    if (typeof window === "undefined") return "D";
    return ((localStorage.getItem(TF_KEY) as TvInterval) || "D");
  });
  const [rows, setRows] = useState<number>(() => readNum(ROWS_KEY, 2, 1, 6));
  const [cols, setCols] = useState<number>(() => readNum(COLS_KEY, 2, 1, 6));
  const [page, setPage] = useState<number>(() => readNum(PAGE_KEY, 0, 0, 999));

  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch {} }, [view]);
  useEffect(() => { try { localStorage.setItem(TF_KEY, tf); } catch {} }, [tf]);
  useEffect(() => { try { localStorage.setItem(ROWS_KEY, String(rows)); } catch {} }, [rows]);
  useEffect(() => { try { localStorage.setItem(COLS_KEY, String(cols)); } catch {} }, [cols]);
  useEffect(() => { try { localStorage.setItem(PAGE_KEY, String(page)); } catch {} }, [page]);

  const q = query.trim().toLowerCase();

  const sections = useMemo(() => {
    return MARKET_SECTIONS
      .filter((s) => s.kind === universe && activeSections.has(s.id))
      .map((s) => ({
        ...s,
        items: q
          ? s.items.filter(
              (i) =>
                i.ticker.toLowerCase().includes(q) ||
                i.name.toLowerCase().includes(q) ||
                i.group.toLowerCase().includes(q),
            )
          : s.items,
      }))
      .filter((s) => s.items.length > 0);
  }, [activeSections, q, universe]);

  const totalShown = sections.reduce((n, s) => n + s.items.length, 0);

  // Flat list for charts view + pagination. Pinned indices (Nifty 50, Nifty 500,
  // Equal Weight, Bank, Auto) lead the grid; the rest keep catalog order.
  const flatItems: MarketItem[] = useMemo(
    () =>
      sections
        .flatMap((s) => s.items)
        .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)),
    [sections],
  );
  // Pinned indices render once, above every section, in the cards view.
  const pinnedItems = useMemo(
    () =>
      sections
        .flatMap((s) => s.items)
        .filter((it) => it.priority != null)
        .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0)),
    [sections],
  );

  const perPage = Math.max(1, rows * cols);
  const totalPages = Math.max(1, Math.ceil(flatItems.length / perPage));
  const safePage = Math.min(page, totalPages - 1);
  const pageItems = flatItems.slice(safePage * perPage, safePage * perPage + perPage);

  // Reset to first page when filters / grid size change pagination range
  useEffect(() => {
    if (page > totalPages - 1) setPage(0);
  }, [totalPages, page]);

  return (
    <div className="dark h-screen flex flex-col bg-background text-foreground overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2 shrink-0">
        <Link to="/">
          <Button variant="ghost" size="sm" className="gap-1">
            <ArrowLeft className="h-4 w-4" /> Charts
          </Button>
        </Link>
        <h1 className="text-lg font-semibold">Indices & ETFs</h1>
        <span className="text-xs text-muted-foreground">{totalShown} items</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-56 pl-7 pr-7 h-8 text-sm"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
            <button
              onClick={() => setView("cards")}
              className={`flex h-7 items-center gap-1 rounded px-2 text-xs ${view === "cards" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Cards view"
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Cards
            </button>
            <button
              onClick={() => setView("charts")}
              className={`flex h-7 items-center gap-1 rounded px-2 text-xs ${view === "charts" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              title="Charts grid"
            >
              <LineChart className="h-3.5 w-3.5" /> Charts
            </button>
          </div>
          {view === "charts" && (
            <>
              <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
                {TIMEFRAMES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTf(t.id)}
                    className={`h-7 rounded px-2 text-[11px] ${tf === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1 rounded-md border bg-background px-2 h-8 text-xs">
                <span className="text-muted-foreground">Grid</span>
                <select
                  value={rows}
                  onChange={(e) => setRows(parseInt(e.target.value, 10))}
                  className="bg-background h-6 text-xs outline-none"
                  title="Rows"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <span className="text-muted-foreground">×</span>
                <select
                  value={cols}
                  onChange={(e) => setCols(parseInt(e.target.value, 10))}
                  className="bg-background h-6 text-xs outline-none"
                  title="Cols"
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            </>
          )}
          <Link to="/screeners">
            <Button size="sm" variant="outline">Screeners</Button>
          </Link>
          <ProfileMenu />
        </div>

      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b px-4 py-2 shrink-0">
        <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5">
          {MARKET_UNIVERSES.map((u) => (
            <button
              key={u.id}
              onClick={() => setUniverse(u.id)}
              className={`h-7 rounded px-3 text-xs font-medium ${
                universe === u.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {u.label}
            </button>
          ))}
        </div>
        <span className="mx-1 h-5 w-px bg-border" />
        {MARKET_SECTIONS.filter((s) => s.kind === universe).map((s) => {
          const on = activeSections.has(s.id);
          return (
            <button
              key={s.id}
              onClick={() => {
                setActiveSections((prev) => {
                  const next = new Set(prev);
                  if (next.has(s.id)) next.delete(s.id);
                  else next.add(s.id);
                  return next;
                });
              }}
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                on
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground hover:bg-accent"
              }`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {view === "charts" ? (
        <ChartsGrid
          items={pageItems}
          rows={rows}
          cols={cols}
          interval={tf}
          page={safePage}
          totalPages={totalPages}
          onPage={setPage}
          totalItems={flatItems.length}
          perPage={perPage}
        />
      ) : (
        <div className="flex-1 overflow-auto px-4 py-4 space-y-6">
          {sections.length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-12">
              No items match your filters.
            </div>
          )}
          {pinnedItems.length > 0 && (
            <div>
              <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Top Indices</div>
              <div className={TILE_GRID}>
                {pinnedItems.map((it) => (
                  <MarketTile key={it.yahoo} it={it} />
                ))}
              </div>
            </div>
          )}
          {sections.map((s) => {
            const isCollapsed = collapsed.has(s.id);
            // Pinned items already rendered above, so exclude them from the groups.
            const rest = s.items.filter((it) => it.priority == null);
            const byGroup = new Map<string, MarketItem[]>();
            for (const it of rest) {
              const arr = byGroup.get(it.group) ?? [];
              arr.push(it);
              byGroup.set(it.group, arr);
            }
            return (
              <section key={s.id}>
                <button
                  onClick={() => {
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(s.id)) next.delete(s.id);
                      else next.add(s.id);
                      return next;
                    });
                  }}
                  className="mb-2 flex items-center gap-2 text-sm font-semibold hover:text-primary"
                >
                  {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  {s.label}
                  <span className="text-xs font-normal text-muted-foreground">({rest.length})</span>
                </button>
                {!isCollapsed && (
                  <div className="space-y-4">
                    {Array.from(byGroup.entries()).map(([g, items]) => (
                      <div key={g}>
                        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{g}</div>
                        <div className={TILE_GRID}>
                          {items.map((it) => (
                            <MarketTile key={it.yahoo} it={it} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ChartsGridProps {
  items: MarketItem[];
  rows: number;
  cols: number;
  interval: TvInterval;
  page: number;
  totalPages: number;
  totalItems: number;
  perPage: number;
  onPage: (p: number) => void;
}

function ChartsGrid({ items, rows, cols, interval, page, totalPages, onPage, totalItems, perPage }: ChartsGridProps) {
  const from = totalItems === 0 ? 0 : page * perPage + 1;
  const to = Math.min(totalItems, page * perPage + items.length);
  // Each tile ~400x400. Use width/height so the grid scrolls horizontally if many cols.
  const tileW = 400;
  const tileH = 400;
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-auto p-3">
        {items.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-12">No items.</div>
        ) : (
          <div
            className="grid gap-3"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(${tileW}px, 1fr))`,
              gridTemplateRows: `repeat(${rows}, ${tileH + 36}px)`,
            }}
          >
            {items.map((it) => (
              <div
                key={it.yahoo}
                className="rounded-lg border bg-card overflow-hidden flex flex-col"
              >
                <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-b shrink-0">
                  <button
                    onClick={() => window.open(chartUrlForSymbol(it.yahoo), "_blank", "noopener,noreferrer")}
                    className="flex min-w-0 items-center gap-2 text-left hover:text-primary"
                    title={`Open ${it.name} full chart`}
                  >
                    <span className="truncate text-sm font-semibold">{it.ticker}</span>
                    {it.exchange && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{it.exchange}</span>
                    )}
                    <span className="truncate text-xs text-muted-foreground hidden sm:inline">{it.name}</span>
                  </button>
                  {indexHasConstituents(it.yahoo) && (
                    <Link
                      to="/markets/constituents/$symbol"
                      params={{ symbol: symbolToConstituentParam(it.yahoo) }}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-[10px] text-primary hover:underline inline-flex items-center gap-1"
                      title="View constituents (new tab)"
                    >
                      <ListIcon className="h-3 w-3" /> Constituents
                    </Link>
                  )}
                </div>
                <div className="flex-1 min-h-0">
                  <TVChart symbol={it.yahoo} interval={interval} height={tileH} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between border-t px-4 py-2 shrink-0 text-xs text-muted-foreground">
        <span>
          Showing {from}-{to} of {totalItems}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 0}
            onClick={() => onPage(Math.max(0, page - 1))}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Button>
          <span>
            Page {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages - 1}
            onClick={() => onPage(Math.min(totalPages - 1, page + 1))}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
