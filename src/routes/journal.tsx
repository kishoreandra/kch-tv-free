import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect, useRef } from "react";
import { ArrowLeft, Plus, Trash2, Pencil, Download, Search, X, Upload, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { format, startOfWeek, startOfMonth, startOfYear, differenceInMinutes, eachDayOfInterval } from "date-fns";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogTrigger, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ApprovalGate } from "@/components/ApprovalGate";
import { ProfileMenu } from "@/components/ProfileMenu";
import { AuthButton } from "@/components/AuthButton";
import { NSE_SYMBOLS } from "@/data/nse-symbols";
import {
  listTrades,
  createTrade,
  updateTrade,
  deleteTrade,
  deleteAllTrades,
  type TradeRow,
} from "@/lib/journal/trades.functions";
import { getJournalNote } from "@/lib/journal/notes.functions";
import { DailyJournalNote } from "@/components/DailyJournalNote";
import { SymbolLink } from "@/components/SymbolLink";
import { getBreadthForDates, type BreadthDay } from "@/lib/breadth/market-sa.functions";

export const Route = createFileRoute("/journal")({
  head: () => ({
    meta: [
      { title: "Trading Journal — NSE Equities" },
      { name: "description", content: "Track NSE equity trades with daily, weekly, monthly and yearly performance analytics." },
      { property: "og:title", content: "Trading Journal — NSE Equities" },
      { property: "og:description", content: "Log NSE equity trades, review setups, and see your edge over time." },
    ],
  }),
  component: JournalPage,
  errorComponent: ({ error }) => (
    <div className="p-8 text-sm text-destructive">Journal failed to load: {error.message}</div>
  ),
});

type Tab = "dashboard" | "trades" | "analytics" | "setups";

// ---------- Utilities ----------
const inr = (n: number) =>
  (n < 0 ? "-₹" : "₹") + Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

interface Computed extends TradeRow {
  pnl: number;
  pnlPct: number;
  isOpen: boolean;
  holdMins: number;
}

function computeAll(rows: TradeRow[]): Computed[] {
  return rows.map((r) => {
    const isOpen = r.status !== "closed" || r.exit_price == null;
    const pnl = isOpen ? 0 : (Number(r.exit_price) - Number(r.entry_price)) * r.quantity;
    const pnlPct = isOpen ? 0 : ((Number(r.exit_price) - Number(r.entry_price)) / Number(r.entry_price)) * 100;
    const holdMins = r.exit_at ? differenceInMinutes(new Date(r.exit_at), new Date(r.entry_at)) : 0;
    return { ...r, pnl, pnlPct, isOpen, holdMins };
  });
}

interface ImportedTrade {
  symbol: string;
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  entry_at: string;
  exit_at: string | null;
  status: "closed" | "open";
  summary: string;
}

type ParsedTradeRow = {
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  timestamp: string | null;
};

function normalizeNumber(value: unknown): number {
  if (value == null || value === "") return 0;
  const clean = String(value).replace(/,/g, "").trim();
  return Number(clean) || 0;
}

async function parseZerodhaEquityTradebook(file: File): Promise<ImportedTrade[]> {
  const xlsxModule = await import("xlsx");
  const XLSX = (xlsxModule as any).default ?? xlsxModule;
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames.find((name: string) => name.toLowerCase().includes("equity")) ?? workbook.SheetNames[0];
  if (!sheetName) throw new Error("No sheet found in XLSX.");
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" }) as any[][];

  const headerRowIndex = rawRows.findIndex((row: any[]) =>
    Array.isArray(row) &&
    row.some((cell) => String(cell).trim().toLowerCase() === "symbol") &&
    row.some((cell) => String(cell).trim().toLowerCase() === "trade type") &&
    row.some((cell) => String(cell).trim().toLowerCase() === "price")
  );
  if (headerRowIndex === -1) {
    throw new Error("Could not locate Zerodha tradebook header row.");
  }

  const headerRow = rawRows[headerRowIndex] as any[];
  const findColumn = (label: string) => headerRow.findIndex((cell) => String(cell).trim().toLowerCase() === label);
  const colSymbol = findColumn("symbol");
  const colTradeType = findColumn("trade type");
  const colQuantity = findColumn("quantity");
  const colPrice = findColumn("price");
  const colTradeDate = findColumn("trade date");
  const colExecTime = findColumn("order execution time");
  if (colSymbol === -1 || colTradeType === -1 || colQuantity === -1 || colPrice === -1) {
    throw new Error("Missing required Zerodha tradebook columns.");
  }

  const parseDate = (value: unknown): string | null => {
    if (value == null || value === "") return null;
    if (typeof value === "number" && XLSX.SSF?.parse_date_code) {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed && typeof parsed.y === "number") {
        return new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d, parsed.H, parsed.M, parsed.S || 0)).toISOString();
      }
    }
    const text = String(value).trim();
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
    return null;
  };

  const parsedRows: ParsedTradeRow[] = rawRows.slice(headerRowIndex + 1).map((row: any[]) => {
    const symbol = String(row[colSymbol] ?? "").trim().toUpperCase();
    const side = String(row[colTradeType] ?? "").trim().toLowerCase() as "buy" | "sell";
    const quantity = normalizeNumber(row[colQuantity]);
    const price = normalizeNumber(row[colPrice]);
    const timestamp = parseDate(row[colExecTime] ?? row[colTradeDate]);
    return { symbol, side, quantity, price, timestamp };
  }).filter((row) => row.symbol && (row.side === "buy" || row.side === "sell") && row.quantity > 0 && row.price > 0);

  const grouped = new Map<string, ParsedTradeRow[]>();
  parsedRows.forEach((row) => {
    const list = grouped.get(row.symbol) ?? [];
    list.push(row);
    grouped.set(row.symbol, list);
  });

  const imported: ImportedTrade[] = [];
  grouped.forEach((rows, symbol) => {
    const buyRows = rows.filter((row) => row.side === "buy");
    const sellRows = rows.filter((row) => row.side === "sell");
    const totalBuyQty = buyRows.reduce((sum, row) => sum + row.quantity, 0);
    const totalSellQty = sellRows.reduce((sum, row) => sum + row.quantity, 0);
    const totalBuyValue = buyRows.reduce((sum, row) => sum + row.quantity * row.price, 0);
    const totalSellValue = sellRows.reduce((sum, row) => sum + row.quantity * row.price, 0);
    const avgBuyPrice = totalBuyQty ? totalBuyValue / totalBuyQty : 0;
    const avgSellPrice = totalSellQty ? totalSellValue / totalSellQty : 0;
    const earliestBuy = buyRows.length
      ? new Date(Math.min(...buyRows.map((row) => new Date(row.timestamp ?? new Date().toISOString()).getTime()))).toISOString()
      : null;
    const latestSell = sellRows.length
      ? new Date(Math.max(...sellRows.map((row) => new Date(row.timestamp ?? new Date().toISOString()).getTime()))).toISOString()
      : null;

    const netQty = totalBuyQty - totalSellQty;
    if (totalBuyQty > 0 && totalSellQty > 0 && netQty === 0) {
      imported.push({
        symbol,
        quantity: totalBuyQty,
        entry_price: avgBuyPrice,
        exit_price: avgSellPrice,
        entry_at: earliestBuy ?? new Date().toISOString(),
        exit_at: latestSell,
        status: "closed",
        summary: `Aggregated closed ${symbol} ${totalBuyQty} @ ${avgBuyPrice.toFixed(2)} → ${avgSellPrice.toFixed(2)}`,
      });
    } else if (netQty > 0) {
      imported.push({
        symbol,
        quantity: netQty,
        entry_price: avgBuyPrice,
        exit_price: null,
        entry_at: earliestBuy ?? new Date().toISOString(),
        exit_at: null,
        status: "open",
        summary: totalSellQty > 0
          ? `Net open buy ${symbol} ${netQty} @ ${avgBuyPrice.toFixed(2)} after sell average ${avgSellPrice.toFixed(2)}`
          : `Open buy ${symbol} ${netQty} @ ${avgBuyPrice.toFixed(2)}`,
      });
    } else if (netQty < 0) {
      imported.push({
        symbol,
        quantity: Math.abs(netQty),
        entry_price: avgBuyPrice || avgSellPrice,
        exit_price: avgSellPrice,
        entry_at: earliestBuy ?? latestSell ?? new Date().toISOString(),
        exit_at: latestSell ?? new Date().toISOString(),
        status: "closed",
        summary: totalBuyQty > 0
          ? `Net exit ${symbol} ${Math.abs(netQty)} @ ${avgSellPrice.toFixed(2)}`
          : `Exit-only ${symbol} ${Math.abs(netQty)} @ ${avgSellPrice.toFixed(2)}`,
      });
    } else if (totalBuyQty > 0) {
      imported.push({
        symbol,
        quantity: totalBuyQty,
        entry_price: avgBuyPrice,
        exit_price: null,
        entry_at: earliestBuy ?? new Date().toISOString(),
        exit_at: null,
        status: "open",
        summary: `Open buy ${symbol} ${totalBuyQty} @ ${avgBuyPrice.toFixed(2)}`,
      });
    } else if (totalSellQty > 0) {
      imported.push({
        symbol,
        quantity: totalSellQty,
        entry_price: avgSellPrice,
        exit_price: avgSellPrice,
        entry_at: latestSell ?? new Date().toISOString(),
        exit_at: latestSell ?? new Date().toISOString(),
        status: "closed",
        summary: `Exit-only ${symbol} ${totalSellQty} @ ${avgSellPrice.toFixed(2)}`,
      });
    }
  });

  return imported;
}

