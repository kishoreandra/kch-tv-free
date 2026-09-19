// Client-safe metadata shared by the alerts UI and the server evaluator.
export const LEFT_FIELDS = ["price", "ema10", "ema20", "ema50", "ema100", "ema200", "rsi14"] as const;
export const RIGHT_FIELDS = [
  "value",
  "ema10",
  "ema20",
  "ema50",
  "ema100",
  "ema200",
  "high_52w",
  "low_52w",
  "ath",
] as const;
export const OPERATORS = ["crosses_above", "crosses_below", "above", "below", "near"] as const;

export type LeftField = (typeof LEFT_FIELDS)[number];
export type RightField = (typeof RIGHT_FIELDS)[number];
export type AlertOperator = (typeof OPERATORS)[number];

export const FIELD_LABELS: Record<string, string> = {
  price: "Price",
  ema10: "EMA 10",
  ema20: "EMA 20",
  ema50: "EMA 50",
  ema100: "EMA 100",
  ema200: "EMA 200",
  rsi14: "RSI 14",
  value: "Custom value",
  high_52w: "52W high",
  low_52w: "52W low",
  ath: "All-time high",
};

export const OPERATOR_LABELS: Record<string, string> = {
  crosses_above: "crosses above",
  crosses_below: "crosses below",
  above: "is above",
  below: "is below",
  near: "touches (within %)",
};

export function describeAlertCondition(a: {
  left_field: string;
  operator: string;
  right_field: string;
  right_value: number | null;
  tolerance_pct: number | null;
}): string {
  const right =
    a.right_field === "value" ? String(a.right_value ?? "—") : FIELD_LABELS[a.right_field] ?? a.right_field;
  const op =
    a.operator === "near" ? `is within ${a.tolerance_pct ?? 1}% of` : OPERATOR_LABELS[a.operator] ?? a.operator;
  return `${FIELD_LABELS[a.left_field] ?? a.left_field} ${op} ${right}`;
}
