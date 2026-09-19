import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { startOfWeek, endOfWeek, startOfMonth, format } from "date-fns";
import { useServerFn } from "@tanstack/react-start";
import { getJournalNote, upsertJournalNote } from "@/lib/journal/notes.functions";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Weekly & Monthly Review — NSE MultiView" },
      { name: "description", content: "Write and review your weekly and monthly trading notes for NSE equities in one place." },
      { property: "og:title", content: "Weekly & Monthly Review — NSE MultiView" },
      { property: "og:description", content: "Weekly and monthly trading review notes for NSE equities." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReviewPage,
});

function ReviewPage() {
  const [content, setContent] = useState("");
  const [preview, setPreview] = useState(false);
  const [saving, setSaving] = useState(false);

  const getNoteFn = useServerFn(getJournalNote);
  const saveNoteFn = useServerFn(upsertJournalNote);

  const periodStartWeek = format(startOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");
  const periodEndWeek = format(endOfWeek(new Date(), { weekStartsOn: 1 }), "yyyy-MM-dd");

  useEffect(() => {
    (async () => {
      try {
        const note = await getNoteFn({ data: { period_type: "weekly", period_start: periodStartWeek } });
        if (note && note.content) {
          setContent(note.content as string);
        } else {
          // Auto-create an empty weekly note on first visit
          try {
            await saveNoteFn({ data: { period_type: "weekly", period_start: periodStartWeek, period_end: periodEndWeek, content: "" } });
            setContent("");
          } catch (e) {
            // ignore creation error for now
            setContent("");
          }
        }
      } catch (e) {
        // ignore fetch error for now
      }
    })();
  }, [getNoteFn, saveNoteFn, periodStartWeek, periodEndWeek]);

  const previewHtml = useMemo(() => {
    const escapeHtml = (s: string) =>
      s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    return escapeHtml(content)
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .split(/\n\n+/)
      .map((p) => `<p>${p.replace(/\n/g, "<br />")}</p>`)
      .join("");
  }, [content]);

  const save = async () => {
    setSaving(true);
    try {
      await saveNoteFn({ data: { period_type: "weekly", period_start: periodStartWeek, period_end: periodEndWeek, content } });
    } catch (e) {
      // TODO: handle error
    }
    setSaving(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Weekly / Monthly Review</h1>
        <div className="flex items-center gap-2">
          <Button onClick={() => setPreview((p) => !p)}>{preview ? "Edit" : "Preview"}</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          {!preview ? (
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="h-64 w-full" />
          ) : (
            <div className="prose max-w-none p-4 border rounded bg-card" dangerouslySetInnerHTML={{ __html: previewHtml }} />
          )}
        </div>

        <aside>
          <div className="space-y-2">
            <div className="rounded border bg-card p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">This week's note</div>
              <div className="mt-1 text-sm">{content.slice(0, 100) || "(empty)"}</div>
            </div>
            <div className="rounded border bg-card p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Quick stats</div>
              <div className="mt-2 text-sm">Use the Dashboard to see closed trades for context below.</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// Intentionally no default export — router uses the `Route` export above.