// F&O detection — reject futures/options tickers commonly typed by mistake.
const FNO_PATTERNS = [/FUT$/i, /CE$/i, /PE$/i, /\d{2}(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)/i];
function isLikelyFnO(sym: string): boolean {
  const s = sym.trim().toUpperCase();
  return FNO_PATTERNS.some((re) => re.test(s));
}

function JournalPage() {
  return (
    <ApprovalGate
      signedOut={
        <div className="flex h-screen w-full flex-col items-center justify-center gap-4 bg-background text-center">
          <h1 className="text-2xl font-semibold">Trading Journal</h1>
          <p className="text-sm text-muted-foreground">Please sign in to log and track your NSE trades.</p>
          <AuthButton />
        </div>
      }
    >
      <JournalInner />
    </ApprovalGate>
  );
}

function JournalInner() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TradeRow | null>(null);
  const [importedTrades, setImportedTrades] = useState<ImportedTrade[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPreviewOpen, setImportPreviewOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const list = useServerFn(listTrades);
  const createJournalTrade = useServerFn(createTrade);
  const q = useQuery({ queryKey: ["trades"], queryFn: () => list() });

  const trades = useMemo(() => computeAll(q.data ?? []), [q.data]);

  // Market breadth on each trade's entry date (Situational Awareness link-back)
  const breadthFn = useServerFn(getBreadthForDates);
  const entryDates = useMemo(
    () => Array.from(new Set(trades.map((t) => format(new Date(t.entry_at), "yyyy-MM-dd")))).slice(0, 500),
    [trades],
  );
  const breadthQ = useQuery({
    queryKey: ["trade-entry-breadth", entryDates],
    enabled: entryDates.length > 0,
    queryFn: () => breadthFn({ data: { dates: entryDates } }),
  });
  const breadthByDate = useMemo(() => {
    const m = new Map<string, BreadthDay>();
    (breadthQ.data?.rows ?? []).forEach((r) => m.set(r.trade_date, r));
    return m;
  }, [breadthQ.data]);

  const applyImportedTrade = (trade: ImportedTrade) => {
    setEditing({
      id: "",
      user_id: "",
      symbol: trade.symbol,
      entry_price: trade.entry_price,
      exit_price: trade.exit_price,
      quantity: trade.quantity,
      entry_at: trade.entry_at,
      exit_at: trade.exit_at,
      setup: null,
      rationale: null,
      outcome: trade.exit_price == null ? "open" : null,
      notes: null,
      tags: [],
      status: trade.status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as TradeRow);
    setFormOpen(true);
    setImportPreviewOpen(false);
  };

  const addImportedTrades = useMutation({
    mutationFn: async () => {
      if (!importedTrades || importedTrades.length === 0) {
        throw new Error("No imported trades to add.");
      }
      for (const trade of importedTrades) {
        await createJournalTrade({
          data: {
            symbol: trade.symbol,
            entry_price: trade.entry_price,
            exit_price: trade.exit_price,
            quantity: trade.quantity,
            entry_at: trade.entry_at,
            exit_at: trade.exit_at,
            setup: null,
            rationale: null,
            outcome: null,
            notes: null,
            tags: [],
            status: trade.status,
          },
        });
      }
    },
    onSuccess: () => {
      toast.success("Imported trades added to journal.");
      q.refetch();
      setImportPreviewOpen(false);
      setImportedTrades(null);
    },
    onError: (error: any) => {
      toast.error(error?.message ?? "Failed to add imported trades.");
    },
  });

  const handleFileChange = async (file: File | null) => {
    if (!file) return;
    setImportError(null);
    setImporting(true);
    try {
      const imported = await parseZerodhaEquityTradebook(file);
      if (imported.length === 0) {
        setImportError("No valid equity trades found in the selected file.");
        setImportedTrades(null);
      } else {
        setImportedTrades(imported);
        setImportPreviewOpen(true);
      }
    } catch (error) {
      setImportedTrades(null);
      setImportError(error instanceof Error ? error.message : "Could not parse XLSX.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="flex h-screen w-full flex-col bg-background">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-card px-3">
        <Link to="/" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-sm font-semibold">Trading Journal</h1>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
          NSE Equities Only
        </span>
        <nav className="ml-4 flex items-center gap-1">
          {(["dashboard", "trades", "analytics", "setups"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-2.5 py-1 text-xs capitalize transition ${
                tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
          <Link
            to="/market-sa"
            className="rounded px-2.5 py-1 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
          >
            Market SA
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Upload className="mr-1 h-3.5 w-3.5" />}
            {importing ? "Parsing…" : "Import XLSX"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportCsv(trades)}>
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Add trade
          </Button>
          <ProfileMenu />
        </div>
      </header>
      {importError ? (
        <div className="border-b bg-rose-500/10 px-4 py-2 text-sm text-rose-600">{importError}</div>
      ) : null}

      <main className="min-h-0 flex-1 overflow-auto p-4">
        {q.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground">Loading trades…</div>
        ) : tab === "dashboard" ? (
          <Dashboard trades={trades} />
        ) : tab === "trades" ? (
          <TradesTable
            trades={trades}
            breadthByDate={breadthByDate}
            onEdit={(t) => { setEditing(t); setFormOpen(true); }}
          />
        ) : tab === "analytics" ? (
          <Analytics trades={trades} breadthByDate={breadthByDate} />
        ) : (
          <SetupsPanel trades={trades} />
        )}
      </main>

      {importPreviewOpen && importedTrades ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4">
          <div className="w-full max-w-3xl rounded border bg-card p-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
              <div>
                <h2 className="text-lg font-semibold">Imported trade preview</h2>
                <p className="text-sm text-muted-foreground">Select a prefilling to edit the imported trade in the journal form, or add all imported trades at once.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => addImportedTrades.mutate()} disabled={addImportedTrades.isPending || !importedTrades?.length}>
                  {addImportedTrades.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  {addImportedTrades.isPending ? "Adding…" : "Add all"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setImportedTrades(null); setImportPreviewOpen(false); }}>
                  Discard all
                </Button>
                <button type="button" onClick={() => setImportPreviewOpen(false)} className="rounded p-2 text-muted-foreground hover:bg-muted">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/30 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Symbol</th>
                    <th className="px-3 py-2">Qty</th>
                    <th className="px-3 py-2">Entry</th>
                    <th className="px-3 py-2">Exit</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Summary</th>
                    <th className="px-3 py-2">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {importedTrades.map((trade, index) => (
                    <tr key={`${trade.symbol}-${index}`} className="border-t hover:bg-muted/20">
                      <td className="px-3 py-2 font-medium"><SymbolLink symbol={trade.symbol} /></td>
                      <td className="px-3 py-2 tabular-nums">{trade.quantity}</td>
                      <td className="px-3 py-2 tabular-nums">{trade.entry_price.toFixed(2)}</td>
                      <td className="px-3 py-2 tabular-nums">{trade.exit_price != null ? trade.exit_price.toFixed(2) : "—"}</td>
                      <td className="px-3 py-2 capitalize">{trade.status}</td>
                      <td className="px-3 py-2 text-muted-foreground">{trade.summary}</td>
                      <td className="px-3 py-2">
                        <Button size="sm" onClick={() => applyImportedTrade(trade)}>
                          Edit
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {formOpen && (
        <TradeForm
          initial={editing}
          onClose={() => { setFormOpen(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ trades }: { trades: Computed[] }) {
  const closed = trades.filter((t) => !t.isOpen);
  const wins = closed.filter((t) => t.pnl > 0);
  const losses = closed.filter((t) => t.pnl < 0);
  const totalPnl = closed.reduce((s, t) => s + t.pnl, 0);
  const winRate = closed.length ? (wins.length / closed.length) * 100 : 0;
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.pnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? losses.reduce((s, t) => s + t.pnl, 0) / losses.length : 0;
  const best = closed.reduce<Computed | null>((b, t) => (!b || t.pnl > b.pnl ? t : b), null);
  const worst = closed.reduce<Computed | null>((b, t) => (!b || t.pnl < b.pnl ? t : b), null);
  const openCount = trades.length - closed.length;
  const avgHoldMins = closed.length ? closed.reduce((s, t) => s + t.holdMins, 0) / closed.length : 0;
  const sortedHoldMins = closed.map((t) => t.holdMins).sort((a, b) => a - b);
  const medianHoldMins = sortedHoldMins.length
    ? sortedHoldMins.length % 2 === 1
      ? sortedHoldMins[(sortedHoldMins.length - 1) / 2]
      : (sortedHoldMins[sortedHoldMins.length / 2 - 1] + sortedHoldMins[sortedHoldMins.length / 2]) / 2
    : 0;
  const totalHoldDays = closed.reduce((s, t) => s + t.holdMins, 0) / 1440;
  const avgPnlPerDay = totalHoldDays > 0 ? totalPnl / totalHoldDays : 0;

  const curve = useMemo(() => {
    const sorted = [...closed].sort((a, b) => (a.exit_at ?? "").localeCompare(b.exit_at ?? ""));
    let cum = 0;
    return sorted.map((t) => {
      cum += t.pnl;
      return { date: t.exit_at ? format(new Date(t.exit_at), "MMM dd") : "", pnl: cum };
    });
  }, [closed]);

  // Drawdown series (percent from running peak)
  const drawdown = useMemo(() => {
    let peak = -Infinity;
    return curve.map((p) => {
      const val = p.pnl;
      if (val > peak) peak = val;
      const dd = peak > 0 ? ((val - peak) / peak) * 100 : 0;
      return { date: p.date, drawdown: dd };
    });
  }, [curve]);

  // Weekly note preview
  const getNoteFn = useServerFn(getJournalNote);
  const [weeklyNote, setWeeklyNote] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const periodStart = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
        const note = await getNoteFn({ data: { period_type: "weekly", period_start: periodStart } });
        setWeeklyNote(note?.content ?? null);
      } catch (e) {
        // ignore
      }
    })();
  }, [getNoteFn]);

  // Streaks: current streak (from latest closed), longest win/loss streak
  const { currentStreakLabel, longestWinStreak, longestLossStreak } = useMemo(() => {
    const sorted = [...closed].sort((a, b) => (a.exit_at ?? "").localeCompare(b.exit_at ?? ""));
    let longestWin = 0,
      longestLoss = 0;
    let curWin = 0,
      curLoss = 0;
    for (const t of sorted) {
      if (t.pnl > 0) {
        curWin++;
        curLoss = 0;
      } else {
        curLoss++;
        curWin = 0;
      }
      longestWin = Math.max(longestWin, curWin);
      longestLoss = Math.max(longestLoss, curLoss);
    }
    // current streak from end
    let current = 0;
    let label = "0";
    for (let i = sorted.length - 1; i >= 0; i--) {
      const t = sorted[i];
      if (t.pnl > 0) {
        if (current >= 0) current++;
        else break;
      } else {
        if (current <= 0) current--;
        else break;
      }
    }
    if (current > 0) label = `${current} wins`;
    else if (current < 0) label = `${Math.abs(current)} losses`;
    else label = `0`;
    return { currentStreakLabel: label, longestWinStreak: longestWin, longestLossStreak: longestLoss };
  }, [closed]);

  // Payoff ratio: avg win / avg loss (absolute)
  const payoffRatio = useMemo(() => {
    const avgW = avgWin || 0;
    const avgL = avgLoss || 0;
    if (avgL === 0) return avgW > 0 ? Infinity : 0;
    return avgW / Math.abs(avgL);
  }, [avgWin, avgLoss]);

  // Day-of-week performance (by entry date)
  const dowPerformance = useMemo(() => {
    const m = new Map<string, { day: string; pnl: number; wins: number; trades: number }>();
    closed.forEach((t) => {
      if (!t.entry_at) return;
      const d = new Date(t.entry_at);
      const day = format(d, "EEE");
      const cur = m.get(day) ?? { day, pnl: 0, wins: 0, trades: 0 };
      cur.pnl += t.pnl;
      cur.trades += 1;
      if (t.pnl > 0) cur.wins += 1;
      m.set(day, cur);
    });
    const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return order.map((k) => m.get(k) ?? { day: k, pnl: 0, wins: 0, trades: 0 });
  }, [closed]);

  // Concurrent open positions over time (daily counts)
  const concurrentOverTime = useMemo(() => {
    if (trades.length === 0) return [] as { date: string; open: number }[];
    const entries = trades.map((t) => new Date(t.entry_at));
    const exits = trades.map((t) => (t.exit_at ? new Date(t.exit_at) : new Date()));
    const minDate = new Date(Math.min(...entries.map((d) => d.getTime())));
    const maxDate = new Date(Math.max(...exits.map((d) => d.getTime())));
    const days = eachDayOfInterval({ start: minDate, end: maxDate });
    return days.map((d) => {
      const iso = format(d, "yyyy-MM-dd");
      const count = trades.filter((t) => new Date(t.entry_at) <= d && (t.exit_at ? new Date(t.exit_at) >= d : true)).length;
      return { date: iso, open: count };
    });
  }, [trades]);

  const latestConcurrent = concurrentOverTime.length ? concurrentOverTime[concurrentOverTime.length - 1].open : openCount;

  const monthlyMomentum = useMemo(() => {
    const map = new Map<string, { month: string; pnl: number; trades: number }>();
    closed.forEach((t) => {
      if (!t.exit_at) return;
      const monthKey = format(new Date(t.exit_at), "yyyy-MM");
      const monthLabel = format(new Date(t.exit_at), "MMM yy");
      const entry = map.get(monthKey) ?? { month: monthLabel, pnl: 0, trades: 0 };
      entry.pnl += t.pnl;
      entry.trades += 1;
      map.set(monthKey, entry);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => value);
  }, [closed]);

  const topSymbols = useMemo(() => {
    const map = new Map<string, number>();
    closed.forEach((t) => map.set(t.symbol, (map.get(t.symbol) ?? 0) + t.pnl));
    return Array.from(map.entries())
      .map(([symbol, pnl]) => ({ symbol, pnl }))
      .sort((a, b) => b.pnl - a.pnl)
      .slice(0, 8);
  }, [closed]);

  const formatHold = (mins: number) => {
    const days = Math.floor(mins / 1440);
    const hours = Math.floor((mins % 1440) / 60);
    const minutes = Math.round(mins % 60);
    if (days > 0) return `${days}d ${hours}h`;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  };

  const formatHoldDays = (mins: number) => `${(mins / 1440).toFixed(1)}d`;

  return (
    <div className="space-y-6">
      <DailyJournalNote />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Stat label="Total P&L" value={inr(totalPnl)} tone={totalPnl >= 0 ? "pos" : "neg"} />
        <Stat label="Win Rate" value={`${winRate.toFixed(1)}%`} />
        <Stat label="Closed trades" value={String(closed.length)} sub={`${openCount} open`} />
        <Stat label="Avg hold" value={formatHoldDays(avgHoldMins)} sub={formatHold(avgHoldMins)} />
        <Stat label="Avg P/L / day" value={inr(avgPnlPerDay)} tone={avgPnlPerDay >= 0 ? "pos" : "neg"} />
        <div className="rounded border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Streak</div>
          <div className="mt-1 text-lg font-semibold">{currentStreakLabel}</div>
          <div className="text-xs text-muted-foreground">Longest W: {longestWinStreak} · L: {longestLossStreak}</div>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">This week's note</div>
          <div className="mt-1 text-sm text-ellipsis overflow-hidden h-12">{weeklyNote ? weeklyNote.slice(0, 140) : <span className="text-xs text-muted-foreground">(no note yet)</span>}</div>
          <div className="mt-2">
            <Link to="/review" className="text-xs text-primary-600 hover:underline">Open review</Link>
          </div>
        </div>

        <div className="rounded border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Payoff ratio</div>
          <div className="mt-1 text-lg font-semibold">{isFinite(payoffRatio) ? payoffRatio.toFixed(2) : "∞"}</div>
          <div className="text-xs text-muted-foreground">Avg win {inr(avgWin)} · Avg loss {inr(avgLoss)}</div>
        </div>

        <div className="rounded border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Concurrent open</div>
          <div className="mt-1 text-lg font-semibold">{latestConcurrent}</div>
          <div className="text-xs text-muted-foreground">Current open positions: {openCount}</div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.5fr_0.9fr]">
        <section className="rounded border bg-card p-4">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-sm font-semibold">Cumulative P&L</h2>
              <p className="text-xs text-muted-foreground">View your P&L growth after each closed trade.</p>
            </div>
            <div className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{curve.length} closed results</div>
          </div>
          {curve.length === 0 ? (
            <p className="text-sm text-muted-foreground">No closed trades yet.</p>
          ) : (
            <div className="h-80">
              <ResponsiveContainer>
                <AreaChart data={curve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.18} />
                  <XAxis dataKey="date" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                  <YAxis fontSize={11} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                  <Tooltip
                    formatter={(v: number) => inr(v)}
                    contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--card-foreground)" }}
                  />
                  <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="pnl" stroke="var(--primary)" fill="url(#pnlGradient)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="mt-4 h-28">
                <ResponsiveContainer>
                  <LineChart data={drawdown} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                    <XAxis dataKey="date" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                    <YAxis tickFormatter={(v) => `${Math.round(v)}%`} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                    <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--card-foreground)" }} />
                    <Line type="monotone" dataKey="drawdown" stroke="var(--muted-foreground)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>

        <div className="space-y-3">
          <section className="rounded border bg-card p-4">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">Monthly momentum</h2>
                <p className="text-xs text-muted-foreground">P&L by month for your closed trades.</p>
              </div>
              <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">{monthlyMomentum.length} months</span>
            </div>
            {monthlyMomentum.length === 0 ? (
              <p className="text-sm text-muted-foreground">No monthly data yet.</p>
            ) : (
              <div className="h-48">
                <ResponsiveContainer>
                  <BarChart data={monthlyMomentum} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                    <XAxis dataKey="month" fontSize={10} tick={{ fill: "var(--muted-foreground)" }} />
                    <YAxis fontSize={10} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fill: "var(--muted-foreground)" }} />
                    <Tooltip
                      formatter={(v: number) => inr(v)}
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--card-foreground)" }}
                    />
                    <Bar dataKey="pnl" radius={[6, 6, 0, 0]} fill="var(--primary)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="rounded border bg-card p-4">
            <h2 className="mb-3 text-sm font-semibold">Top symbol edge</h2>
            {topSymbols.length === 0 ? (
              <p className="text-sm text-muted-foreground">Close trades to highlight top performers.</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer>
                  <BarChart data={topSymbols} layout="vertical" margin={{ top: 0, right: 10, left: 20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.08} horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="symbol" width={70} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
                    <Tooltip
                      formatter={(v: number) => inr(v)}
                      contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--card-foreground)" }}
                    />
                    <Bar dataKey="pnl" radius={[0, 8, 8, 0]} fill="var(--primary)" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
                <section className="rounded border bg-card p-4">
                  <h2 className="mb-3 text-sm font-semibold">Entry by weekday</h2>
                  {dowPerformance.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No closed trades yet.</p>
                  ) : (
                    <div className="h-44">
                      <ResponsiveContainer>
                        <BarChart data={dowPerformance} margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" opacity={0.08} />
                          <XAxis dataKey="day" tick={{ fill: "var(--muted-foreground)" }} />
                          <YAxis tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                          <Tooltip
                            formatter={(v: number) => inr(v)}
                            contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--card-foreground)" }}
                          />
                          <Bar dataKey="pnl" fill="var(--primary)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </section>
        </div>
      </div>

      <RecentTrades trades={trades.slice(0, 10)} />
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "pos" | "neg" }) {
  const cls = tone === "pos" ? "text-emerald-500" : tone === "neg" ? "text-rose-500" : "";
  return (
    <div className="rounded border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${cls}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

function RecentTrades({ trades }: { trades: Computed[] }) {
  if (trades.length === 0) return null;
  return (
    <section className="rounded border bg-card">
      <div className="border-b px-4 py-2 text-sm font-semibold">Recent Trades</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Entry</th>
              <th className="px-3 py-2">Exit</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">P&L</th>
              <th className="px-3 py-2">Setup</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-3 py-2 font-medium"><SymbolLink symbol={t.symbol} /></td>
                <td className="px-3 py-2 tabular-nums">{inr(Number(t.entry_price))}</td>
                <td className="px-3 py-2 tabular-nums">{t.exit_price != null ? inr(Number(t.exit_price)) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.quantity}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${t.pnl > 0 ? "text-emerald-500" : t.pnl < 0 ? "text-rose-500" : ""}`}>
                  {t.isOpen ? "—" : `${inr(t.pnl)} (${pct(t.pnlPct)})`}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{t.setup ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge variant={t.isOpen ? "outline" : "secondary"} className="text-[10px]">
                    {t.isOpen ? "Open" : (t.outcome ?? "closed")}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------- Trades table ----------
function breadthLabel(b: BreadthDay | undefined): string {
  if (!b) return "—";
  const r10 = b.up4pct_ratio_10day;
  return `+${b.up4pct_count}/-${b.down4pct_count}${r10 != null ? ` · 10d ${r10.toFixed(1)}` : ""}`;
}

function TradesTable({ trades, onEdit, breadthByDate }: { trades: Computed[]; onEdit: (t: TradeRow) => void; breadthByDate: Map<string, BreadthDay> }) {
  const [q, setQ] = useState("");
  const [outcome, setOutcome] = useState<string>("all");
  const [setup, setSetup] = useState<string>("all");
  const qc = useQueryClient();
  const del = useServerFn(deleteTrade);
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Trade deleted"); qc.invalidateQueries({ queryKey: ["trades"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Delete failed"),
  });
  const deleteAllFn = useServerFn(deleteAllTrades);
  const deleteAllMut = useMutation({
    mutationFn: async () => deleteAllFn(),
    onSuccess: () => { toast.success("All trades deleted"); qc.invalidateQueries({ queryKey: ["trades"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Delete all failed"),
  });

  const setups = useMemo(() => {
    const s = new Set<string>();
    trades.forEach((t) => { if (t.setup) s.add(t.setup); });
    return Array.from(s).sort();
  }, [trades]);

  const filtered = useMemo(() => {
    return trades.filter((t) => {
      if (q) {
        const needle = q.toLowerCase();
        if (!t.symbol.toLowerCase().includes(needle) && !(t.setup ?? "").toLowerCase().includes(needle)) return false;
      }
      if (outcome !== "all") {
        if (outcome === "open" && !t.isOpen) return false;
        if (outcome !== "open" && t.outcome !== outcome) return false;
      }
      if (setup !== "all" && t.setup !== setup) return false;
      return true;
    });
  }, [trades, q, outcome, setup]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search symbol or setup" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 w-56 pl-7 text-xs" />
        </div>
        <Select value={outcome} onValueChange={setOutcome}>
          <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outcomes</SelectItem>
            <SelectItem value="win">Wins</SelectItem>
            <SelectItem value="loss">Losses</SelectItem>
            <SelectItem value="breakeven">Breakeven</SelectItem>
            <SelectItem value="open">Open</SelectItem>
          </SelectContent>
        </Select>
        <Select value={setup} onValueChange={setSetup}>
          <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue placeholder="Setup" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All setups</SelectItem>
            {setups.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex items-center gap-2">
          <div className="text-xs text-muted-foreground">{filtered.length} of {trades.length} trades</div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={trades.length === 0} className="text-rose-500 hover:text-rose-600">
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete all
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all trades?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently remove every trade in your journal. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={() => deleteAllMut.mutate()}
                  disabled={deleteAllMut.isPending}
                >
                  {deleteAllMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                  {deleteAllMut.isPending ? "Deleting…" : "Delete all"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      <div className="overflow-x-auto rounded border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2">Entry date</th>
              <th className="px-3 py-2 text-right">Entry</th>
              <th className="px-3 py-2 text-right">Exit</th>
              <th className="px-3 py-2 text-right">Qty</th>
              <th className="px-3 py-2 text-right">P&L (₹)</th>
              <th className="px-3 py-2 text-right">P&L %</th>
              <th className="px-3 py-2">Setup</th>
              <th className="px-3 py-2">Entry breadth</th>
              <th className="px-3 py-2">Tags</th>
              <th className="px-3 py-2">Outcome</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={13} className="px-3 py-6 text-center text-muted-foreground">No trades yet — click <b>Add trade</b> to log one.</td></tr>
            ) : filtered.map((t) => (
              <tr key={t.id} className="border-t hover:bg-muted/20">
                <td className="px-3 py-2 font-medium"><SymbolLink symbol={t.symbol} /></td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{format(new Date(t.entry_at), "yyyy-MM-dd HH:mm")}</td>
                <td className="px-3 py-2 text-right tabular-nums">{inr(Number(t.entry_price))}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.exit_price != null ? inr(Number(t.exit_price)) : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.quantity}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${t.pnl > 0 ? "text-emerald-500" : t.pnl < 0 ? "text-rose-500" : ""}`}>
                  {t.isOpen ? "—" : inr(t.pnl)}
                </td>
                <td className={`px-3 py-2 text-right tabular-nums ${t.pnl > 0 ? "text-emerald-500" : t.pnl < 0 ? "text-rose-500" : ""}`}>
                  {t.isOpen ? "—" : pct(t.pnlPct)}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{t.setup ?? "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap text-amber-500/90">{breadthLabel(breadthByDate.get(format(new Date(t.entry_at), "yyyy-MM-dd")))}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {t.tags.map((tg) => <Badge key={tg} variant="outline" className="text-[10px]">{tg}</Badge>)}
                  </div>
                </td>
                <td className="px-3 py-2 capitalize">{t.outcome ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge variant={t.isOpen ? "outline" : "secondary"} className="text-[10px]">{t.status}</Badge>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => onEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-rose-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete trade {t.symbol}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This action will permanently remove this trade from your journal.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => delMut.mutate(t.id)}
                            disabled={delMut.isPending}
                          >
                            {delMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
                            {delMut.isPending ? "Deleting…" : "Delete"}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- Analytics ----------
function bucketBy(trades: Computed[], keyFn: (d: Date) => string) {
  const map = new Map<string, { key: string; pnl: number; wins: number; count: number }>();
  for (const t of trades) {
    if (t.isOpen || !t.exit_at) continue;
    const k = keyFn(new Date(t.exit_at));
    const cur = map.get(k) ?? { key: k, pnl: 0, wins: 0, count: 0 };
    cur.pnl += t.pnl;
    cur.count += 1;
    if (t.pnl > 0) cur.wins += 1;
    map.set(k, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

function regimeBucket(b: BreadthDay | undefined): string {
  const r = b?.up4pct_ratio_10day;
  if (r == null) return "No breadth data";
  if (r > 2) return "Favourable · 10d ratio > 2";
  if (r < 1) return "Hostile · 10d ratio < 1";
  return "Neutral · 10d ratio 1–2";
}

function BreadthRegimeBlock({ trades, breadthByDate }: { trades: Computed[]; breadthByDate: Map<string, BreadthDay> }) {
  const rows = useMemo(() => {
    const m = new Map<string, { key: string; count: number; wins: number; pnl: number }>();
    for (const t of trades) {
      if (t.isOpen) continue;
      const key = regimeBucket(breadthByDate.get(format(new Date(t.entry_at), "yyyy-MM-dd")));
      const cur = m.get(key) ?? { key, count: 0, wins: 0, pnl: 0 };
      cur.count += 1;
      cur.pnl += t.pnl;
      if (t.pnl > 0) cur.wins += 1;
      m.set(key, cur);
    }
    return Array.from(m.values()).sort((a, b) => a.key.localeCompare(b.key));
  }, [trades, breadthByDate]);

  return (
    <section className="rounded border bg-card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">Performance by breadth regime (entry day)</h2>
        <Link to="/market-sa" className="text-xs text-primary hover:underline">Open Situational Awareness</Link>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No closed trades with breadth data yet.</p>
      ) : (
        <table className="w-full text-xs">
          <thead className="text-left text-muted-foreground">
            <tr>
              <th className="py-1">Regime</th>
              <th className="py-1 text-right">Trades</th>
              <th className="py-1 text-right">Win rate</th>
              <th className="py-1 text-right">Avg P&L</th>
              <th className="py-1 text-right">Total P&L</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-border/50">
                <td className="py-1">{r.key}</td>
                <td className="py-1 text-right tabular-nums">{r.count}</td>
                <td className="py-1 text-right tabular-nums">{((r.wins / r.count) * 100).toFixed(0)}%</td>
                <td className={`py-1 text-right tabular-nums ${r.pnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{inr(r.pnl / r.count)}</td>
                <td className={`py-1 text-right tabular-nums ${r.pnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{inr(r.pnl)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Analytics({ trades, breadthByDate }: { trades: Computed[]; breadthByDate: Map<string, BreadthDay> }) {
  const daily = useMemo(() => bucketBy(trades, (d) => format(d, "yyyy-MM-dd")), [trades]);
  const weekly = useMemo(() => bucketBy(trades, (d) => format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-'W'ww")), [trades]);
  const monthly = useMemo(() => bucketBy(trades, (d) => format(startOfMonth(d), "yyyy-MM")), [trades]);
  const yearly = useMemo(() => bucketBy(trades, (d) => format(startOfYear(d), "yyyy")), [trades]);

  const bySymbol = useMemo(() => {
    const m = new Map<string, number>();
    trades.forEach((t) => { if (!t.isOpen) m.set(t.symbol, (m.get(t.symbol) ?? 0) + t.pnl); });
    return Array.from(m.entries()).map(([symbol, pnl]) => ({ symbol, pnl }))
      .sort((a, b) => b.pnl - a.pnl).slice(0, 15);
  }, [trades]);

  return (
    <div className="space-y-6">
      <BreadthRegimeBlock trades={trades} breadthByDate={breadthByDate} />
      <BucketBlock title="Daily performance" rows={daily} />
      <BucketBlock title="Weekly performance" rows={weekly} />
      <BucketBlock title="Monthly performance" rows={monthly} />
      <BucketBlock title="Yearly performance" rows={yearly} />

      <section className="rounded border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">P&L by symbol (top 15)</h2>
        {bySymbol.length === 0 ? (
          <p className="text-sm text-muted-foreground">No closed trades yet.</p>
        ) : (
          <div className="h-80">
            <ResponsiveContainer>
              <BarChart data={bySymbol} layout="vertical" margin={{ top: 5, right: 20, left: 40, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis type="number" fontSize={11} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="symbol" fontSize={11} width={80} />
                <Tooltip
                  formatter={(v: number) => inr(v)}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--card-foreground)" }}
                />
                <Bar dataKey="pnl" fill="var(--primary)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </div>
  );
}

function BucketBlock({ title, rows }: { title: string; rows: { key: string; pnl: number; wins: number; count: number }[] }) {
  const total = rows.reduce((s, r) => s + r.pnl, 0);
  const trades = rows.reduce((s, r) => s + r.count, 0);
  const wins = rows.reduce((s, r) => s + r.wins, 0);
  const winRate = trades ? (wins / trades) * 100 : 0;
  return (
    <section className="rounded border bg-card p-4">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">
          {trades} trades · {winRate.toFixed(0)}% win · <span className={total >= 0 ? "text-emerald-500" : "text-rose-500"}>{inr(total)}</span>
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No data.</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="key" fontSize={10} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
              <YAxis fontSize={10} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
              <Tooltip
                formatter={(v: number) => inr(v)}
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--card-foreground)" }}
              />
              <ReferenceLine y={0} stroke="var(--muted-foreground)" />
              <Bar dataKey="pnl" fill="var(--primary)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

// ---------- Setups ----------
function SetupsPanel({ trades }: { trades: Computed[] }) {
  const stats = useMemo(() => {
    const m = new Map<string, Computed[]>();
    trades.forEach((t) => {
      if (t.isOpen) return;
      const k = t.setup ?? "(no setup)";
      const arr = m.get(k) ?? [];
      arr.push(t);
      m.set(k, arr);
    });
    return Array.from(m.entries()).map(([setup, arr]) => {
      const wins = arr.filter((t) => t.pnl > 0);
      const totalPnl = arr.reduce((s, t) => s + t.pnl, 0);
      const best = arr.reduce<Computed | null>((b, t) => (!b || t.pnl > b.pnl ? t : b), null);
      const worst = arr.reduce<Computed | null>((b, t) => (!b || t.pnl < b.pnl ? t : b), null);
      return {
        setup,
        count: arr.length,
        winRate: (wins.length / arr.length) * 100,
        totalPnl,
        avgPnl: totalPnl / arr.length,
        best: best?.pnl ?? 0,
        worst: worst?.pnl ?? 0,
      };
    }).sort((a, b) => b.totalPnl - a.totalPnl);
  }, [trades]);

  return (
    <div className="space-y-4">
      <section className="rounded border bg-card p-4">
        <h2 className="mb-3 text-sm font-semibold">Win rate by setup</h2>
        {stats.length === 0 ? (
          <p className="text-sm text-muted-foreground">Log closed trades with setup names to see edge per pattern.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={stats}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.18} />
                <XAxis dataKey="setup" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                <YAxis fontSize={10} domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: "var(--muted-foreground)", fontSize: 10 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} />
                <Tooltip
                  formatter={(v: number) => `${v.toFixed(1)}%`}
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--card-foreground)" }}
                />
                <Bar dataKey="winRate" fill="var(--primary)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="overflow-x-auto rounded border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/30 text-left text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Setup</th>
              <th className="px-3 py-2 text-right">Trades</th>
              <th className="px-3 py-2 text-right">Win rate</th>
              <th className="px-3 py-2 text-right">Total P&L</th>
              <th className="px-3 py-2 text-right">Avg P&L</th>
              <th className="px-3 py-2 text-right">Best</th>
              <th className="px-3 py-2 text-right">Worst</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.setup} className="border-t">
                <td className="px-3 py-2 font-medium">{s.setup}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.count}</td>
                <td className="px-3 py-2 text-right tabular-nums">{s.winRate.toFixed(1)}%</td>
                <td className={`px-3 py-2 text-right tabular-nums ${s.totalPnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{inr(s.totalPnl)}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${s.avgPnl >= 0 ? "text-emerald-500" : "text-rose-500"}`}>{inr(s.avgPnl)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-emerald-500">{inr(s.best)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-rose-500">{inr(s.worst)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

// ---------- Trade form ----------
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const TAG_OPTIONS = ["SL Hit", "TP Hit", "Exited Early", "Trailing SL", "Partial", "Scaled In", "Overnight", "Intraday"];

function TradeForm({ initial, onClose }: { initial: TradeRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const create = useServerFn(createTrade);
  const update = useServerFn(updateTrade);

  const [symbol, setSymbol] = useState(initial?.symbol ?? "");
  const [entryPrice, setEntryPrice] = useState(initial?.entry_price?.toString() ?? "");
  const [exitPrice, setExitPrice] = useState(initial?.exit_price?.toString() ?? "");
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? "");
  const [entryAt, setEntryAt] = useState(toLocalInput(initial?.entry_at) || toLocalInput(new Date().toISOString()));
  const [exitAt, setExitAt] = useState(toLocalInput(initial?.exit_at));
  const [setup, setSetup] = useState(initial?.setup ?? "");
  const [rationale, setRationale] = useState(initial?.rationale ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [outcome, setOutcome] = useState<string>(initial?.outcome ?? "");
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [showSuggest, setShowSuggest] = useState(false);

  useEffect(() => {
    if (!initial) return;
    setSymbol(initial.symbol ?? "");
    setEntryPrice(initial.entry_price?.toString() ?? "");
    setExitPrice(initial.exit_price?.toString() ?? "");
    setQuantity(initial.quantity?.toString() ?? "");
    setEntryAt(toLocalInput(initial.entry_at) || toLocalInput(new Date().toISOString()));
    setExitAt(toLocalInput(initial.exit_at));
    setSetup(initial.setup ?? "");
    setRationale(initial.rationale ?? "");
    setNotes(initial.notes ?? "");
    setOutcome(initial.outcome ?? "");
    setTags(initial.tags ?? []);
  }, [initial]);

  const suggestions = useMemo(() => {
    const s = symbol.trim().toUpperCase();
    if (!s) return [];
    return NSE_SYMBOLS
      .filter((sym) => sym.ticker.startsWith(s) || sym.name.toUpperCase().includes(s))
      .slice(0, 8);
  }, [symbol]);

  const fno = isLikelyFnO(symbol);

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        symbol: symbol.trim().toUpperCase(),
        entry_price: Number(entryPrice),
        exit_price: exitPrice ? Number(exitPrice) : null,
        quantity: Number(quantity),
        entry_at: new Date(entryAt).toISOString(),
        exit_at: exitAt ? new Date(exitAt).toISOString() : null,
        setup: setup || null,
        rationale: rationale || null,
        notes: notes || null,
        outcome: (outcome || null) as any,
        tags,
      };
      if (initial?.id) return update({ data: { ...payload, id: initial.id } });
      return create({ data: payload });
    },
    onSuccess: () => {
      toast.success(initial ? "Trade updated" : "Trade added");
      qc.invalidateQueries({ queryKey: ["trades"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Save failed"),
  });

  const submit = () => {
    if (!symbol.trim()) return toast.error("Symbol is required");
    if (fno) return toast.error("F&O tickers are not allowed — NSE equities only");
    if (!entryPrice || Number(entryPrice) <= 0) return toast.error("Entry price required");
    if (!quantity || Number(quantity) <= 0) return toast.error("Quantity required");
    if (!entryAt) return toast.error("Entry date required");
    mut.mutate();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit trade" : "New trade"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <Label className="text-xs">Symbol (NSE)</Label>
            <div className="relative">
              <Input
                value={symbol}
                onChange={(e) => { setSymbol(e.target.value.toUpperCase()); setShowSuggest(true); }}
                onBlur={() => setTimeout(() => setShowSuggest(false), 150)}
                onFocus={() => setShowSuggest(true)}
                placeholder="e.g. RELIANCE"
                className="uppercase"
              />
              {showSuggest && suggestions.length > 0 && (
                <div className="absolute z-50 mt-1 w-full rounded border bg-popover shadow-lg">
                  {suggestions.map((s) => (
                    <button
                      key={s.ticker}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent"
                      onMouseDown={(e) => { e.preventDefault(); setSymbol(s.ticker); setShowSuggest(false); }}
                    >
                      <span className="font-medium">{s.ticker}</span>
                      <span className="truncate text-muted-foreground">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {fno && (
              <div className="mt-1 flex items-center gap-1 text-[11px] text-amber-600">
                <AlertTriangle className="h-3 w-3" /> Looks like a F&O contract — this journal accepts NSE equities only.
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Entry price (₹)</Label>
            <Input type="number" step="0.05" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Exit price (₹)</Label>
            <Input type="number" step="0.05" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} placeholder="Leave blank if still open" />
          </div>
          <div>
            <Label className="text-xs">Quantity (shares)</Label>
            <Input type="number" step="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Outcome</Label>
            <Select value={outcome || "auto"} onValueChange={(v) => setOutcome(v === "auto" ? "" : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (from P&L)</SelectItem>
                <SelectItem value="win">Win</SelectItem>
                <SelectItem value="loss">Loss</SelectItem>
                <SelectItem value="breakeven">Breakeven</SelectItem>
                <SelectItem value="open">Open</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Entry date & time (IST)</Label>
            <Input type="datetime-local" value={entryAt} onChange={(e) => setEntryAt(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Exit date & time (IST)</Label>
            <Input type="datetime-local" value={exitAt} onChange={(e) => setExitAt(e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Label className="text-xs">Setup / Pattern name</Label>
            <Input value={setup} onChange={(e) => setSetup(e.target.value)} placeholder="e.g. Breakout, VCP, RS Divergence" />
          </div>

          <div className="md:col-span-2">
            <Label className="text-xs">Rationale (why you took the trade)</Label>
            <Textarea rows={3} value={rationale} onChange={(e) => setRationale(e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Label className="text-xs">Notes (learnings, mistakes)</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Label className="text-xs">Risk management tags</Label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {TAG_OPTIONS.map((t) => {
                const active = tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTags((cur) => active ? cur.filter((x) => x !== t) : [...cur, t])}
                    className={`rounded border px-2 py-0.5 text-[11px] transition ${active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={mut.isPending || fno}>
            {mut.isPending ? "Saving…" : initial ? "Save changes" : "Add trade"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- CSV export ----------
function exportCsv(trades: Computed[]) {
  if (trades.length === 0) { toast.info("Nothing to export"); return; }
  const headers = ["symbol","entry_at","exit_at","entry_price","exit_price","quantity","pnl","pnl_pct","setup","outcome","status","tags","rationale","notes"];
  const escape = (v: unknown) => {
    if (v == null) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = trades.map((t) => [
    t.symbol, t.entry_at, t.exit_at ?? "", t.entry_price, t.exit_price ?? "",
    t.quantity, t.isOpen ? "" : t.pnl.toFixed(2), t.isOpen ? "" : t.pnlPct.toFixed(2),
    t.setup ?? "", t.outcome ?? "", t.status, t.tags.join("|"), t.rationale ?? "", t.notes ?? "",
  ].map(escape).join(","));
  const blob = new Blob([headers.join(",") + "\n" + rows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `trading-journal-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
