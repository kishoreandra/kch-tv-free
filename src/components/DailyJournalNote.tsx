import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, Flame, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { getJournalNote, upsertJournalNote, listJournalNotes } from "@/lib/journal/notes.functions";
import { istNow, isTradingDay } from "@/lib/history/nse-calendar";

const LOOKBACK_DAYS = 30;
const DISMISS_KEY = "nse-mv:daily-note-prompt";

const TEMPLATE = `Market view:
Trades taken / avoided:
What worked:
What to fix tomorrow:`;

function addDays(iso: string, delta: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** Most recent trading days (newest first), including today when it's a session. */
function recentTradingDays(todayIso: string, count: number): string[] {
  const out: string[] = [];
  let cur = todayIso;
  for (let i = 0; i < LOOKBACK_DAYS * 2 && out.length < count; i++) {
    if (isTradingDay(cur)) out.push(cur);
    cur = addDays(cur, -1);
  }
  return out;
}

export function DailyJournalNote() {
  const qc = useQueryClient();
  const getNote = useServerFn(getJournalNote);
  const listNotes = useServerFn(listJournalNotes);
  const upsertNote = useServerFn(upsertJournalNote);

  const { date: todayIst, minuteOfDay } = useMemo(() => istNow(), []);
  const isSession = isTradingDay(todayIst);
  // The day the note is required for: today if it's a session, else the last one.
  const targetDay = useMemo(
    () => (isSession ? todayIst : recentTradingDays(todayIst, 1)[0] ?? todayIst),
    [isSession, todayIst],
  );
  const days = useMemo(() => recentTradingDays(todayIst, 14), [todayIst]);
  const from = days[days.length - 1] ?? targetDay;

  const noteQuery = useQuery({
    queryKey: ["journal-daily-note", targetDay],
    queryFn: () => getNote({ data: { period_type: "daily", period_start: targetDay } }),
  });

  const historyQuery = useQuery({
    queryKey: ["journal-daily-notes", from, todayIst],
    queryFn: () => listNotes({ data: { period_type: "daily", from, to: todayIst } }),
  });

  const [content, setContent] = useState("");
  const [dirty, setDirty] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);

  useEffect(() => {
    if (noteQuery.data !== undefined && !dirty) {
      setContent((noteQuery.data as any)?.content ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteQuery.data, targetDay]);

  const saved = ((noteQuery.data as any)?.content ?? "").trim().length > 0;

  const doneSet = useMemo(() => {
    const set = new Set<string>();
    for (const n of historyQuery.data ?? []) {
      if ((n.content ?? "").trim().length > 0) set.add(n.period_start);
    }
    return set;
  }, [historyQuery.data]);

  const streak = useMemo(() => {
    let s = 0;
    for (const d of days) {
      // Today can still be pending before the close — don't break the streak.
      if (d === todayIst && !doneSet.has(d)) continue;
      if (doneSet.has(d)) s++;
      else break;
    }
    return s;
  }, [days, doneSet, todayIst]);

  const missed = useMemo(
    () => days.filter((d) => d !== targetDay && !doneSet.has(d)),
    [days, doneSet, targetDay],
  );

  // After 15:30 IST on a session day (or any time on a non-session day for the
  // last session), a missing note is "due".
  const due = !saved && (!isSession || minuteOfDay >= 15 * 60 + 30);

  useEffect(() => {
    if (!due || noteQuery.isLoading) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === targetDay) return;
    } catch {}
    setPromptOpen(true);
  }, [due, noteQuery.isLoading, targetDay]);

  const saveMut = useMutation({
    mutationFn: async (text: string) =>
      upsertNote({
        data: {
          id: (noteQuery.data as any)?.id ?? undefined,
          period_type: "daily",
          period_start: targetDay,
          period_end: targetDay,
          content: text,
        },
      }),
    onSuccess: () => {
      setDirty(false);
      toast.success("Daily note saved");
      setPromptOpen(false);
      try { localStorage.setItem(DISMISS_KEY, targetDay); } catch {}
      qc.invalidateQueries({ queryKey: ["journal-daily-note", targetDay] });
      qc.invalidateQueries({ queryKey: ["journal-daily-notes"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save note"),
  });

  const editor = (
    <>
      <Textarea
        rows={6}
        value={content}
        placeholder={TEMPLATE}
        onChange={(e) => { setContent(e.target.value); setDirty(true); }}
        className="text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          disabled={saveMut.isPending || content.trim().length === 0}
          onClick={() => saveMut.mutate(content)}
        >
          {saveMut.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
          Save note
        </Button>
        {!content.trim() && (
          <Button size="sm" variant="outline" onClick={() => { setContent(TEMPLATE); setDirty(true); }}>
            Use template
          </Button>
        )}
        {saved && !dirty && <span className="text-xs text-emerald-500">Logged ✓</span>}
      </div>
    </>
  );

  return (
    <>
      <section className={`rounded border p-4 ${due ? "border-amber-500/60 bg-amber-500/5" : "bg-card"}`}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Daily note — {targetDay}</h2>
          {due && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-500">
              <AlertTriangle className="h-3 w-3" /> Required
            </span>
          )}
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Flame className="h-3.5 w-3.5 text-orange-500" /> {streak}-day streak
            {missed.length > 0 && <span className="ml-2">· {missed.length} missed (last 14)</span>}
          </span>
        </div>
        {noteQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          editor
        )}
        {missed.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {missed.slice(0, 10).map((d) => (
              <span key={d} className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                {d}
              </span>
            ))}
          </div>
        )}
      </section>

      <Dialog open={promptOpen} onOpenChange={(o) => {
        setPromptOpen(o);
        if (!o) { try { localStorage.setItem(DISMISS_KEY, targetDay); } catch {} }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Log your note for {targetDay}</DialogTitle>
            <DialogDescription>
              A short daily note is required on NSE trading days. Two lines are enough.
            </DialogDescription>
          </DialogHeader>
          {editor}
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setPromptOpen(false)}>Later</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
