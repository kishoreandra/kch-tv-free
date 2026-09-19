import { chartUrlForSymbol, tradingViewUrlForSymbol } from "@/lib/chart-links";
import { cn } from "@/lib/utils";

interface SymbolLinkProps {
  /** Ticker or Yahoo-style symbol, e.g. "INFY" or "INFY.NS". */
  symbol: string;
  /** Optional visible text (defaults to the symbol). */
  label?: React.ReactNode;
  className?: string;
  title?: string;
}

/**
 * Renders a stock symbol as a link that opens the chart view in a new tab.
 * Stops click propagation so it can live inside clickable rows/cards.
 */
export function SymbolLink({ symbol, label, className, title }: SymbolLinkProps) {
  if (!symbol) return <span className={className}>{label ?? "—"}</span>;
  return (
    <a
      href={chartUrlForSymbol(symbol)}
      target="_blank"
      rel="noopener noreferrer"
      title={title ?? `Open ${symbol} chart in a new tab`}
      onClick={(e) => e.stopPropagation()}
      className={cn("hover:text-primary hover:underline", className)}
    >
      {label ?? symbol}
    </a>
  );
}

/** Small icon link opening the symbol's TradingView page in a new tab. */
export function TradingViewLink({ symbol, className }: { symbol: string; className?: string }) {
  if (!symbol) return null;
  return (
    <a
      href={tradingViewUrlForSymbol(symbol)}
      target="_blank"
      rel="noopener noreferrer"
      title={`Open ${symbol} on TradingView`}
      aria-label="Open on TradingView"
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground",
        className
      )}
    >
      <img
        src="https://static.tradingview.com/static/images/favicon.ico"
        alt="TradingView"
        className="h-3.5 w-3.5 rounded-sm object-contain"
      />
    </a>
  );
}
