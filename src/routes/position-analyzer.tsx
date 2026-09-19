import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarChart3, IndianRupee, Shield, Target, TrendingUp, TrendingDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ProfileMenu } from "@/components/ProfileMenu";

export const Route = createFileRoute("/position-analyzer")({
  head: () => ({
    meta: [
      { title: "Position Analyzer — NSE MultiView" },
      {
        name: "description",
        content:
          "Analyse an NSE stock position: investment value, live P&L, stop-loss risk, target reward and risk-reward ratio.",
      },
      { property: "og:title", content: "Position Analyzer — NSE MultiView" },
      {
        property: "og:description",
        content: "Investment summary, P&L, stop-loss risk and risk-reward for any NSE position.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PositionAnalyzerPage,
});

const num = (s: string): number | null => {
  if (!s.trim()) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const inr = (n: number) =>
  `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

function Field({
  label,
  icon,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </label>
      <Input
        type="number"
        inputMode="decimal"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" | "flat" }) {
  const cls =
    tone === "up"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : tone === "down"
        ? "border-rose-500/40 bg-rose-500/10 text-rose-500"
        : "border-border bg-muted/40 text-foreground";
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-semibold">{value}</div>
      {sub && <div className="text-xs opacity-80">{sub}</div>}
    </div>
  );
}

function PositionAnalyzerPage() {
  const [current, setCurrent] = useState("");
  const [buy, setBuy] = useState("");
  const [qty, setQty] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [slPct, setSlPct] = useState("");
  const [tgtPrice, setTgtPrice] = useState("");
  const [tgtPct, setTgtPct] = useState("");

  const c = num(current);
  const b = num(buy);
  const q = num(qty);

  // Price <-> percent are kept in sync from the buy price.
  const setSlPriceSync = (v: string) => {
    setSlPrice(v);
    const p = num(v);
    setSlPct(p != null && b != null && b > 0 ? (((b - p) / b) * 100).toFixed(2) : "");
  };
  const setSlPctSync = (v: string) => {
    setSlPct(v);
    const p = num(v);
    setSlPrice(p != null && b != null && b > 0 ? (b * (1 - p / 100)).toFixed(2) : "");
  };
  const setTgtPriceSync = (v: string) => {
    setTgtPrice(v);
    const p = num(v);
    setTgtPct(p != null && b != null && b > 0 ? (((p - b) / b) * 100).toFixed(2) : "");
  };
  const setTgtPctSync = (v: string) => {
    setTgtPct(v);
    const p = num(v);
    setTgtPrice(p != null && b != null && b > 0 ? (b * (1 + p / 100)).toFixed(2) : "");
  };

  const m = useMemo(() => {
    if (b == null || q == null || q <= 0) return null;
    const invested = b * q;
    const value = c != null ? c * q : null;
    const pnl = value != null ? value - invested : null;
    const pnlPct = pnl != null && invested > 0 ? (pnl / invested) * 100 : null;
    const sl = num(slPrice);
    const tgt = num(tgtPrice);
    const risk = sl != null ? (sl - b) * q : null;
    const riskPct = risk != null && invested > 0 ? (risk / invested) * 100 : null;
    const reward = tgt != null ? (tgt - b) * q : null;
    const rewardPct = reward != null && invested > 0 ? (reward / invested) * 100 : null;
    const rr = risk != null && reward != null && risk !== 0 ? Math.abs(reward / risk) : null;
    return { invested, value, pnl, pnlPct, risk, riskPct, reward, rewardPct, rr };
  }, [b, q, c, slPrice, tgtPrice]);

  return (
    <div className="min-h-screen bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-2.5">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
          ← Charts
        </Link>
        <h1 className="text-sm font-semibold">Position Analyzer</h1>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Live P&amp;L, risk and reward for a single position
        </span>
        <div className="ml-auto flex items-center gap-2">
          <ProfileMenu />
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-4 p-4 lg:grid-cols-2">
        <Card className="p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <BarChart3 className="h-4 w-4" /> Stock details
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Current price (₹)" icon={<TrendingUp className="h-3.5 w-3.5" />} value={current} onChange={setCurrent} placeholder="e.g. 150" />
            <Field label="Buy price (₹)" icon={<IndianRupee className="h-3.5 w-3.5" />} value={buy} onChange={setBuy} placeholder="e.g. 145" />
            <Field label="Quantity" icon={<BarChart3 className="h-3.5 w-3.5" />} value={qty} onChange={setQty} placeholder="e.g. 100" />
            <div />
            <Field label="Stop loss (₹)" icon={<Shield className="h-3.5 w-3.5" />} value={slPrice} onChange={setSlPriceSync} placeholder="e.g. 140" />
            <Field label="Stop loss (%)" icon={<Shield className="h-3.5 w-3.5" />} value={slPct} onChange={setSlPctSync} placeholder="e.g. 5" />
            <Field label="Target price (₹)" icon={<Target className="h-3.5 w-3.5" />} value={tgtPrice} onChange={setTgtPriceSync} placeholder="e.g. 160" />
            <Field label="Target (%)" icon={<Target className="h-3.5 w-3.5" />} value={tgtPct} onChange={setTgtPctSync} placeholder="e.g. 10" />
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Stop loss and target percentages are calculated from your buy price and stay in sync both ways.
          </p>
        </Card>

        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Investment summary</h2>
            {!m ? (
              <p className="text-sm text-muted-foreground">Enter a buy price and quantity to see the summary.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Total investment" value={inr(m.invested)} />
                <Stat label="Current value" value={m.value != null ? inr(m.value) : "—"} />
                <Stat label="Quantity" value={`${q} shares`} />
              </div>
            )}
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 text-sm font-semibold">Profit &amp; loss analysis</h2>
            {!m ? (
              <p className="text-sm text-muted-foreground">Add a current price, stop loss or target to analyse the trade.</p>
            ) : (
              <div className="grid gap-3">
                {m.pnl != null && (
                  <Stat
                    label="Current position"
                    value={inr(m.pnl)}
                    sub={m.pnlPct != null ? `${m.pnlPct >= 0 ? "+" : ""}${m.pnlPct.toFixed(2)}%` : undefined}
                    tone={m.pnl >= 0 ? "up" : "down"}
                  />
                )}
                {m.risk != null && (
                  <Stat
                    label="Stop loss scenario"
                    value={inr(m.risk)}
                    sub={m.riskPct != null ? `${m.riskPct >= 0 ? "+" : ""}${m.riskPct.toFixed(2)}%` : undefined}
                    tone={m.risk >= 0 ? "up" : "down"}
                  />
                )}
                {m.reward != null && (
                  <Stat
                    label="Target scenario"
                    value={inr(m.reward)}
                    sub={m.rewardPct != null ? `${m.rewardPct >= 0 ? "+" : ""}${m.rewardPct.toFixed(2)}%` : undefined}
                    tone={m.reward >= 0 ? "up" : "down"}
                  />
                )}
                {m.rr != null && (
                  <Stat
                    label="Risk : reward"
                    value={`1 : ${m.rr.toFixed(2)}`}
                    sub={m.rr >= 2 ? "Healthy setup" : "Below 1:2"}
                    tone={m.rr >= 2 ? "up" : "flat"}
                  />
                )}
                {m.pnl == null && m.risk == null && m.reward == null && (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <TrendingDown className="h-4 w-4" /> Add a current price, stop loss or target.
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
