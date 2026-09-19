import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { evaluateAlert, describeAlert, type Alert } from "@/lib/alerts";

interface Candle { time: number; close: number }

interface Params {
  symbol: string;
  interval: string;
  candles: Candle[] | undefined;
  alerts: Alert[];
  soundEnabled?: boolean;
  // Called after every evaluation that advanced past a new closed bar.
  // `fired` true means user-visible alert was raised.
  onUpdate: (alertId: string, lastBarTime: number, fired: boolean) => void;
}

let audioCtx: AudioContext | null = null;
function beep() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = 880;
    g.gain.value = 0.05;
    o.start();
    setTimeout(() => { o.stop(); }, 180);
  } catch {}
}

function notify(title: string, body: string) {
  toast(title, { description: body });
  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try { new Notification(title, { body }); } catch {}
  }
}

export function useAlerts({ symbol, interval, candles, alerts, soundEnabled, onUpdate }: Params) {
  const seenRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!candles || candles.length < 3) return;
    const latestClosed = candles[candles.length - 2];
    if (!latestClosed) return;

    for (const a of alerts) {
      if (!a.enabled) continue;
      if (a.symbol !== symbol || a.interval !== interval) continue;

      const seen = seenRef.current.get(a.id) ?? a.lastBarTime ?? 0;
      if (latestClosed.time <= seen) continue;

      // First exposure to data: record baseline, suppress history fires.
      if (seen === 0) {
        seenRef.current.set(a.id, latestClosed.time);
        onUpdate(a.id, latestClosed.time, false);
        continue;
      }

      const { fired, barTime } = evaluateAlert(a, candles);
      const t = barTime ?? latestClosed.time;
      seenRef.current.set(a.id, t);
      if (fired) {
        const desc = describeAlert(a);
        notify(
          `Alert · ${symbol.replace(/\.NS$/, "")} · ${interval}`,
          desc + (a.note ? ` — ${a.note}` : ""),
        );
        if (soundEnabled) beep();
      }
      onUpdate(a.id, t, fired);
    }
  }, [candles, alerts, symbol, interval, soundEnabled, onUpdate]);
}

export function requestNotifPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}
