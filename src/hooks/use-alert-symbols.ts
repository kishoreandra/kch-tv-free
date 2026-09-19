import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPriceAlerts } from "@/lib/alerts/price-alerts.functions";
import { useAuth } from "@/hooks/use-auth";

/** Symbols (bare NSE tickers) that already have at least one technical alert. */
export function useAlertSymbols(): Set<string> {
  const { user } = useAuth();
  const listFn = useServerFn(listPriceAlerts);
  const { data } = useQuery({
    queryKey: ["price-alerts"],
    queryFn: () => listFn(),
    enabled: !!user,
    staleTime: 120_000,
  });
  return useMemo(
    () => new Set((data ?? []).map((a) => String(a.symbol ?? "").toUpperCase())),
    [data],
  );
}
