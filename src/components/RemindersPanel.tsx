// Personal reminders: title + rich note + time, delivered to Telegram.
// Split into a form (left column) and a list (right column) so both can live
// in the alerts page layout while sharing the same query cache.

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bold, Italic, List, Plus, Search, Trash2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  listReminders,
  createReminder,
  updateReminder,
  deleteReminder,
  runRemindersNow,
  type ReminderRow,
} from "@/lib/alerts/reminders.functions";

export const REPEAT_OPTIONS = [
  { value: 0, label: "Once" },
  { value: 30, label: "Every 30 min" },
  { value: 60, label: "Hourly" },
  { value: 1440, label: "Daily" },
  { value: 10080, label: "Weekly" },
];

export const REMINDERS_KEY = ["custom-reminders"];

function toLocalInput(d: Date): string {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function localNowPlus(minutes: number): string {
  return toLocalInput(new Date(Date.now() + minutes * 60_000));
}

/** Local datetime-local string for `days` from today at `hour`:00. */
function atLocalTime(days: number, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
  return toLocalInput(d);
}

function nextMondayAt(hour: number): string {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  const delta = ((1 - d.getDay() + 7) % 7) || 7;
  d.setDate(d.getDate() + delta);
  return toLocalInput(d);
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "in 2h 10m" / "3h ago" style hint for the next send time. */
function relative(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60_000);
  const txt =
    mins < 60
      ? `${mins}m`
      : mins < 1440
        ? `${Math.floor(mins / 60)}h ${mins % 60}m`
        : `${Math.round(mins / 1440)}d`;
  return diff >= 0 ? `in ${txt}` : `${txt} ago`;
}


export function useReminders(enabled: boolean) {
  const listFn = useServerFn(listReminders);
  return useQuery({
    queryKey: REMINDERS_KEY,
    queryFn: () => listFn(),
    enabled,
    staleTime: 60_000,
  });
}

export function ReminderForm() {
  const qc = useQueryClient();
  const createFn = useServerFn(createReminder);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sendAt, setSendAt] = useState(() => localNowPlus(60));
  const [repeat, setRepeat] = useState(0);
  const [repeatUntil, setRepeatUntil] = useState("");

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          title,
          body,
          send_at: new Date(sendAt).toISOString(),
          repeat_minutes: repeat > 0 ? repeat : null,
          repeat_until: repeat > 0 && repeatUntil ? new Date(repeatUntil).toISOString() : null,
        },
      }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      setRepeatUntil("");
      qc.invalidateQueries({ queryKey: REMINDERS_KEY });
      toast.success("Reminder saved");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save reminder"),
  });

  const wrap = (before: string, after = before) =>
    setBody((b) => `${b}${b && !b.endsWith("\n") ? " " : ""}${before}text${after}`);

  return (
    <div className="space-y-2">
      <Input
        className="h-8 text-sm"
        placeholder="Title (e.g. Review open positions)"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => wrap("*")} title="Bold">
          <Bold className="h-3.5 w-3.5" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => wrap("_")} title="Italic">
          <Italic className="h-3.5 w-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => setBody((b) => `${b}${b && !b.endsWith("\n") ? "\n" : ""}• `)}
          title="Bullet"
        >
          <List className="h-3.5 w-3.5" />
        </Button>
      </div>
      <Textarea
        rows={5}
        className="text-sm"
        placeholder="Notes… *bold*, _italic_, bullets"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-xs text-muted-foreground">Send at</span>
        <Input
          type="datetime-local"
          className="h-8 text-sm"
          value={sendAt}
          onChange={(e) => setSendAt(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-1 pl-24">
        {[
          { label: "+1h", get: () => localNowPlus(60) },
          { label: "+3h", get: () => localNowPlus(180) },
          { label: "Tonight 8pm", get: () => atLocalTime(0, 20) },
          { label: "Tomorrow 9am", get: () => atLocalTime(1, 9) },
          { label: "Mon 9am", get: () => nextMondayAt(9) },
        ].map((p) => (
          <Button
            key={p.label}
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[11px]"
            onClick={() => setSendAt(p.get())}
          >
            {p.label}
          </Button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-xs text-muted-foreground">Repeat</span>
        <select
          className="h-8 flex-1 rounded border border-border bg-background px-2 text-sm"
          value={repeat}
          onChange={(e) => setRepeat(Number(e.target.value))}
        >
          {REPEAT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      {repeat > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-24 shrink-0 text-xs text-muted-foreground">Until</span>
          <Input
            type="datetime-local"
            className="h-8 text-sm"
            value={repeatUntil}
            onChange={(e) => setRepeatUntil(e.target.value)}
          />
        </div>
      )}
      <Button
        size="sm"
        className="w-full"
        disabled={!title.trim() || createMut.isPending}
        onClick={() => createMut.mutate()}
      >
        <Plus className="mr-1 h-3.5 w-3.5" /> Add reminder
      </Button>
      <p className="text-[11px] leading-snug text-muted-foreground">
        Reminders are pushed to your Telegram bot within 10 minutes of the chosen time. Repeating
        reminders roll forward to their next slot until the "Until" date (or forever if blank).
      </p>
    </div>
  );
}

export function ReminderList({ enabled }: { enabled: boolean }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateReminder);
  const deleteFn = useServerFn(deleteReminder);
  const runFn = useServerFn(runRemindersNow);
  const [q, setQ] = useState("");
  const query = useReminders(enabled);

  const invalidate = () => qc.invalidateQueries({ queryKey: REMINDERS_KEY });
  const updateMut = useMutation({
    mutationFn: (v: { id: string; enabled?: boolean; send_at?: string }) => updateFn({ data: v }),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: invalidate,
  });
  const runMut = useMutation({
    mutationFn: () => runFn(),
    onSuccess: (r: { due: number; sent: number; reason?: string }) => {
      invalidate();
      if (r.due === 0) toast.info("No reminders are due yet");
      else if (r.sent > 0) toast.success(`${r.sent} reminder(s) sent`);
      else toast.error(r.reason ?? "Delivery failed");
    },
  });

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all = (query.data ?? []) as ReminderRow[];
    if (!needle) return all;
    return all.filter(
      (r) =>
        r.title.toLowerCase().includes(needle) || (r.body ?? "").toLowerCase().includes(needle),
    );
  }, [query.data, q]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="text-xs font-semibold uppercase text-muted-foreground">
          Your reminders ({query.data?.length ?? 0})
        </h2>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-7 w-44 pl-7 text-xs"
            placeholder="Search reminders"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button size="sm" variant="outline" onClick={() => runMut.mutate()} disabled={runMut.isPending}>
          <Play className="mr-1 h-3.5 w-3.5" /> Send due now
        </Button>
      </div>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
        {query.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!query.isLoading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground">No reminders yet. Add one on the left.</p>
        )}
        {rows.map((r) => {
          const due = !r.sent_at && new Date(r.send_at).getTime() <= Date.now();
          const snooze = (mins: number) =>
            updateMut.mutate({
              id: r.id,
              send_at: new Date(Date.now() + mins * 60_000).toISOString(),
            });
          return (
          <div
            key={r.id}
            className={`rounded border px-2 py-1.5 ${
              due ? "border-amber-500/60 bg-amber-500/5" : "border-border"
            } ${r.enabled ? "" : "opacity-60"}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{r.title}</span>
              <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                {fmt(r.send_at)} · {relative(r.send_at)}
              </Badge>
              {r.repeat_minutes ? (
                <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                  {REPEAT_OPTIONS.find((o) => o.value === r.repeat_minutes)?.label ??
                    `every ${r.repeat_minutes}m`}
                </Badge>
              ) : null}
              {r.sent_at ? (
                <span className="text-[11px] text-emerald-500">sent {fmt(r.sent_at)}</span>
              ) : due ? (
                <span className="text-[11px] text-amber-500">due</span>
              ) : (
                <span className="text-[11px] text-muted-foreground">pending</span>
              )}
              <div className="ml-auto flex items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px]"
                  title="Push 10 minutes later"
                  onClick={() => snooze(10)}
                >
                  +10m
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px]"
                  title="Push 1 hour later"
                  onClick={() => snooze(60)}
                >
                  +1h
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1.5 text-[11px]"
                  title="Push to tomorrow"
                  onClick={() => snooze(1440)}
                >
                  +1d
                </Button>
                <Switch
                  checked={r.enabled}
                  onCheckedChange={(v) => updateMut.mutate({ id: r.id, enabled: v })}
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => deleteMut.mutate(r.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            {r.body && (
              <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">{r.body}</p>
            )}
          </div>
          );
        })}

      </div>
    </div>
  );
}
