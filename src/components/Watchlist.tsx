import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { exportWatchlistExcel } from "@/lib/watchlist-export.functions";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  CheckSquare,
  Copy,
  Download,
  GripVertical,
  Lock,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Share2,
  Star,
  Trash2,
  Unlock,
  Upload,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { toast } from "sonner";
import { NSE_SYMBOLS, findSymbol, type NseSymbol } from "@/data/nse-symbols";
import { AlertBellButton } from "@/components/AlertBellButton";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface CustomList {
  id: string;
  name: string;
  color: string;
  symbols: NseSymbol[];
  notes: Record<string, string>; // yahoo -> note
  pinned?: boolean;
  kind?: "default" | "scanning";
  protected?: boolean; // cannot be deleted (rename/recolor still allowed)
}

// Expanded palette — grouped roughly by hue, tuned for dark UI legibility.
export const LIST_COLORS = [
  // reds / pinks
  "#ef4444", "#f43f5e", "#ec4899", "#d946ef",
  // oranges / ambers / yellows
  "#f97316", "#f59e0b", "#eab308", "#facc15",
  // greens / teals
  "#84cc16", "#22c55e", "#10b981", "#14b8a6",
  // cyans / blues
  "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  // purples
  "#8b5cf6", "#a855f7", "#c084fc", "#e879f9",
  // neutrals / earthy
  "#94a3b8", "#78716c", "#a8a29e", "#d6d3d1",
];

export function makeId() {
  return `l_${Math.random().toString(36).slice(2, 9)}`;
}

export const PROTECTED_LIST_NAMES = ["Holdings", "Buyable", "Focused"] as const;

export function makeDefaultLists(): CustomList[] {
  return [
    { id: makeId(), name: "Holdings", color: "#22c55e", symbols: [], notes: {}, pinned: true, protected: true },
    { id: makeId(), name: "Buyable",  color: "#3b82f6", symbols: [], notes: {}, pinned: true, protected: true },
    { id: makeId(), name: "Focused",  color: "#a855f7", symbols: [], notes: {}, pinned: true, protected: true },
  ];
}

type GroupKey = string; // "main" | listId

interface Props {
  main: NseSymbol[];
  setMain: (updater: (cur: NseSymbol[]) => NseSymbol[]) => void;
  lists: CustomList[];
  setLists: (updater: (cur: CustomList[]) => CustomList[]) => void;
  selected: string | null;
  onSelect: (yahoo: string) => void;
  lastListId: string | null;
  setLastListId: (id: string | null) => void;
  onActiveSymbolsChange?: (symbols: NseSymbol[]) => void;
  group?: GroupKey;
  onGroupChange?: (g: GroupKey) => void;
}

const TOKEN_RE = /^[A-Z0-9&-]{1,20}$/;

function tokenToSymbol(raw: string): NseSymbol | null {
  let t = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return null;
  if (t.endsWith(".NS") || t.endsWith(".BO")) t = t.slice(0, -3);
  if (!TOKEN_RE.test(t)) return null;
  const yahoo = `${t}.NS`;
  return findSymbol(yahoo) ?? { ticker: t, name: `${t} (NSE)`, yahoo, sector: "Custom" };
}

