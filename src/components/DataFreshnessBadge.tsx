// Small "data as of <date>" indicator for the EOD pipeline. Turns amber when
// the latest stored session is older than the expected trading day, so stale
// data is never presented as current.
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { dailyDataStatus } from "@/lib/history/ingest-status.functions";

export function DataFreshnessBadge({ className = "" }: { className?: string }) {
  const statusFn = useServerFn(dailyDataStatus);
  const { data } = useQuery({
    queryKey: ["daily-data-status"],
    queryFn: () => statusFn({}),
    staleTime: 5 * 60_000,
  });
  if (!data) return null;
  return (
    <span
      className={`hidden shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] leading-tight lg:inline-block ${
        data.stale
          ? "border-amber-500/50 bg-amber-500/10 text-amber-600"
          : "border-border/60 text-muted-foreground"
      } ${className}`}
      title={data.message ?? `Expected session: ${data.expected_date}`}
    >
      {data.stale ? "⚠ " : ""}as of {data.latest_date ?? "—"}
    </span>
  );
}

