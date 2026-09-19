import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getOhlc } from "@/lib/ohlc.functions";

interface Props {
  symbol: string;
  height?: number;
  range?: string;
  interval?: string;
}

interface Loaded {
  closes: number[];
  changePct: number;
}

// Tiny in-memory cache shared across cards (per session)
const cache = new Map<string, Loaded>();
const inflight = new Map<string, Promise<Loaded>>();

export function MiniChart({ symbol, height = 64, range = "1mo", interval = "D" }: Props) {
  const fetcher = useServerFn(getOhlc);
  const [data, setData] = useState<Loaded | null>(() => cache.get(`${symbol}|${interval}|${range}`) ?? null);
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || data) return;
    let abort = false;
    const key = `${symbol}|${interval}|${range}`;
    const cached = cache.get(key);
    if (cached) {
      setData(cached);
      return;
    }
    let p = inflight.get(key);
    if (!p) {
      p = fetcher({ data: { symbol, interval, range } })
        .then((res) => {
          const closes = res.candles.map((c) => c.close);
          const changePct =
            closes.length >= 2 ? ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100 : 0;
          const out = { closes, changePct };
          cache.set(key, out);
          return out;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    p.then((out) => {
      if (!abort) setData(out);
    }).catch((e) => {
      if (!abort) setErr(e?.message ?? "error");
    });
    return () => {
      abort = true;
    };
  }, [visible, symbol, interval, range, fetcher, data]);

  return (
    <div ref={ref} style={{ height }} className="relative w-full">
      {err && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground">
          —
        </div>
      )}
      {!err && !data && (
        <div className="absolute inset-0 animate-pulse rounded bg-muted/40" />
      )}
      {data && data.closes.length > 1 && <Sparkline closes={data.closes} changePct={data.changePct} height={height} />}
    </div>
  );
}

function Sparkline({ closes, changePct, height }: { closes: number[]; changePct: number; height: number }) {
  const w = 200; // viewBox width; svg scales to container
  const h = height;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const stepX = w / (closes.length - 1);
  const pts = closes.map((c, i) => {
    const x = i * stepX;
    const y = h - 4 - ((c - min) / span) * (h - 8);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const up = changePct >= 0;
  const stroke = up ? "hsl(150 70% 45%)" : "hsl(0 75% 55%)";
  const fill = up ? "hsl(150 70% 45% / 0.12)" : "hsl(0 75% 55% / 0.12)";
  const linePath = `M${pts.join(" L")}`;
  const areaPath = `${linePath} L${w.toFixed(1)},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function formatChangePct(p: number): string {
  const sign = p >= 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}
