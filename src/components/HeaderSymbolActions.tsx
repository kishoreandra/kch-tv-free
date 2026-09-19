import { useId, useMemo, useState } from "react";
import { StickyNote } from "lucide-react";
import { toast } from "sonner";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { AlertBellButton } from "@/components/AlertBellButton";
import { LIST_COLORS, makeId, type CustomList } from "@/components/Watchlist";
import type { NseSymbol } from "@/data/nse-symbols";

interface Props {
  symbol: NseSymbol;
  lists: CustomList[];
  setLists: React.Dispatch<React.SetStateAction<CustomList[]>>;
  lastListId: string | null;
  setLastListId: (id: string | null) => void;
  onGoToList?: (listId: string) => void;
}

export function HeaderSymbolActions({
  symbol,
  lists,
  setLists,
  lastListId,
  setLastListId,
  onGoToList,
}: Props) {
  const [listsOpen, setListsOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(LIST_COLORS[0]);

  const inLists = useMemo(() => {
    const s = new Set<string>();
    for (const l of lists) if (l.symbols.some((x) => x.yahoo === symbol.yahoo)) s.add(l.id);
    return s;
  }, [lists, symbol.yahoo]);

  // Scanning lists shouldn't count as "starred" — they're a workflow queue,
  // not a curated watchlist. Only non-scanning lists fill the star + show dots.
  const watchlistMemberships = useMemo(
    () =>
      lists.filter(
        (l) =>
          inLists.has(l.id) &&
          l.kind !== "scanning" &&
          l.name !== "Scanning Process",
      ),
    [lists, inLists],
  );


  const allNotes = useMemo(
    () =>
      lists
        .filter((l) => l.kind !== "scanning" && l.name !== "Scanning Process")
        .map((l) => ({ list: l, note: (l.notes?.[symbol.yahoo] ?? "").trim() }))
        .filter((x) => x.note.length > 0),
    [lists, symbol.yahoo],
  );

  const starred = watchlistMemberships.length > 0;
  const focusedList = lists.find((l) => l.name.toLowerCase() === "focused") ?? null;
  const lastList = lists.find((l) => l.id === lastListId) ?? null;
  const quickList = focusedList ?? lastList;


  const toggleListMembership = (listId: string) => {
    setLists((arr) =>
      arr.map((l) => {
        if (l.id !== listId) return l;
        const has = l.symbols.some((x) => x.yahoo === symbol.yahoo);
        if (has) {
          const { [symbol.yahoo]: _drop, ...rest } = l.notes;
          return { ...l, symbols: l.symbols.filter((x) => x.yahoo !== symbol.yahoo), notes: rest };
        }
        return { ...l, symbols: [...l.symbols, symbol] };
      }),
    );
    // Note: do NOT setLastListId here — checking a box in the picker shouldn't
    // silently retarget the sidebar or the star's quick-toggle destination.
  };


  const setNote = (listId: string, note: string) => {
    setLists((arr) =>
      arr.map((l) => {
        if (l.id !== listId) return l;
        const notes = { ...l.notes };
        if (note.trim()) notes[symbol.yahoo] = note.trim();
        else delete notes[symbol.yahoo];
        return { ...l, notes };
      }),
    );
  };

  const createList = (name: string, color: string) => {
    const id = makeId();
    setLists((arr) => [...arr, { id, name, color, symbols: [symbol], notes: {} }]);
    setLastListId(id);
  };

  // Safer star click — never removes from a list (removal would also drop the
  // symbol's notes, which is the data-loss accident the user wants prevented).
  //   - Shift-click or right-click          → open the lists popover
  //   - Focused exists                       → use Focused as the default target
  //   - No quick target                      → open the lists popover
  //   - Symbol NOT in quick target           → add to quick target
  //   - Symbol already in quick target       → show confirmation
  const handleStarClick = (e: React.MouseEvent) => {
    if (e.shiftKey || !quickList) {
      setListsOpen(true);
      return;
    }
    const already = quickList.symbols.some((x) => x.yahoo === symbol.yahoo);
    if (already) {
      // Don't hijack the sidebar — just tell the user it's already there.
      toast.info(`${symbol.ticker} is already in “${quickList.name}”`);
      return;
    }
    setLists((arr) =>
      arr.map((l) =>
        l.id === quickList.id ? { ...l, symbols: [...l.symbols, symbol] } : l,
      ),
    );
    setLastListId(quickList.id);
    toast.success(`Added ${symbol.ticker} to “${quickList.name}”`);
  };


  const noteSummary = allNotes.map((n) => `${n.list.name}: ${n.note}`).join("\n");
  // Clipboard gets the raw note text only — no list names or extra labels.
  const noteClipboardText = allNotes.map((n) => n.note).join("\n");


  return (
    <div className="flex items-center gap-1">


      {/* Clickable dots — one per watchlist this symbol belongs to. Click jumps
          the sidebar to that list and scrolls to this symbol. */}
      {onGoToList && watchlistMemberships.length > 0 && (
        <span className="flex items-center gap-1">
          {watchlistMemberships.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                onGoToList(l.id);
                setLastListId(l.id);
              }}
              title={`Jump to “${l.name}”`}
              aria-label={`Jump to ${l.name}`}
              className="h-2.5 w-2.5 rounded-full ring-1 ring-transparent transition hover:scale-125 hover:ring-foreground/40"
              style={{ background: l.color }}
            />
          ))}
        </span>
      )}

      {/* Star = add to list */}
      <Popover open={listsOpen} onOpenChange={setListsOpen}>
        <PopoverTrigger asChild>
          <button
            onClick={handleStarClick}
            onContextMenu={(e) => {
              e.preventDefault();
              setListsOpen(true);
            }}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-muted"
            aria-label="Add to list"
            title={
              quickList
                ? `Click: add to “${quickList.name}” (never removes) · Shift-click: choose list`
                : "Add to list"
            }
          >
            <GradientStar
              colors={watchlistMemberships.map((l) => l.color)}
              filled={starred}
            />
          </button>
        </PopoverTrigger>


        <PopoverContent className="w-72" align="end">
          <div className="space-y-2">
            <div className="text-xs font-semibold">
              Add {symbol.ticker} to lists
            </div>
            {lists.length === 0 && (
              <div className="text-[11px] text-muted-foreground">
                No lists yet. Create one below.
              </div>
            )}
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {lists.map((l) => {
                const checked = inLists.has(l.id);
                return (
                  <div key={l.id} className="rounded border border-border/60 p-1.5">
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleListMembership(l.id)}
                      />
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: l.color }}
                      />
                      <span className="flex-1 truncate">{l.name}</span>
                    </label>
                    {checked && (
                      <input
                        type="text"
                        placeholder="Note (optional)"
                        defaultValue={l.notes[symbol.yahoo] ?? ""}
                        onBlur={(e) => setNote(l.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter")
                            (e.target as HTMLInputElement).blur();
                        }}
                        className="mt-1 h-6 w-full rounded border border-border bg-transparent px-1.5 text-[11px]"
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border pt-2">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                New list
              </div>
              <div className="flex items-center gap-1">
                <Input
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newName.trim()) {
                      createList(newName.trim(), newColor);
                      setNewName("");
                    }
                  }}
                  className="h-6 flex-1 text-xs"
                />
                <button
                  onClick={() => {
                    if (newName.trim()) {
                      createList(newName.trim(), newColor);
                      setNewName("");
                    }
                  }}
                  disabled={!newName.trim()}
                  className="rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {LIST_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`h-3 w-3 rounded-full ${
                      c === newColor ? "ring-1 ring-foreground" : ""
                    }`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <AlertBellButton ticker={symbol.ticker} note={allNotes[0]?.note} className="h-7 w-7" />

      {/* Note button */}
      <Popover open={noteOpen} onOpenChange={setNoteOpen}>
        <PopoverTrigger asChild>
          <button
            className={`relative flex h-7 w-7 items-center justify-center rounded hover:bg-muted ${
              allNotes.length > 0
                ? "bg-amber-400/15 text-amber-400 ring-1 ring-amber-400/40"
                : "text-muted-foreground/70"
            }`}
            aria-label="Notes"
            title={allNotes.length > 0 ? `${noteSummary}\n\n(click to view · copies note)` : "Add a note"}
            onClick={() => {
              if (allNotes.length > 0 && typeof navigator !== "undefined" && navigator.clipboard) {
                navigator.clipboard
                  .writeText(noteClipboardText)
                  .then(() => toast.success("Note copied"))
                  .catch(() => {});
              }
            }}
          >
            <StickyNote className="h-3.5 w-3.5" />
            {allNotes.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-amber-400" />
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent className="w-80" align="end">
          <div className="space-y-2">
            <div className="text-xs font-semibold">Notes for {symbol.ticker}</div>
            {inLists.size === 0 ? (
              <div className="text-[11px] text-muted-foreground">
                Add {symbol.ticker} to a list first, then write a note for it.
              </div>
            ) : (
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {lists
                  .filter((l) => inLists.has(l.id))
                  .map((l) => (
                    <div key={l.id} className="rounded border border-border/60 p-2">
                      <div className="mb-1 flex items-center gap-2 text-[11px]">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: l.color }}
                        />
                        <span className="font-medium">{l.name}</span>
                      </div>
                      <textarea
                        defaultValue={l.notes[symbol.yahoo] ?? ""}
                        placeholder="Write a note…"
                        onBlur={(e) => setNote(l.id, e.target.value)}
                        rows={2}
                        className="w-full resize-y rounded border border-border bg-transparent px-2 py-1 text-[12px] outline-none focus:border-primary"
                      />
                    </div>
                  ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/**
 * Star icon whose fill is a smooth linear gradient blending every watchlist
 * color the symbol belongs to. When `filled` is false (not in any non-scanning
 * watchlist), it renders as a soft muted outline.
 */
function GradientStar({ colors, filled }: { colors: string[]; filled: boolean }) {
  const gradId = useId();
  // Path = lucide's star, normalised to a 24-box viewBox.
  const STAR_D =
    "M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z";

  if (!filled || colors.length === 0) {
    return (
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
        <path
          d={STAR_D}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.75}
          strokeLinejoin="round"
          className="text-muted-foreground/60 blur-[0.3px] opacity-70"
        />
      </svg>
    );
  }

  // Build evenly-spaced stops across all watchlist colors.
  const stops =
    colors.length === 1
      ? [
          { offset: 0, color: colors[0] },
          { offset: 1, color: colors[0] },
        ]
      : colors.map((c, i) => ({ offset: i / (colors.length - 1), color: c }));

  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 drop-shadow-[0_0_3px_rgba(0,0,0,0.25)]">
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          {stops.map((s, i) => (
            <stop key={i} offset={`${s.offset * 100}%`} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      <path
        d={STAR_D}
        fill={`url(#${gradId})`}
        stroke={`url(#${gradId})`}
        strokeWidth={1}
        strokeLinejoin="round"
      />
    </svg>
  );
}
