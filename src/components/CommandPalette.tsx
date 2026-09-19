import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, Plus, Check, Clock, Trash2, Command as CmdIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { NSE_SYMBOLS, type NseSymbol } from "@/data/nse-symbols";
import type { CustomList } from "@/components/Watchlist";

const HISTORY_MAX = 100;

function pushHistory(cur: NseSymbol[], sym: NseSymbol): NseSymbol[] {
  return [sym, ...cur.filter((x) => x.yahoo !== sym.yahoo)].slice(0, HISTORY_MAX);
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  history: NseSymbol[];
  setHistory: (updater: (cur: NseSymbol[]) => NseSymbol[]) => void;
  lists: CustomList[];
  setLists: (updater: (cur: CustomList[]) => CustomList[]) => void;
  onSelect: (yahoo: string) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  history,
  setHistory,
  lists,
  setLists,
  onSelect,
}: Props) {
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as NseSymbol[];
    type Scored = { s: NseSymbol; score: number };
    const scored: Scored[] = [];
    for (const s of NSE_SYMBOLS) {
      const t = s.ticker.toLowerCase();
      const n = s.name.toLowerCase();
      let score = -1;
      if (t === q) score = 0;
      else if (t.startsWith(q)) score = 1;
      else if (n.startsWith(q)) score = 2;
      else if (t.includes(q)) score = 3;
      else if (n.includes(q)) score = 4;
      else if (s.sector?.toLowerCase().includes(q)) score = 5;
      if (score >= 0) scored.push({ s, score });
    }
    scored.sort((a, b) => a.score - b.score || a.s.ticker.length - b.s.ticker.length);
    return scored.slice(0, 40).map((x) => x.s);
  }, [query]);

  const customCandidate = useMemo(() => {
    const raw = query.trim().toUpperCase().replace(/\s+/g, "");
    if (!raw || !/^[A-Z0-9&-]{1,20}$/.test(raw)) return null;
    if (results.some((s) => s.ticker.toUpperCase() === raw)) return null;
    const yahoo = `${raw}.NS`;
    return { ticker: raw, name: `${raw} (NSE)`, yahoo, sector: "Custom" } as NseSymbol;
  }, [query, results]);

  // Rows currently displayed (search results when typing, history when empty)
  const rows = useMemo<NseSymbol[]>(() => {
    if (query.trim()) {
      return customCandidate ? [customCandidate, ...results] : results;
    }
    return history;
  }, [query, customCandidate, results, history]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  const pick = (s: NseSymbol) => {
    setHistory((cur) => pushHistory(cur, s));
    onSelect(s.yahoo);
    onOpenChange(false);
  };

  const removeHistoryOne = (yahoo: string) => {
    setHistory((cur) => cur.filter((s) => s.yahoo !== yahoo));
  };

  const toggleSymbolInList = (listId: string, sym: NseSymbol) => {
    setLists((arr) =>
      arr.map((l) => {
        if (l.id !== listId) return l;
        const has = l.symbols.some((x) => x.yahoo === sym.yahoo);
        if (has) {
          const { [sym.yahoo]: _, ...rest } = l.notes;
          return { ...l, symbols: l.symbols.filter((x) => x.yahoo !== sym.yahoo), notes: rest };
        }
        return { ...l, symbols: [...l.symbols, sym] };
      }),
    );
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(rows.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const r = rows[activeIdx];
      if (r) pick(r);
    }
  };

  const isEmptyState = !query.trim() && history.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!top-[15%] !translate-y-0 max-w-xl gap-0 overflow-hidden p-0 [&>button]:hidden">

        {/* Search input */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search NSE symbol or company…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline-block">
              ESC
            </kbd>
          )}
        </div>

        {/* Section header */}
        {!isEmptyState && (
          <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {query.trim() ? (
                <>
                  <Search className="h-3 w-3" />
                  Results {rows.length > 0 ? `(${rows.length})` : ""}
                </>
              ) : (
                <>
                  <Clock className="h-3 w-3" />
                  Recent ({history.length})
                </>
              )}
            </div>
            {!query.trim() && history.length > 0 && (
              <button
                onClick={() => {
                  if (window.confirm(`Clear all ${history.length} recent symbols?`)) {
                    setHistory(() => []);
                    toast.success("Cleared recent history");
                  }
                }}
                className="flex items-center gap-1 rounded p-1 text-[10px] text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                title="Clear history"
              >
                <Trash2 className="h-3 w-3" /> Clear
              </button>
            )}
          </div>
        )}

        {/* Rows */}
        <div className="max-h-[60vh] overflow-y-auto py-1">
          {isEmptyState ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-xs text-muted-foreground">
              <Search className="h-5 w-5 opacity-50" />
              <p>Search any NSE symbol or company name.</p>
              <p className="text-[10px]">
                Tip: press <kbd className="rounded border border-border bg-muted px-1">↑</kbd>
                <kbd className="ml-0.5 rounded border border-border bg-muted px-1">↓</kbd> to navigate,{" "}
                <kbd className="rounded border border-border bg-muted px-1">↵</kbd> to open.
              </p>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">No matches</div>
          ) : (
            rows.map((s, i) => {
              const inLists = lists.filter((l) => l.symbols.some((x) => x.yahoo === s.yahoo));
              const isCustomCandidate = !!customCandidate && i === 0 && query.trim() !== "";
              const isHistory = !query.trim();
              return (
                <div
                  key={s.yahoo}
                  onMouseEnter={() => setActiveIdx(i)}
                  onClick={() => pick(s)}
                  className={`group/row flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${
                    i === activeIdx ? "bg-muted/70" : "hover:bg-muted/40"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{s.ticker}</span>
                      {isCustomCandidate && (
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-primary">
                          Open as NSE
                        </span>
                      )}
                      {inLists.length > 0 && (
                        <div className="flex items-center gap-0.5">
                          {inLists.slice(0, 4).map((l) => (
                            <span
                              key={l.id}
                              title={l.name}
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: l.color }}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{s.name}</div>
                  </div>

                  {/* Add to list */}
                  <AddToListButton
                    lists={lists}
                    sym={s}
                    onToggle={toggleSymbolInList}
                  />

                  {/* Remove from history */}
                  {isHistory && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeHistoryOne(s.yahoo);
                      }}
                      className="rounded p-1 text-muted-foreground opacity-0 hover:bg-destructive/15 hover:text-destructive group-hover/row:opacity-100"
                      title="Remove from recent"
                      aria-label="Remove from recent"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-3 py-1.5 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-background px-1">↵</kbd> Open
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-border bg-background px-1">+</kbd> Add to list
            </span>
          </div>
          <span className="flex items-center gap-1">
            <CmdIcon className="h-3 w-3" /> K
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AddToListButton({
  lists,
  sym,
  onToggle,
}: {
  lists: CustomList[];
  sym: NseSymbol;
  onToggle: (listId: string, sym: NseSymbol) => void;
}) {
  const [open, setOpen] = useState(false);
  const memberCount = lists.filter((l) => l.symbols.some((x) => x.yahoo === sym.yahoo)).length;

  if (lists.length === 0) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          className={`rounded p-1 transition-colors ${
            memberCount > 0
              ? "text-primary hover:bg-primary/15"
              : "text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground group-hover/row:opacity-100"
          }`}
          title={memberCount > 0 ? `In ${memberCount} list${memberCount === 1 ? "" : "s"}` : "Add to list"}
          aria-label="Add to list"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-52 p-1"
        align="end"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Add to list
        </div>
        {lists.map((l) => {
          const inList = l.symbols.some((x) => x.yahoo === sym.yahoo);
          return (
            <button
              key={l.id}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(l.id, sym);
              }}
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-muted"
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: l.color }}
              />
              <span className="flex-1 truncate">{l.name}</span>
              {inList && <Check className="h-3.5 w-3.5 text-primary" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}
