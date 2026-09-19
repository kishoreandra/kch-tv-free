import { Bell } from "lucide-react";
import { useAlertSymbols } from "@/hooks/use-alert-symbols";

/**
 * Opens the alerts page in a new tab, pre-filled with this symbol and the
 * watchlist note so an alert can be configured without retyping anything.
 * Highlighted (amber) when the symbol already has at least one alert.
 */
export function AlertBellButton({
  ticker,
  note,
  className = "",
  size = "sm",
}: {
  ticker: string;
  note?: string;
  className?: string;
  size?: "sm" | "xs";
}) {
  const alertSymbols = useAlertSymbols();
  const sym = ticker.replace(/\.NS$/i, "").toUpperCase();
  const has = alertSymbols.has(sym);
  const icon = size === "xs" ? "h-3 w-3" : "h-3.5 w-3.5";

  const open = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const qs = new URLSearchParams({ symbol: sym });
    if (note?.trim()) qs.set("note", note.trim());
    window.open(`/price-alerts?${qs.toString()}`, "_blank", "noopener");
  };

  return (
    <button
      type="button"
      onClick={open}
      aria-label={has ? `Alerts set for ${sym}` : `Create alert for ${sym}`}
      title={has ? `${sym} has alerts — click to manage` : `Create an alert for ${sym}`}
      className={`flex shrink-0 items-center justify-center rounded transition-colors hover:bg-muted ${
        has
          ? "bg-amber-400/15 text-amber-400 ring-1 ring-amber-400/40"
          : "text-muted-foreground/40 hover:text-muted-foreground"
      } ${className}`}
    >
      <Bell className={icon} />
    </button>
  );
}