function parseTokens(text: string) {
  const parts = text.split(/[\s,;\t\n\r]+/).filter(Boolean);
  const valid: NseSymbol[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  let dup = 0;
  for (const p of parts) {
    const sym = tokenToSymbol(p);
    if (!sym) { invalid.push(p); continue; }
    if (seen.has(sym.yahoo)) { dup += 1; continue; }
    seen.add(sym.yahoo);
    valid.push(sym);
  }
  return { valid, invalid, dup };
}

function downloadCsv(filename: string, items: NseSymbol[], notes?: Record<string, string>) {
  const header = notes ? "ticker,yahoo,name,sector,note" : "ticker,yahoo,name,sector";
  const esc = (v: string | undefined) => {
    const x = v ?? "";
    return /[",\n]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x;
  };
  const rows = items.map((s) => {
    const base = [esc(s.ticker), esc(s.yahoo), esc(s.name), esc(s.sector)];
    return notes ? [...base, esc(notes[s.yahoo])].join(",") : base.join(",");
  });
  const blob = new Blob([header + "\n" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function safeFilename(name: string): string {
  return (name || "Watchlist").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "Watchlist";
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function normalizeSharedSymbol(raw: any): NseSymbol | null {
  const rawYahoo = String(raw?.yahoo ?? "").trim().toUpperCase();
  const rawTicker = String(raw?.ticker ?? raw?.symbol ?? "").trim().toUpperCase();
  const ticker = rawTicker || rawYahoo.replace(/\.(NS|BO)$/i, "");
  if (!TOKEN_RE.test(ticker)) return null;
  // NSE-only: a ".BO" id from an imported share file is re-pointed at the NSE
  // listing of the same ticker instead of being kept, so importing a list can
  // never pull BSE prices into the site.
  const yahoo = `${ticker}.NS`;
  const known = findSymbol(yahoo);
  return {
    ticker: known?.ticker ?? ticker,
    yahoo: known?.yahoo ?? yahoo,
    name: String(raw?.name ?? known?.name ?? `${ticker} (NSE)`),
    sector: String(raw?.sector ?? known?.sector ?? "Custom"),
  };
}

function parseSharedWatchlist(text: string): CustomList {
  const parsed = JSON.parse(text);
  const source = parsed?.type === "kch-watchlist" ? parsed.list : parsed?.list ?? parsed;
  if (!source || !Array.isArray(source.symbols)) throw new Error("This is not a valid watchlist share file");

  const seen = new Set<string>();
  const symbols: NseSymbol[] = [];
  const notes: Record<string, string> = {};
  for (const raw of source.symbols) {
    const sym = normalizeSharedSymbol(raw);
    if (!sym || seen.has(sym.yahoo)) continue;
    seen.add(sym.yahoo);
    symbols.push(sym);
    const inlineNote = typeof raw?.note === "string" ? raw.note : "";
    if (inlineNote) notes[sym.yahoo] = inlineNote;
  }

  const sourceNotes = source.notes && typeof source.notes === "object" ? source.notes : {};
  for (const [yahoo, note] of Object.entries(sourceNotes)) {
    const key = String(yahoo).toUpperCase();
    if (seen.has(key) && typeof note === "string") notes[key] = note;
  }

  if (symbols.length === 0) throw new Error("No valid symbols found in the shared watchlist");
  const color = typeof source.color === "string" && /^#[0-9a-f]{6}$/i.test(source.color)
    ? source.color
    : LIST_COLORS[Math.floor(Math.random() * LIST_COLORS.length)];
  return {
    id: makeId(),
    name: String(source.name ?? parsed?.name ?? "Shared Watchlist").trim().slice(0, 80) || "Shared Watchlist",
    color,
    symbols,
    notes,
  };
}

export function Watchlist({
  main,
  setMain,
  lists,
  setLists,
  selected,
  onSelect,
  lastListId,
  setLastListId,
  onActiveSymbolsChange,
  group: groupProp,
  onGroupChange,
}: Props) {
  const firstListId = lists[0]?.id ?? "main";
  const [groupInternal, setGroupInternal] = useState<GroupKey>(firstListId);

  const group = (groupProp && groupProp !== "main" ? groupProp : groupInternal);
  const setGroup = (g: GroupKey) => {
    if (onGroupChange) onGroupChange(g);
    else setGroupInternal(g);
  };

  const [addOpen, setAddOpen] = useState(false);
  const [mode, setMode] = useState<"search" | "bulk">("search");
  const [query, setQuery] = useState("");
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedSet, setSelectedSet] = useState<Set<string>>(new Set());
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const shareImportInputRef = useRef<HTMLInputElement | null>(null);
  const listScrollRef = useRef<HTMLDivElement | null>(null);
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);
  const [tabsOverflow, setTabsOverflow] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  const [jumpN, setJumpN] = useState("");

  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const update = () => {
      const canL = el.scrollLeft > 2;
      const canR = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setTabsOverflow((prev) => (prev.left === canL && prev.right === canR ? prev : { left: canL, right: canR }));
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", update); ro.disconnect(); };
  }, [lists.length]);

  const scrollTabs = (dir: -1 | 1) => {
    const el = tabsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(120, el.clientWidth * 0.6), behavior: "smooth" });
  };


  const jumpToIndex = (n: number) => {
    if (!Number.isFinite(n) || n < 1) return;
    const idx = Math.min(Math.max(1, Math.floor(n)), activeList.length) - 1;
    const sym = activeList[idx];
    if (!sym) return;
    const el = listScrollRef.current?.querySelector(
      `[data-symbol="${window.CSS.escape(sym.yahoo)}"]`,
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    onSelect(sym.yahoo);
  };
  const scrollToTop = () => listScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  // Per-scanning-list "viewed" tracking is owned by the parent (so it can
  // be synced to the cloud). We just consume it here.


  // Reset selection when group changes or selectMode turns off
  useEffect(() => { setSelectedSet(new Set()); }, [group]);
  useEffect(() => { if (!selectMode) setSelectedSet(new Set()); }, [selectMode]);

  // If active group is a deleted or missing list, fall back to first available list
  useEffect(() => {
    if (group === "main" || !lists.some((l) => l.id === group)) {
      if (lists.length > 0) setGroup(lists[0].id);
    }
  }, [lists, group]);


  const activeListRaw: NseSymbol[] = group === "main"
    ? main
    : (lists.find((l) => l.id === group)?.symbols ?? []);
  // A list must never contain the same symbol twice: duplicates make row
  // numbering, ↑/↓ navigation and "go to #n" disagree with each other (the
  // cursor jumps to a far-away copy). Keep the first occurrence only.
  const activeList: NseSymbol[] = useMemo(() => {
    const seen = new Set<string>();
    const out: NseSymbol[] = [];
    for (const s of activeListRaw) {
      const key = String(s.yahoo).toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
    return out.length === activeListRaw.length ? activeListRaw : out;
  }, [activeListRaw]);
  const activeListObjRaw = group === "main" ? null : lists.find((l) => l.id === group) ?? null;
  // Safety net: older saved state may have lost the `kind` flag. Treat a list
  // named "Scanning Process" as a scanning list so its UI never reverts.
  const activeListObj = activeListObjRaw
    ? (activeListObjRaw.kind !== "scanning" && activeListObjRaw.name === "Scanning Process"
        ? { ...activeListObjRaw, kind: "scanning" as const }
        : activeListObjRaw)
    : null;
  const activeNotes = activeListObj?.notes ?? {};
  const isScanning = activeListObj?.kind === "scanning";

  // Range select inputs (scanning list only)
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");

  // Notify parent of the currently visible symbols (for arrow-key navigation, etc.)
  useEffect(() => {
    onActiveSymbolsChange?.(activeList);
  }, [activeList, onActiveSymbolsChange]);

  // Auto-scroll the selected row into view (helpful while arrow-key navigating,
  // and also when jumping to a list from the chart header — re-runs on group change).
  useEffect(() => {
    if (!selected) return;
    // Defer one frame so the new group's rows have mounted before we query.
    const id = requestAnimationFrame(() => {
      const el = document.querySelector(`[data-symbol="${window.CSS.escape(selected)}"]`);
      el?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(id);
  }, [selected, group]);

  // Map yahoo -> set of list IDs the symbol belongs to
  const symbolLists = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of lists) {
      for (const s of l.symbols) {
        if (!map.has(s.yahoo)) map.set(s.yahoo, new Set());
        map.get(s.yahoo)!.add(l.id);
      }
    }
    return map;
  }, [lists]);

  // Map yahoo -> notes saved against this symbol across ALL lists, so other
  // lists' notes can be previewed inline on every row.
  const notesByYahoo = useMemo(() => {
    const map = new Map<string, Array<{ listId: string; name: string; color: string; note: string }>>();
    for (const l of lists) {
      for (const [yahoo, note] of Object.entries(l.notes ?? {})) {
        if (!note || !note.trim()) continue;
        if (!map.has(yahoo)) map.set(yahoo, []);
        map.get(yahoo)!.push({ listId: l.id, name: l.name, color: l.color, note });
      }
    }
    return map;
  }, [lists]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const activeYahoos = useMemo(() => new Set(activeList.map((s) => s.yahoo)), [activeList]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = NSE_SYMBOLS.filter((s) => !activeYahoos.has(s.yahoo));
    if (!q) return base.slice(0, 40);
    type Scored = { s: NseSymbol; score: number };
    const scored: Scored[] = [];
    for (const s of base) {
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
  }, [query, activeYahoos]);

  const customCandidate = useMemo(() => {
    const raw = query.trim().toUpperCase().replace(/\s+/g, "");
    if (!raw || !/^[A-Z0-9&-]{1,20}$/.test(raw)) return null;
    const yahoo = `${raw}.NS`;
    if (activeYahoos.has(yahoo)) return null;
    if (searchResults.some((s) => s.ticker.toUpperCase() === raw)) return null;
    return { ticker: raw, name: `${raw} (NSE)`, yahoo, sector: "Custom" } as NseSymbol;
  }, [query, activeYahoos, searchResults]);

  const bulkParsed = useMemo(() => parseTokens(bulkText), [bulkText]);
  const bulkNewCount = useMemo(
    () => bulkParsed.valid.filter((s) => !activeYahoos.has(s.yahoo)).length,
    [bulkParsed, activeYahoos],
  );
  const bulkAlreadyIn = bulkParsed.valid.length - bulkNewCount;

  // ---------- Add to active group ----------
  const addOneToActive = (s: NseSymbol) => {
    if (group === "main") {
      setMain((wl) => (wl.some((x) => x.yahoo === s.yahoo) ? wl : [...wl, s]));
    } else {
      setLists((arr) =>
        arr.map((l) =>
          l.id === group
            ? (l.symbols.some((x) => x.yahoo === s.yahoo)
                ? l
                : { ...l, symbols: [...l.symbols, s] })
            : l,
        ),
      );
    }
  };

  const addManyToActive = (items: NseSymbol[]) => {
    if (items.length === 0) return 0;
    let added = 0;
    if (group === "main") {
      setMain((wl) => {
        const have = new Set(wl.map((x) => x.yahoo));
        const fresh = items.filter((s) => !have.has(s.yahoo));
        added = fresh.length;
        return fresh.length === 0 ? wl : [...wl, ...fresh];
      });
    } else {
      setLists((arr) =>
        arr.map((l) => {
          if (l.id !== group) return l;
          const have = new Set(l.symbols.map((x) => x.yahoo));
          const fresh = items.filter((s) => !have.has(s.yahoo));
          added = fresh.length;
          return fresh.length === 0 ? l : { ...l, symbols: [...l.symbols, ...fresh] };
        }),
      );
    }
    return added;
  };

  const removeFromActive = (yahoo: string) => {
    if (group === "main") {
      setMain((wl) => wl.filter((s) => s.yahoo !== yahoo));
    } else {
      setLists((arr) =>
        arr.map((l) => {
          if (l.id !== group) return l;
          const { [yahoo]: _, ...rest } = l.notes;
          return { ...l, symbols: l.symbols.filter((s) => s.yahoo !== yahoo), notes: rest };
        }),
      );
    }
  };

  const removeManyFromActive = (yahoos: Set<string>) => {
    if (yahoos.size === 0) return;
    if (group === "main") {
      setMain((wl) => wl.filter((s) => !yahoos.has(s.yahoo)));
    } else {
      setLists((arr) =>
        arr.map((l) => {
          if (l.id !== group) return l;
          const notes = { ...l.notes };
          yahoos.forEach((y) => { delete notes[y]; });
          return { ...l, symbols: l.symbols.filter((s) => !yahoos.has(s.yahoo)), notes };
        }),
      );
    }
  };

  const clearActive = () => {
    if (group === "main") setMain(() => []);
    else setLists((arr) => arr.map((l) => (l.id === group ? { ...l, symbols: [], notes: {} } : l)));
  };

  const reorderActive = (next: NseSymbol[]) => {
    if (group === "main") setMain(() => next);
    else setLists((arr) => arr.map((l) => (l.id === group ? { ...l, symbols: next } : l)));
  };

  // ---------- List management ----------
  const createList = (name: string, color: string): string => {
    const id = makeId();
    setLists((arr) => [...arr, { id, name, color, symbols: [], notes: {} }]);
    return id;
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

  const setSymbolNote = (listId: string, yahoo: string, note: string) => {
    setLists((arr) =>
      arr.map((l) => {
        if (l.id !== listId) return l;
        const notes = { ...l.notes };
        if (note.trim()) notes[yahoo] = note.trim();
        else delete notes[yahoo];
        return { ...l, notes };
      }),
    );
  };

  const renameList = (listId: string, name: string) => {
    setLists((arr) => arr.map((l) => (l.id === listId ? { ...l, name } : l)));
  };
  const recolorList = (listId: string, color: string) => {
    setLists((arr) => arr.map((l) => (l.id === listId ? { ...l, color } : l)));
  };
  const deleteList = (listId: string) => {
    const target = lists.find((l) => l.id === listId);
    if (target?.protected) {
      toast.error(`"${target.name}" is a default list and cannot be deleted.`);
      return;
    }
    setLists((arr) => arr.filter((l) => l.id !== listId));
    if (lastListId === listId) setLastListId(null);
  };
  const togglePinList = (listId: string) => {
    setLists((arr) => arr.map((l) => (l.id === listId ? { ...l, pinned: !l.pinned } : l)));
  };
  const toggleProtectList = (listId: string) => {
    setLists((arr) => arr.map((l) => (l.id === listId ? { ...l, protected: !l.protected } : l)));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = activeList.findIndex((s) => s.yahoo === active.id);
    const newIdx = activeList.findIndex((s) => s.yahoo === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    reorderActive(arrayMove(activeList, oldIdx, newIdx));
  };

  const handleTabDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Reorder against the currently displayed (pinned-first) order so the
    // drop position matches what the user sees.
    const sorted = [...lists].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
    const oldIdx = sorted.findIndex((l) => l.id === active.id);
    const newIdx = sorted.findIndex((l) => l.id === over.id);
    if (oldIdx === -1 || newIdx === -1) return;
    const next = arrayMove(sorted, oldIdx, newIdx);
    setLists(() => next);
  };

  const handleBulkFile = async (file: File) => {
    const text = await file.text();
    setBulkText((cur) => (cur ? cur + "\n" + text : text));
  };

  const commitBulk = () => {
    if (bulkParsed.valid.length === 0) {
      toast.error("No valid symbols found");
      return;
    }
    const added = addManyToActive(bulkParsed.valid);
    toast.success(
      `Added ${added} symbol${added === 1 ? "" : "s"}${
        bulkAlreadyIn > 0 ? ` · ${bulkAlreadyIn} already present` : ""
      }${bulkParsed.invalid.length > 0 ? ` · ${bulkParsed.invalid.length} invalid skipped` : ""}`,
    );
    setBulkText("");
  };

  const handleCopy = async () => {
    if (activeList.length === 0) { toast.error("List is empty"); return; }
    const text = activeList.map((s) => s.ticker).join(",");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${activeList.length} ticker${activeList.length === 1 ? "" : "s"}`);
    } catch { toast.error("Clipboard unavailable"); }
  };

  const handleCopyNse = async () => {
    if (activeList.length === 0) { toast.error("List is empty"); return; }
    const text = activeList
      .map((s) => {
        const raw = (s.ticker || s.yahoo || "").replace(/\.(NS|BO)$/i, "");
        return `NSE:${raw}`;
      })
      .join(",");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${activeList.length} NSE ticker${activeList.length === 1 ? "" : "s"}`);
    } catch { toast.error("Clipboard unavailable"); }
  };



  const exportExcel = useServerFn(exportWatchlistExcel);

  const handleShareExport = () => {
    if (activeList.length === 0) { toast.error("List is empty"); return; }
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
    const timeStr = `${pad(d.getHours())}-${pad(d.getMinutes())}`;
    const listName = activeListObj?.name ?? "Main Watchlist";
    const noteFor = (yahoo: string): string => {
      if (activeListObj && typeof document !== "undefined" && window.CSS?.escape) {
        const draft = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          `[data-note-list-id="${window.CSS.escape(activeListObj.id)}"][data-note-yahoo="${window.CSS.escape(yahoo)}"]`,
        )?.value;
        if (draft != null && draft !== (activeNotes?.[yahoo] ?? "")) return draft;
      }
      return (activeNotes?.[yahoo] ?? "").toString();
    };
    const notes = Object.fromEntries(
      activeList
        .map((s) => [s.yahoo, noteFor(s.yahoo)] as const)
        .filter(([, note]) => note.trim().length > 0),
    );
    downloadJson(`${safeFilename(listName)}_share_${dateStr}_${timeStr}.json`, {
      type: "kch-watchlist",
      version: 1,
      exportedAt: d.toISOString(),
      list: {
        name: listName,
        color: activeListObj?.color ?? LIST_COLORS[0],
        symbols: activeList.map((s) => ({ ticker: s.ticker, yahoo: s.yahoo, name: s.name, sector: s.sector })),
        notes,
      },
    });
    toast.success(`Shared ${listName} (${activeList.length} symbol${activeList.length === 1 ? "" : "s"})`);
  };

  const handleShareImport = async (file: File) => {
    try {
      const imported = parseSharedWatchlist(await file.text());
      setLists((arr) => {
        const names = new Set(arr.map((l) => l.name.toLowerCase()));
        let name = imported.name;
        if (names.has(name.toLowerCase())) name = `${name} (shared)`;
        return [...arr, { ...imported, name }];
      });
      setGroup(imported.id);
      setLastListId(imported.id);
      toast.success(`Imported ${imported.name} with ${imported.symbols.length} symbol${imported.symbols.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not import watchlist");
    }
  };

  const handleExport = async () => {
    if (activeList.length === 0) { toast.error("List is empty"); return; }
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const dateStr = `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
    const timeStr = `${pad(d.getHours())}-${pad(d.getMinutes())}`;
    const listName = activeListObj?.name ?? "Main";
    const safeFile = listName.replace(/[\\/:*?"<>|]/g, "-");

    // Resolve notes — prefer the active list's notes; fall back to any note
    // saved against the same symbol in another list (notesByYahoo).
    const noteFor = (yahoo: string): string => {
      if (activeListObj && typeof document !== "undefined" && window.CSS?.escape) {
        const draft = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
          `[data-note-list-id="${window.CSS.escape(activeListObj.id)}"][data-note-yahoo="${window.CSS.escape(yahoo)}"]`,
        )?.value.trim();
        if (draft) return draft;
      }
      const own = (activeNotes?.[yahoo] ?? "").toString().trim();
      if (own) return own;
      const others = notesByYahoo.get(yahoo) ?? [];
      const first = others.find((n) => (n.note ?? "").trim().length > 0);
      return (first?.note ?? "").toString();
    };

    toast.message("Preparing Excel export…");
    try {
      const result = await exportExcel({
        data: {
          listName,
          symbols: activeList.map((s) => ({ ticker: s.ticker, yahoo: s.yahoo, notes: noteFor(s.yahoo) })),
        },
      });
      const xlsxModule = await import("xlsx-js-style");
      const XLSX = (xlsxModule as any).default ?? xlsxModule;
      const header = ["Symbol", "Notes", "Closing Price", "% Day Change", "Price * Volume (Cr)", "Volume", "Above 10d Avg Vol"];
      const ws = XLSX.utils.json_to_sheet(result.rows, { header });
      ws["!cols"] = [{ wch: 14 }, { wch: 50 }, { wch: 14 }, { wch: 14 }, { wch: 20 }, { wch: 14 }, { wch: 18 }];
      const headerStyle = { font: { bold: true }, alignment: { horizontal: "center" } };
      const green = { fgColor: { rgb: "C6EFCE" } };
      const red = { fgColor: { rgb: "FFC7CE" } };
      const greenFont = { color: { rgb: "006100" } };
      const redFont = { color: { rgb: "9C0006" } };
      header.forEach((_, c) => { const addr = XLSX.utils.encode_cell({ r: 0, c }); if (ws[addr]) ws[addr].s = headerStyle; });
      result.rows.forEach((row, i) => {
        const r = i + 1;
        const pct = row["% Day Change"];
        if (typeof pct === "number") {
          const addr = XLSX.utils.encode_cell({ r, c: 3 });
          if (ws[addr] && pct >= 3) ws[addr].s = { fill: green, font: greenFont, numFmt: "0.00" };
          else if (ws[addr] && pct <= -3) ws[addr].s = { fill: red, font: redFont, numFmt: "0.00" };
        }
        const turnover = row["Price * Volume (Cr)"];
        if (typeof turnover === "number" && turnover > 5) {
          const addr = XLSX.utils.encode_cell({ r, c: 4 });
          if (ws[addr]) ws[addr].s = { fill: green, font: greenFont, numFmt: "0.00" };
        }
        const aboveAvg = row["Above 10d Avg Vol"];
        if (aboveAvg === "Yes" || aboveAvg === "No") {
          const addr = XLSX.utils.encode_cell({ r, c: 6 });
          if (ws[addr]) ws[addr].s = aboveAvg === "Yes" ? { fill: green, font: greenFont } : { fill: red, font: redFont };
        }
      });
      const wb = XLSX.utils.book_new();
      const sheetName = listName.replace(/[:\\/?*\[\]]/g, "-").slice(0, 31) || "List";
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const bytes = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
      const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeFile}_${dateStr}_${timeStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      if (result.missingCount > 0) {
        toast.warning(`Exported ${listName}, but ${result.missingCount} symbol${result.missingCount === 1 ? "" : "s"} had unavailable market data`);
      } else {
        toast.success(`Exported ${listName} (${result.rowCount} symbol${result.rowCount === 1 ? "" : "s"})`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Excel export failed — please try again");
    }
  };


  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-card/40">
      {/* Group tabs */}
      <div className="relative flex shrink-0 items-center border-b border-border pt-2">
        {lists.length > 0 && tabsOverflow.left && (
          <button
            type="button"
            onClick={() => scrollTabs(-1)}
            className="absolute left-0 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-border bg-card/95 text-muted-foreground shadow-sm hover:text-foreground"
            aria-label="Scroll tabs left"
            title="Scroll tabs left"
          >
            <ChevronLeft className="h-3 w-3" />
          </button>
        )}
        <div
          ref={tabsScrollRef}
          className="flex flex-1 items-center gap-1 overflow-x-auto no-scrollbar px-2"
          style={{
            paddingLeft: lists.length > 0 && tabsOverflow.left ? 20 : undefined,
            paddingRight: lists.length > 0 && tabsOverflow.right ? 20 : undefined,
          }}
        >
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleTabDragEnd}>
            <SortableContext
              items={[...lists].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)).map((l) => l.id)}
              strategy={horizontalListSortingStrategy}
            >
              {[...lists].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)).map((l) => (
                <ListTab
                  key={l.id}
                  list={l}
                  active={group === l.id}
                  editing={editingListId === l.id}
                  onSelect={() => setGroup(l.id)}
                  onStartEdit={() => setEditingListId(l.id)}
                  onFinishEdit={() => setEditingListId(null)}
                  onRename={(n) => renameList(l.id, n)}
                  onRecolor={(c) => recolorList(l.id, c)}
                  onDelete={() => deleteList(l.id)}
                  onTogglePin={() => togglePinList(l.id)}
                  onToggleProtect={() => toggleProtectList(l.id)}
                />
              ))}
            </SortableContext>
          </DndContext>
          <NewListButton onCreate={(name, color) => { const id = createList(name, color); setGroup(id); }} />
          <button
            onClick={() => {
              const existing = lists.find((l) => l.kind === "scanning");
              if (existing) {
                if (existing.kind !== "scanning") {
                  setLists((arr) => arr.map((l) => (l.id === existing.id ? { ...l, kind: "scanning" } : l)));
                }
                setGroup(existing.id);
                return;
              }
              const id = makeId();
              setLists((arr) => [...arr, { id, name: "Scanning Process", color: "#f59e0b", symbols: [], notes: {}, kind: "scanning" }]);
              setGroup(id);
            }}
            className="ml-1 flex shrink-0 items-center gap-1 rounded-t-md px-2 py-1 text-[11px] font-medium text-amber-400 hover:bg-amber-400/10"
            title="Open the Scanning Process list (inline notes + 1-click add to other lists)"
          >
            <Plus className="h-3 w-3" /> Scan
          </button>
        </div>
        {lists.length > 0 && tabsOverflow.right && (
          <button
            type="button"
            onClick={() => scrollTabs(1)}
            className="absolute right-0 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-l-md border border-r-0 border-border bg-card/95 text-muted-foreground shadow-sm hover:text-foreground"
            aria-label="Scroll tabs right"
            title="Scroll tabs right"
          >
            <ChevronRight className="h-3 w-3" />
          </button>
        )}
      </div>


      {/* Active list color band */}
      {activeListObj && (
        <div className="h-1 shrink-0" style={{ background: activeListObj.color }} />
      )}

      {lists.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center text-xs text-muted-foreground">
          <p>No watchlists yet.</p>
          <p className="text-[10px]">
            Create a list above, then press <kbd className="rounded border border-border bg-muted px-1">⌘K</kbd> to search and add symbols.
          </p>
        </div>
      ) : (
        <>

      {/* Toolbar — two rows so nothing gets clipped in the narrow sidebar */}
      <div className="flex shrink-0 flex-col gap-1 border-b border-border px-2 py-1.5">
        {/* Row 1: status + jump + primary action */}
        <div className="flex items-center justify-between gap-1">
          {selectMode ? (
            <p className="truncate text-[10px] text-muted-foreground">
              {selectedSet.size} of {activeList.length} selected
            </p>
          ) : (
            <p className="shrink-0 truncate text-[10px] text-muted-foreground">
              {activeList.length}{" · ↑/↓"}
            </p>
          )}
          {!selectMode && activeList.length > 5 && (
            <div className="flex min-w-0 flex-1 items-center justify-end gap-0.5" title="Jump to row number">
              <button
                onClick={scrollToTop}
                className="rounded px-1 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Scroll to top"
              >
                ↑
              </button>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={jumpN}
                onChange={(e) => setJumpN(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const n = parseInt(jumpN, 10);
                    if (Number.isFinite(n)) { jumpToIndex(n); setJumpN(""); }
                  }
                }}
                placeholder={`Go 1-${activeList.length}`}
                className="h-5 w-16 min-w-0 rounded border border-border/60 bg-transparent px-1 text-[10px] tabular-nums outline-none focus:bg-muted"
              />
            </div>
          )}
          {selectMode ? (
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  const all = new Set(activeList.map((s) => s.yahoo));
                  setSelectedSet((cur) => (cur.size === all.size ? new Set() : all));
                }}
                className="rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {selectedSet.size === activeList.length && activeList.length > 0 ? "None" : "All"}
              </button>
              <button
                disabled={selectedSet.size === 0}
                onClick={() => setConfirmRemoveOpen(true)}
                className="flex items-center gap-1 rounded-md bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Remove {selectedSet.size || ""}
              </button>
              <button
                onClick={() => setSelectMode(false)}
                className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddOpen((v) => !v)}
              className="shrink-0 flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium text-foreground hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" />
              {addOpen ? "Done" : "Add"}
            </button>
          )}
        </div>

        {/* Row 2: action icons — only when not in select mode */}
        {!selectMode && (
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div className="flex min-w-0 flex-wrap items-center gap-0.5">

              <button onClick={handleCopy} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" title="Copy tickers to clipboard">
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button onClick={handleCopyNse} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" title='Copy with "NSE:" prefix (e.g. NSE:INFY,NSE:DCW)'>
                <Copy className="h-3.5 w-3.5" /> NSE:
              </button>



              <button onClick={handleExport} disabled={activeList.length === 0} className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" title="Download current watchlist to Excel (.xlsx)">
                <Download className="h-3.5 w-3.5" />
              </button>
              <button onClick={handleShareExport} disabled={activeList.length === 0} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40" title="Share watchlist as a JSON file (includes notes)">
                <Share2 className="h-3.5 w-3.5" /> Share
              </button>
              <button onClick={() => shareImportInputRef.current?.click()} className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground" title="Import a shared watchlist JSON (keeps notes)">
                <Upload className="h-3.5 w-3.5" /> Import
              </button>
              <input
                ref={shareImportInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleShareImport(file);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => { if (activeList.length > 0) setSelectMode(true); }}
                disabled={activeList.length === 0}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                title="Select symbols to remove"
              >
                <CheckSquare className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => { if (activeList.length > 0) setConfirmClearOpen(true); }}
                disabled={activeList.length === 0}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive disabled:opacity-40"
                title="Clear all"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>




            {isScanning && activeList.length > 0 && (
              <div className="flex items-center gap-1">
                <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-card px-1 py-0.5" title="Select rows by number">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={rangeFrom}
                    onChange={(e) => setRangeFrom(e.target.value.replace(/\D/g, ""))}
                    placeholder="1"
                    className="h-5 w-8 rounded bg-transparent px-1 text-[10px] tabular-nums outline-none focus:bg-muted"
                  />
                  <span className="text-[10px] text-muted-foreground">–</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={rangeTo}
                    onChange={(e) => setRangeTo(e.target.value.replace(/\D/g, ""))}
                    placeholder={String(activeList.length)}
                    className="h-5 w-8 rounded bg-transparent px-1 text-[10px] tabular-nums outline-none focus:bg-muted"
                  />
                  <button
                    onClick={() => {
                      const n = activeList.length;
                      const f = Math.max(1, Math.min(n, parseInt(rangeFrom || "1", 10) || 1));
                      const t = Math.max(1, Math.min(n, parseInt(rangeTo || String(n), 10) || n));
                      const [lo, hi] = f <= t ? [f, t] : [t, f];
                      const picks = new Set(activeList.slice(lo - 1, hi).map((x) => x.yahoo));
                      setSelectMode(true);
                      setSelectedSet(picks);
                    }}
                    className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/25"
                    title="Select rows in this range"
                  >
                    Pick
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>



      {/* Clear all confirmation */}
      <Dialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Clear {activeListObj?.name}?
            </DialogTitle>
            <DialogDescription>
              This removes all {activeList.length} symbol{activeList.length === 1 ? "" : "s"} from this list. The list itself is kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmClearOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                const n = activeList.length;
                clearActive();
                setConfirmClearOpen(false);
                toast.success(`Cleared ${n} symbol${n === 1 ? "" : "s"}`);
              }}
            >
              Clear all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove selected confirmation */}
      <Dialog open={confirmRemoveOpen} onOpenChange={setConfirmRemoveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              Remove {selectedSet.size} symbol{selectedSet.size === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              Removes the selected symbols from {activeListObj?.name}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmRemoveOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                const n = selectedSet.size;
                removeManyFromActive(selectedSet);
                setConfirmRemoveOpen(false);
                setSelectMode(false);
                toast.success(`Removed ${n} symbol${n === 1 ? "" : "s"}`);
              }}
            >
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {addOpen && (
        <div className="shrink-0 border-b border-border bg-background/50 p-2">
          <div className="mb-2 flex items-center gap-1 text-[11px]">
            <button
              onClick={() => setMode("search")}
              className={`rounded px-2 py-0.5 ${mode === "search" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >Search</button>
            <button
              onClick={() => setMode("bulk")}
              className={`rounded px-2 py-0.5 ${mode === "bulk" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >Bulk / CSV</button>
            <span className="ml-auto truncate text-[10px] text-muted-foreground">
              → {activeListObj?.name}
            </span>
          </div>

          {mode === "search" ? (
            <>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  autoFocus
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setSuggestOpen(true); }}
                  onFocus={() => setSuggestOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { setSuggestOpen(false); }
                    else if (e.key === "Enter") {
                      const pick = customCandidate ?? searchResults[0];
                      if (pick) { addOneToActive(pick); setQuery(""); setSuggestOpen(false); }
                    }
                  }}
                  placeholder="Search NSE symbols…"
                  className="h-8 pl-8 pr-7 text-xs"
                />
                {query && (
                  <button onClick={() => { setQuery(""); setSuggestOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {suggestOpen && (
                <div className="mt-2 max-h-72 overflow-y-auto no-scrollbar rounded-md border border-border bg-card">
                  {customCandidate && (
                    <button
                      onClick={() => { addOneToActive(customCandidate); setQuery(""); setSuggestOpen(false); }}
                      className="flex w-full items-center justify-between gap-2 border-b border-border bg-primary/5 px-3 py-1.5 text-left text-xs hover:bg-primary/10"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{customCandidate.ticker}</div>
                        <div className="truncate text-[10px] text-muted-foreground">Add as NSE symbol ({customCandidate.yahoo})</div>
                      </div>
                      <Plus className="h-3.5 w-3.5 text-primary" />
                    </button>
                  )}
                  {searchResults.length === 0 && !customCandidate && (
                    <div className="p-3 text-center text-xs text-muted-foreground">{query ? "No matches" : "All available symbols added"}</div>
                  )}
                  {searchResults.map((s) => (
                    <button
                      key={s.yahoo}
                      onClick={() => { addOneToActive(s); setQuery(""); setSuggestOpen(false); }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{s.ticker}</div>
                        <div className="truncate text-[10px] text-muted-foreground">{s.name}</div>
                      </div>
                      {s.sector && (
                        <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{s.sector}</span>
                      )}
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                placeholder={"Paste NSE tickers (comma, space, or newline separated)\ne.g. RELIANCE, TCS, INFY, HDFCBANK"}
                className="h-32 w-full resize-y rounded-md border border-input bg-transparent p-2 text-xs font-mono shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <input
                ref={fileInputRef} type="file" accept=".csv,.txt" className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleBulkFile(f);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
              />
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                <span>
                  {bulkNewCount} new
                  {bulkAlreadyIn > 0 ? ` · ${bulkAlreadyIn} already in list` : ""}
                  {bulkParsed.invalid.length > 0 ? ` · ${bulkParsed.invalid.length} invalid` : ""}
                </span>
                <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-muted hover:text-foreground" title="Load CSV file">
                  <Upload className="h-3 w-3" /> File
                </button>
              </div>
              {bulkParsed.invalid.length > 0 && (
                <div className="mt-1 max-h-12 overflow-y-auto no-scrollbar text-[10px] text-destructive">
                  Invalid: {bulkParsed.invalid.slice(0, 10).join(", ")}{bulkParsed.invalid.length > 10 ? "…" : ""}
                </div>
              )}
              <div className="mt-2 flex items-center gap-1.5">
                <button onClick={commitBulk} disabled={bulkNewCount === 0} className="flex-1 rounded-md bg-primary px-2 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40">
                  Add {bulkNewCount} symbol{bulkNewCount === 1 ? "" : "s"}
                </button>
                {bulkText && (
                  <button onClick={() => setBulkText("")} className="rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">Clear</button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <div ref={listScrollRef} className="flex-1 overflow-y-auto py-1">

        {activeList.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Click <span className="font-semibold">Add</span> to fill this list,
            or click <Star className="inline h-3 w-3" /> on any row to put it here.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={activeList.map((s) => s.yahoo)} strategy={verticalListSortingStrategy}>
              {activeList.map((s, idx) => (
                activeListObj?.kind === "scanning" ? (
                  <ScanRow
                    key={s.yahoo}
                    s={s}
                    index={idx + 1}
                    active={s.yahoo === selected}
                    note={activeNotes[s.yahoo]}
                    inLists={symbolLists.get(s.yahoo) ?? new Set()}
                    lists={lists}
                    currentListId={activeListObj.id}
                    selectMode={selectMode}
                    isSelected={selectedSet.has(s.yahoo)}
                    onToggleSelected={() => {
                      setSelectedSet((cur) => {
                        const next = new Set(cur);
                        if (next.has(s.yahoo)) next.delete(s.yahoo);
                        else next.add(s.yahoo);
                        return next;
                      });
                    }}
                    onClick={() => onSelect(s.yahoo)}
                    onRemove={() => removeFromActive(s.yahoo)}
                    onToggleListMembership={(listId) => {
                      const targetList = lists.find((l) => l.id === listId);
                      const willAdd = !targetList?.symbols.some((x) => x.yahoo === s.yahoo);
                      toggleSymbolInList(listId, s);
                      // Carry the scan note over to the target list when adding.
                      const scanNote = activeNotes[s.yahoo];
                      if (willAdd && scanNote && scanNote.trim()) {
                        setSymbolNote(listId, s.yahoo, scanNote);
                      }
                      // Keep Scanning Process as the active navigation context.
                      // Adding to another list must not retarget arrows/cursor.
                    }}
                    onSetScanNote={(note) => setSymbolNote(activeListObj.id, s.yahoo, note)}
                  />
                ) : (
                  <SortableRow
                    key={s.yahoo}
                    s={s}
                    index={idx + 1}
                    active={s.yahoo === selected}
                    note={activeNotes[s.yahoo]}
                    otherNotes={(notesByYahoo.get(s.yahoo) ?? []).filter((n) => n.listId !== activeListObj?.id)}
                    inLists={symbolLists.get(s.yahoo) ?? new Set()}
                    lists={lists}
                    lastListId={lastListId}
                    selectMode={selectMode}
                    isSelected={selectedSet.has(s.yahoo)}
                    onToggleSelected={() => {
                      setSelectedSet((cur) => {
                        const next = new Set(cur);
                        if (next.has(s.yahoo)) next.delete(s.yahoo);
                        else next.add(s.yahoo);
                        return next;
                      });
                    }}
                    onClick={() => onSelect(s.yahoo)}
                    onRemove={() => removeFromActive(s.yahoo)}
                    onToggleListMembership={(listId) => {
                      toggleSymbolInList(listId, s);
                      setLastListId(listId);
                    }}
                    onSetNote={(listId, note) => setSymbolNote(listId, s.yahoo, note)}
                    onCreateList={(name, color) => {
                      const id = createList(name, color);
                      toggleSymbolInList(id, s);
                      setLastListId(id);
                      return id;
                    }}
                    onQuickStar={() => {
                      if (lastListId && lists.some((l) => l.id === lastListId)) {
                        toggleSymbolInList(lastListId, s);
                        const list = lists.find((l) => l.id === lastListId)!;
                        const had = list.symbols.some((x) => x.yahoo === s.yahoo);
                        toast.success(had ? `Removed from ${list.name}` : `Added to ${list.name}`);
                      }
                    }}
                  />
                )
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
        </>
      )}

    </div>
  );
}

// ---------------- List tab ----------------
function ListTab({
  list, active, editing, onSelect, onStartEdit, onFinishEdit, onRename, onRecolor, onDelete, onTogglePin, onToggleProtect,
}: {
  list: CustomList;
  active: boolean;
  editing: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onFinishEdit: () => void;
  onRename: (n: string) => void;
  onRecolor: (c: string) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleProtect: () => void;
}) {
  const [name, setName] = useState(list.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const confirmDeleteRef = useRef(false);
  useEffect(() => { confirmDeleteRef.current = confirmDelete; }, [confirmDelete]);
  useEffect(() => { setName(list.name); }, [list.name, editing]);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    disabled: editing,
  });
  const dragStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  return (
    <>
      {editing ? (
        <div className="flex shrink-0 items-center gap-1 rounded-t-md bg-card px-1.5 py-0.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: list.color }} />
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (confirmDeleteRef.current) return;
              if (name.trim()) onRename(name.trim());
              onFinishEdit();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { if (name.trim()) onRename(name.trim()); onFinishEdit(); }
              if (e.key === "Escape") { setName(list.name); onFinishEdit(); }
            }}
            className="h-5 w-28 rounded border border-border bg-transparent px-1 text-xs"
          />
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); if (name.trim()) onRename(name.trim()); onFinishEdit(); }}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Done editing"
            title="Done"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <div
          ref={setNodeRef}
          style={dragStyle}
          {...attributes}
          className="group/tab relative flex shrink-0 items-center"
          title="Drag to reorder"
        >
          <div
            className={`flex items-center rounded-t-md transition-colors ${
              active ? "bg-card text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            <button
              {...listeners}
              className="flex h-6 w-2.5 shrink-0 cursor-grab items-center justify-center text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
              aria-label="Drag list"
              title="Drag to reorder"
            >
              <GripVertical className="h-2.5 w-2.5" />
            </button>
            <button
              onClick={() => { onSelect(); }}
              className="flex items-center gap-1.5 py-1 pl-0.5 pr-2.5 text-xs font-medium"
            >
              <span className="h-2 w-2 rounded-full" style={{ background: list.color }} />
              {list.name}
              {list.pinned && <Pin className="h-2.5 w-2.5 fill-current text-amber-400" />}
              {list.protected && <Lock className="h-2.5 w-2.5 text-amber-400/80" />}
              <span className="text-muted-foreground">{list.symbols.length}</span>
            </button>
          </div>


          <div className="absolute -right-0.5 -top-0.5 flex gap-0.5 opacity-100 2xl:opacity-0 2xl:group-hover/tab:opacity-100 2xl:focus-within:opacity-100">
            <button
              onClick={(e) => { e.stopPropagation(); onStartEdit(); }}
              className="hidden rounded bg-card p-0.5 text-muted-foreground hover:text-foreground 2xl:block"
              title="Rename"
              aria-label="Rename list"
            >
              <Pencil className="h-2.5 w-2.5" />
            </button>
            <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
              <PopoverAnchor asChild>
                <span className="absolute inset-0 pointer-events-none" />
              </PopoverAnchor>
              <PopoverTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="rounded bg-card p-1 text-muted-foreground hover:text-foreground 2xl:p-0.5"
                  title="List actions"
                  aria-label="List actions"
                >
                  <MoreVertical className="h-3.5 w-3.5 2xl:h-2.5 2xl:w-2.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-56 p-2"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="px-1 pb-1 text-[11px] font-medium text-muted-foreground">Color</div>
                <div className="flex flex-wrap items-center gap-1 px-1 pb-2">
                  {LIST_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => onRecolor(c)}
                      className={`h-4 w-4 rounded-full ${c === list.color ? "ring-2 ring-foreground" : ""}`}
                      style={{ background: c }}
                      title={c}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={onTogglePin}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent"
                >
                  {list.pinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                  {list.pinned ? "Unpin list" : "Pin list"}
                </button>
                <button
                  type="button"
                  onClick={onToggleProtect}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent"
                >
                  {list.protected ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                  {list.protected ? "Unlock (allow delete)" : "Lock (prevent delete)"}
                </button>
                <button
                  type="button"
                  onClick={onStartEdit}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs hover:bg-accent"
                >
                  <Pencil className="h-3 w-3" />
                  Rename
                </button>
                <div className="my-1 border-t border-border" />
                <button
                  type="button"
                  disabled={!!list.protected}
                  onClick={() => { if (!list.protected) setConfirmDelete(true); }}
                  className="flex w-full items-center gap-2 rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/15 disabled:cursor-not-allowed disabled:opacity-50"
                  title={list.protected ? "Unlock first to delete" : "Delete list"}
                >
                  <Trash2 className="h-3 w-3" />
                  Delete list
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      )}


      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete list "{list.name}"?</DialogTitle>
            <DialogDescription>
              This list contains {list.symbols.length} symbol{list.symbols.length === 1 ? "" : "s"}. Deleting it cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { setConfirmDelete(false); onDelete(); onFinishEdit(); }}
            >
              Delete list
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function NewListButton({ onCreate }: { onCreate: (name: string, color: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState(LIST_COLORS[0]);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) { setName(""); setColor(LIST_COLORS[Math.floor(Math.random() * LIST_COLORS.length)]); } }}>
      <PopoverTrigger asChild>
        <button
          className="shrink-0 rounded-t-md px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground"
          title="New list"
          aria-label="New list"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-60" align="start">
        <div className="space-y-2">
          <div className="text-xs font-semibold">New list</div>
          <Input
            autoFocus
            placeholder="List name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && name.trim()) { onCreate(name.trim(), color); setOpen(false); }
            }}
            className="h-7 text-xs"
          />
          <div className="flex flex-wrap items-center gap-1">
            {LIST_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-4 w-4 rounded-full ${c === color ? "ring-2 ring-foreground" : ""}`}
                style={{ background: c }}
                title={c}
              />
            ))}
          </div>
          <button
            onClick={() => { if (name.trim()) { onCreate(name.trim(), color); setOpen(false); } }}
            disabled={!name.trim()}
            className="w-full rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ---------------- Row ----------------
function SortableRow({
  s, index, active, note, otherNotes, inLists, lists, lastListId,
  selectMode, isSelected, onToggleSelected,
  onClick, onRemove, onToggleListMembership, onSetNote, onCreateList, onQuickStar,
}: {
  s: NseSymbol;
  index: number;
  active: boolean;
  note?: string;
  otherNotes?: Array<{ listId: string; name: string; color: string; note: string }>;
  inLists: Set<string>;
  lists: CustomList[];
  lastListId: string | null;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelected: () => void;
  onClick: () => void;
  onRemove: () => void;
  onToggleListMembership: (listId: string) => void;
  onSetNote: (listId: string, note: string) => void;
  onCreateList: (name: string, color: string) => string;
  onQuickStar: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.yahoo, disabled: selectMode });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  const [popOpen, setPopOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(LIST_COLORS[0]);
  const starred = inLists.size > 0;

  // Decide what star click does: quick-toggle if a last list exists and no popover opened.
  const handleStarClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // If shift-click or no lastList → open popover
    if (e.shiftKey || !lastListId || !lists.some((l) => l.id === lastListId)) {
      setPopOpen(true);
      return;
    }
    onQuickStar();
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-symbol={s.yahoo}
      className={`group flex items-center gap-1 px-1 py-0.5 ${selectMode && isSelected ? "bg-destructive/10" : ""}`}
    >
      {selectMode ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelected(); }}
          className="flex h-7 w-5 shrink-0 items-center justify-center"
          aria-label="Select row"
        >
          <input
            type="checkbox"
            checked={isSelected}
            readOnly
            className="h-3.5 w-3.5 cursor-pointer accent-destructive"
          />
        </button>
      ) : (
        <button
          {...attributes}
          {...listeners}
          className="flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/70 opacity-100 transition-opacity active:cursor-grabbing 2xl:h-7 2xl:w-5 2xl:text-muted-foreground/40 2xl:opacity-0 2xl:group-hover:opacity-100"
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}

      <button
        onClick={selectMode ? onToggleSelected : onClick}
        className={`flex min-w-0 flex-1 items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition-colors ${
          active ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-muted/60"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`shrink-0 w-6 text-right font-mono text-[10px] tabular-nums ${active ? "text-primary-foreground/70" : "text-muted-foreground/60"}`} title={`Row ${index}`}>{index}</span>
            <span className="truncate text-sm font-medium">{s.ticker}</span>
            {s.isIndex && (
              <span className={`shrink-0 rounded px-1 text-[9px] font-semibold uppercase tracking-wider ${active ? "bg-primary-foreground/20 text-primary-foreground" : "bg-muted text-muted-foreground"}`}>IDX</span>
            )}
            {/* List membership dots */}
            {inLists.size > 0 && (
              <span className="flex shrink-0 items-center gap-0.5">
                {lists.filter((l) => inLists.has(l.id)).slice(0, 4).map((l) => (
                  <span key={l.id} className="h-1.5 w-1.5 rounded-full" style={{ background: l.color }} title={l.name} />
                ))}
              </span>
            )}
          </div>
          <div className={`truncate text-[11px] ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
            {s.name}
          </div>
          {note && (
            <div className={`truncate text-[10px] italic ${active ? "text-primary-foreground/70" : "text-muted-foreground/80"}`}>
              {note}
            </div>
          )}
          {otherNotes && otherNotes.length > 0 && (
            <div className="mt-0.5 space-y-0.5">
              {otherNotes.map((n) => (
                <div
                  key={n.listId}
                  className={`flex items-start gap-1 truncate text-[9px] leading-tight ${active ? "text-primary-foreground/60" : "text-muted-foreground/70"}`}
                  title={`${n.name}: ${n.note}`}
                >
                  <span className="mt-[3px] inline-block h-1 w-1 shrink-0 rounded-full" style={{ background: n.color }} />
                  <span className="truncate italic">{n.note}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </button>

      {!selectMode && (
        <AlertBellButton ticker={s.ticker} note={note} className="h-7 w-6" />
      )}

      <Popover open={popOpen} onOpenChange={setPopOpen}>
        <PopoverTrigger asChild>
          <button
            onClick={handleStarClick}
            onContextMenu={(e) => { e.preventDefault(); setPopOpen(true); }}
            className={`flex h-7 w-6 shrink-0 items-center justify-center rounded transition-opacity hover:bg-muted ${
              selectMode ? "hidden" : starred ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            }`}
            aria-label="Add to list"
            title={lastListId ? "Click: add/remove from last list · Shift-click: choose list" : "Choose list"}
          >
            <Star className={`h-3.5 w-3.5 ${starred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/60"}`} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="end">
          <div className="space-y-2">
            <div className="text-xs font-semibold">Add {s.ticker} to lists</div>
            {lists.length === 0 && (
              <div className="text-[11px] text-muted-foreground">No lists yet. Create one below.</div>
            )}
            <div className="max-h-48 space-y-1 overflow-y-auto no-scrollbar">
              {lists.map((l) => {
                const checked = inLists.has(l.id);
                return (
                  <div key={l.id} className="rounded border border-border/60 p-1.5">
                    <label className="flex cursor-pointer items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggleListMembership(l.id)}
                      />
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: l.color }} />
                      <span className="flex-1 truncate">{l.name}</span>
                    </label>
                    {checked && (
                      <input
                        type="text"
                        placeholder="Note (optional)"
                        data-note-list-id={l.id}
                        data-note-yahoo={s.yahoo}
                        defaultValue={l.notes[s.yahoo] ?? ""}
                        onBlur={(e) => onSetNote(l.id, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        }}
                        className="mt-1 h-6 w-full rounded border border-border bg-transparent px-1.5 text-[11px]"
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border pt-2">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">New list</div>
              <div className="flex items-center gap-1">
                <Input
                  placeholder="Name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newName.trim()) {
                      onCreateList(newName.trim(), newColor);
                      setNewName("");
                    }
                  }}
                  className="h-6 flex-1 text-xs"
                />
                <button
                  onClick={() => { if (newName.trim()) { onCreateList(newName.trim(), newColor); setNewName(""); } }}
                  disabled={!newName.trim()}
                  className="rounded bg-primary px-2 py-1 text-[11px] text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                >
                  Add
                </button>
              </div>
              <div className="mt-1 flex items-center gap-1">
                {LIST_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setNewColor(c)}
                    className={`h-3 w-3 rounded-full ${c === newColor ? "ring-1 ring-foreground" : ""}`}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      <button
        onClick={onRemove}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground/70 opacity-100 transition-opacity hover:bg-destructive/20 hover:text-destructive 2xl:h-7 2xl:w-6 2xl:text-muted-foreground/40 2xl:opacity-0 2xl:group-hover:opacity-100"
        aria-label="Remove"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// ---------------- Scan Row (enhanced for Scanning Process lists) ----------------
function ScanRow({
  s, index, active, note, inLists, lists, currentListId,
  selectMode, isSelected, onToggleSelected,
  onClick, onRemove, onToggleListMembership, onSetScanNote,
}: {
  s: NseSymbol;
  index: number;
  active: boolean;
  note?: string;
  inLists: Set<string>;
  lists: CustomList[];
  currentListId: string;
  selectMode: boolean;
  isSelected: boolean;
  onToggleSelected: () => void;
  onClick: () => void;
  onRemove: () => void;
  onToggleListMembership: (listId: string) => void;
  onSetScanNote: (note: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: s.yahoo, disabled: selectMode });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const [noteDraft, setNoteDraft] = useState(note ?? "");
  useEffect(() => { setNoteDraft(note ?? ""); }, [note]);

  const otherLists = lists.filter((l) => l.id !== currentListId && l.kind !== "scanning");

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-symbol={s.yahoo}
      className={`group relative mb-1 flex flex-col gap-1.5 rounded-md border px-2 py-1.5 pl-2.5 transition-all ${
        active ? "border-primary/50 bg-primary/5" : "border-border/60 bg-card/40"
      } ${selectMode && isSelected ? "border-destructive bg-destructive/10" : ""}`}
    >
      <div className="flex items-center gap-1">
        {selectMode ? (
          <button
            onClick={(e) => { e.stopPropagation(); onToggleSelected(); }}
            className="flex h-6 w-5 shrink-0 items-center justify-center"
            aria-label="Select row"
          >
            <input type="checkbox" checked={isSelected} readOnly className="h-3.5 w-3.5 cursor-pointer accent-destructive" />
          </button>
        ) : (
          <button
            {...attributes}
            {...listeners}
            className="flex h-8 w-7 shrink-0 cursor-grab touch-none items-center justify-center text-muted-foreground/70 opacity-100 transition-opacity active:cursor-grabbing 2xl:h-6 2xl:w-4 2xl:text-muted-foreground/40 2xl:opacity-0 2xl:group-hover:opacity-100"
            aria-label="Drag to reorder"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        <span
          className="shrink-0 w-6 text-right font-mono text-[10px] tabular-nums text-muted-foreground/70"
          title={`Row ${index}`}
        >
          {index}
        </span>
        <button
          onClick={selectMode ? onToggleSelected : onClick}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        >
          <span
            className={`truncate text-sm font-semibold ${
              active ? "text-primary" : "text-foreground"
            }`}
          >
            {s.ticker}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">{s.name}</span>
        </button>

        <AlertBellButton ticker={s.ticker} note={noteDraft} className="h-7 w-6" />

        <button
          onClick={onRemove}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground/70 opacity-100 transition-opacity hover:bg-destructive/20 hover:text-destructive 2xl:h-6 2xl:w-6 2xl:text-muted-foreground/50 2xl:opacity-0 2xl:group-hover:opacity-100"
          aria-label="Remove"
          title="Remove from Scanning Process"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Inline notes — always visible */}
      <textarea
        value={noteDraft}
        data-note-list-id={currentListId}
        data-note-yahoo={s.yahoo}
        onChange={(e) => setNoteDraft(e.target.value)}
        onBlur={() => { if (noteDraft !== (note ?? "")) onSetScanNote(noteDraft); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        placeholder="Notes… (setup, trigger, stop)"
        rows={noteDraft ? 2 : 1}
        className="w-full resize-y rounded border border-border/60 bg-background/40 px-1.5 py-1 text-[11px] leading-snug placeholder:text-muted-foreground/60 focus-visible:border-primary/50 focus-visible:outline-none"
      />

      {/* One-click chips to add to other lists */}
      {otherLists.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground/70">Add to:</span>
          {otherLists.map((l) => {
            const inIt = inLists.has(l.id);
            return (
              <button
                key={l.id}
                onClick={(e) => { e.stopPropagation(); onToggleListMembership(l.id); }}
                className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition-all ${
                  inIt
                    ? "border-transparent text-white shadow-sm"
                    : "border-border/60 text-muted-foreground hover:border-foreground/40 hover:text-foreground"
                }`}
                style={inIt ? { background: l.color } : undefined}
                title={inIt ? `Remove from ${l.name}` : `Add to ${l.name}`}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: inIt ? "rgba(255,255,255,0.9)" : l.color }}
                />
                {l.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const HISTORY_MAX = 100;

function pushHistory(cur: NseSymbol[], sym: NseSymbol): NseSymbol[] {
  return [sym, ...cur.filter((x) => x.yahoo !== sym.yahoo)].slice(0, HISTORY_MAX);
}

function MainSearchHistory({
  history,
  setHistory,
  selected,
  onSelect,
}: {
  history: NseSymbol[];
  setHistory: (updater: (cur: NseSymbol[]) => NseSymbol[]) => void;
  selected: string | null;
  onSelect: (yahoo: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);

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

  const pick = (s: NseSymbol) => {
    setHistory((cur) => pushHistory(cur, s));
    onSelect(s.yahoo);
    setQuery("");
  };

  const removeOne = (yahoo: string) => {
    setHistory((cur) => cur.filter((s) => s.yahoo !== yahoo));
  };

  return (
    <>
      <div className="shrink-0 border-b border-border bg-background/50 p-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              else if (e.key === "Enter") {
                const p = customCandidate ?? results[0];
                if (p) pick(p);
              }
            }}
            placeholder="Search NSE symbols…"
            className="h-8 pl-8 pr-7 text-xs"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {query && (
          <div className="mt-2 max-h-72 overflow-y-auto no-scrollbar rounded-md border border-border bg-card">
            {customCandidate && (
              <button
                onClick={() => pick(customCandidate)}
                className="flex w-full items-center justify-between gap-2 border-b border-border bg-primary/5 px-3 py-1.5 text-left text-xs hover:bg-primary/10"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{customCandidate.ticker}</div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    Open as NSE symbol ({customCandidate.yahoo})
                  </div>
                </div>
              </button>
            )}
            {results.length === 0 && !customCandidate && (
              <div className="p-3 text-center text-xs text-muted-foreground">No matches</div>
            )}
            {results.map((s) => (
              <button
                key={s.yahoo}
                onClick={() => pick(s)}
                className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{s.ticker}</div>
                  <div className="truncate text-[10px] text-muted-foreground">{s.name}</div>
                </div>
                {s.sector && (
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {s.sector}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-b border-border px-2 py-1.5">
        <p className="truncate text-[10px] text-muted-foreground">
          Recent {history.length > 0 ? `(${history.length})` : ""} · ↑/↓ navigate
        </p>
        {history.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="rounded p-1 text-muted-foreground hover:bg-destructive/20 hover:text-destructive"
            title="Clear history"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {history.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Search above to open a symbol. Recently viewed ones appear here.
          </div>
        ) : (
          history.map((s) => (
            <div
              key={s.yahoo}
              data-symbol={s.yahoo}
              onClick={() => {
                setHistory((cur) => pushHistory(cur, s));
                onSelect(s.yahoo);
              }}
              className={`group/row flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-muted/60 ${
                s.yahoo === selected ? "bg-muted text-foreground" : "text-foreground/90"
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{s.ticker}</div>
                <div className="truncate text-[10px] text-muted-foreground">{s.name}</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  removeOne(s.yahoo);
                }}
                className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-destructive/20 hover:text-destructive group-hover/row:opacity-100"
                title="Remove from history"
                aria-label="Remove from history"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))
        )}
      </div>

      <Dialog open={confirmClear} onOpenChange={setConfirmClear}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Clear recent history?</DialogTitle>
            <DialogDescription>
              This removes all {history.length} recently viewed symbol{history.length === 1 ? "" : "s"}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => {
                const n = history.length;
                setHistory(() => []);
                setConfirmClear(false);
                toast.success(`Cleared ${n} symbol${n === 1 ? "" : "s"}`);
              }}
            >
              Clear history
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
