// Pure evaluation of each alert kind against an OHLCV series.
// The last element of `bars` is the latest closed bar for that timeframe.

import { Bar, adrPct, ema, sma } from "./series.server";

export interface KindResult {
  holds: boolean;
  detail: string; // numbers behind the trigger, for the Telegram message
}

const fmt = (n: number | null | undefined, digits = 2): string =>
  n == null || !Number.isFinite(n)
    ? "—"
    : n.toLocaleString("en-IN", { maximumFractionDigits: digits });

const no = (detail = "insufficient data"): KindResult => ({ holds: false, detail });

export function evaluateKind(
  kind: string,
  params: Record<string, unknown>,
  bars: Bar[],
): KindResult | null {
  const p = params ?? {};
  const num = (k: string, d: number) => {
    const v = Number(p[k]);
    return Number.isFinite(v) ? v : d;
  };
  const str = (k: string, d: string) => (p[k] == null ? d : String(p[k]));

  if (bars.length < 5) return no();
  const i = bars.length - 1;
  const j = i - 1;
  const last = bars[i];
  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume);

  switch (kind) {
    case "price_level": {
      const target = num("target", 0);
      const dir = str("dir", "above");
      if (!Number.isFinite(target) || target <= 0) return no("no target price set");
      const holds = dir === "above" ? closes[i] > target : closes[i] < target;
      return {
        holds,
        detail: `Closed ${dir} ₹${fmt(target)} (closed at ₹${fmt(closes[i])})`,
      };
    }
    case "ema_cross": {
      const len = num("ema", 50);
      const dir = str("dir", "above");
      const e = ema(closes, len);
      if (e[i] == null || e[j] == null) return no();
      const holds =
        dir === "above"
          ? closes[j] <= (e[j] as number) && closes[i] > (e[i] as number)
          : closes[j] >= (e[j] as number) && closes[i] < (e[i] as number);
      return { holds, detail: `close ${fmt(closes[i])} vs EMA${len} ${fmt(e[i])}` };
    }
    case "ema_touch": {
      const len = num("ema", 10);
      const tol = Math.abs(num("tolerance", 0.5));
      const e = ema(closes, len);
      const level = e[i];
      if (level == null) return no();
      const band = (level as number) * (tol / 100);
      const lo = last.low ?? closes[i];
      const hi = last.high ?? closes[i];
      const holds = lo <= (level as number) + band && hi >= (level as number) - band;
      return {
        holds,
        detail: `EMA${len} ${fmt(level)} · bar ${fmt(lo)}–${fmt(hi)} · close ${fmt(closes[i])}`,
      };
    }
    case "ema_ema_cross": {
      const fast = num("fast", 50);
      const slow = num("slow", 200);
      const dir = str("dir", "above");
      const f = ema(closes, fast);
      const s = ema(closes, slow);
      if (f[i] == null || s[i] == null || f[j] == null || s[j] == null) return no();
      const holds =
        dir === "above"
          ? (f[j] as number) <= (s[j] as number) && (f[i] as number) > (s[i] as number)
          : (f[j] as number) >= (s[j] as number) && (f[i] as number) < (s[i] as number);
      const cross =
        fast < slow && dir === "above"
          ? " — golden cross"
          : fast < slow && dir === "below"
            ? " — death cross"
            : "";
      return { holds, detail: `EMA${fast} ${fmt(f[i])} vs EMA${slow} ${fmt(s[i])}${cross}` };

    }
    case "near_high":
    case "fresh_high": {
      const ref = str("ref", "52w");
      const window = ref === "ath" ? bars.length : Math.min(bars.length, 252);
      const slice = bars.slice(bars.length - window);
      const highs = slice.map((b) => b.high ?? b.close);
      const priorHigh = Math.max(...highs.slice(0, -1));
      const refHigh = Math.max(...highs);
      const label = ref === "ath" ? `high of last ${window} bars` : "52-week high";
      if (kind === "fresh_high") {
        const holds = (last.high ?? last.close) >= priorHigh;
        return { holds, detail: `high ${fmt(last.high ?? last.close)} vs prior ${label} ${fmt(priorHigh)}` };
      }
      const pct = num("pct", 3);
      const away = ((refHigh - last.close) / refHigh) * 100;
      return { holds: away <= pct, detail: `${fmt(away)}% below ${label} ${fmt(refHigh)}` };
    }
    case "pullback_ema": {
      const len = num("ema", 21);
      const extPct = num("extended_pct", 10);
      const lookback = Math.max(2, num("lookback", 20));
      const touch = num("touch_pct", 2);
      const e = ema(closes, len);
      if (e[i] == null) return no();
      let wasExtended = false;
      let peak = 0;
      for (let k = Math.max(len, i - lookback); k < i; k++) {
        const ev = e[k];
        if (ev == null) continue;
        const d = ((closes[k] - ev) / ev) * 100;
        peak = Math.max(peak, d);
        if (d >= extPct) wasExtended = true;
      }
      const now = ((closes[i] - (e[i] as number)) / (e[i] as number)) * 100;
      const holds = wasExtended && Math.abs(now) <= touch;
      return {
        holds,
        detail: `peaked ${fmt(peak)}% above EMA${len}, now ${fmt(now)}% (EMA ${fmt(e[i])})`,
      };
    }
    case "extension": {
      const len = num("ema", 21);
      const pct = num("pct", 20);
      const e = ema(closes, len);
      if (e[i] == null) return no();
      const d = ((closes[i] - (e[i] as number)) / (e[i] as number)) * 100;
      return { holds: d >= pct, detail: `${fmt(d)}% above EMA${len} (${fmt(e[i])})` };
    }
    case "trend_break": {
      const e = ema(closes, 200);
      if (e[i] == null) return no("needs 200 bars of history");
      const holds = closes[i] < (e[i] as number);
      return { holds, detail: `close ${fmt(closes[i])} vs EMA200 ${fmt(e[i])}` };
    }
    case "volume_surge": {
      const mult = num("mult", 2);
      const avgLen = Math.max(5, num("avg_len", 20));
      const minCr = num("min_turnover_cr", 5);
      const avg = sma(vols, avgLen, j);
      if (!avg) return no();
      const ratio = vols[i] / avg;
      const turnoverCr = (last.turnover ?? last.close * vols[i]) / 1e7;
      const holds = ratio >= mult && turnoverCr >= minCr;
      return { holds, detail: `volume ${fmt(ratio)}x avg, turnover ₹${fmt(turnoverCr)} Cr` };
    }
    case "volume_dryup": {
      const mult = num("mult", 0.6);
      const days = Math.max(1, num("days", 3));
      const avgLen = Math.max(5, num("avg_len", 20));
      const avg = sma(vols, avgLen, i - days);
      if (!avg) return no();
      let holds = true;
      let worst = 0;
      for (let k = i - days + 1; k <= i; k++) {
        const r = vols[k] / avg;
        worst = Math.max(worst, r);
        if (r > mult) holds = false;
      }
      return { holds, detail: `max ${fmt(worst)}x avg over last ${days} bars` };
    }
    case "pocket_pivot": {
      const lookback = Math.max(3, num("lookback", 10));
      if (i < lookback + 1) return no();
      let maxDownVol = 0;
      for (let k = i - lookback; k < i; k++) {
        if (closes[k] < closes[k - 1]) maxDownVol = Math.max(maxDownVol, vols[k]);
      }
      const ma50 = sma(closes, Math.min(50, bars.length), i);
      const up = closes[i] > closes[i - 1];
      const holds = up && maxDownVol > 0 && vols[i] > maxDownVol && ma50 != null && closes[i] < ma50;
      return {
        holds,
        detail: `up bar volume ${fmt(vols[i], 0)} vs max down-bar ${fmt(maxDownVol, 0)}, MA50 ${fmt(ma50)}`,
      };
    }
    case "dist_acc": {
      const side = str("side", "distribution");
      const window = Math.max(5, num("window", 25));
      const threshold = num("threshold", 5);
      if (i < window) return no();
      let count = 0;
      for (let k = i - window + 1; k <= i; k++) {
        const down = closes[k] < closes[k - 1];
        const risingVol = vols[k] > vols[k - 1];
        if (risingVol && (side === "distribution" ? down : !down)) count++;
      }
      return { holds: count >= threshold, detail: `${count} ${side} bars in last ${window}` };
    }
    case "gap_reversal": {
      const gapPct = num("gap_pct", 5);
      const len = num("ema", 50);
      const e = ema(closes, len);
      if (e[i] == null || last.open == null) return no();
      const gap = ((last.open - closes[i - 1]) / closes[i - 1]) * 100;
      const wasDown = e[j] != null && closes[j] < (e[j] as number);
      const holds = wasDown && gap >= gapPct && closes[i] > (e[i] as number);
      return { holds, detail: `gap ${fmt(gap)}%, close ${fmt(closes[i])} vs EMA${len} ${fmt(e[i])}` };
    }
    case "adr_contraction": {
      const weeks = Math.max(2, num("weeks", 10));
      const bpw = 5; // daily bars per week; weekly series uses 1 handled below
      const lookback = Math.min(bars.length - 21, Math.round(weeks * bpw));
      if (lookback < 5) return no();
      const current = adrPct(bars, i);
      if (current == null) return no();
      let min = current;
      for (let k = i - lookback; k < i; k++) {
        const v = adrPct(bars, k);
        if (v != null) min = Math.min(min, v);
      }
      return { holds: current <= min + 1e-9, detail: `ADR% ${fmt(current)} — lowest in ${lookback} bars` };
    }
    case "tight_range": {
      const days = Math.max(3, num("days", 15));
      const pct = num("pct", 10);
      if (i < days) return no();
      const slice = closes.slice(i - days + 1);
      const hi = Math.max(...slice);
      const lo = Math.min(...slice);
      const range = ((hi - lo) / lo) * 100;
      return { holds: range <= pct, detail: `${days}-bar close range ${fmt(range)}%` };
    }
    case "volume_record": {
      const scope = str("scope", "1y");
      const window = scope === "all" ? bars.length : Math.min(bars.length, 252);
      const slice = vols.slice(vols.length - window);
      const priorMax = Math.max(...slice.slice(0, -1));
      const holds = vols[i] >= priorMax && vols[i] > 0;
      const label = scope === "all" ? `available history (${window} bars)` : "trailing year";
      return { holds, detail: `volume ${fmt(vols[i], 0)} vs prior max ${fmt(priorMax, 0)} in ${label}` };
    }
    default:
      return null;
  }
}
