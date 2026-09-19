import { Settings, CandlestickChart } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import type { ChartConfig, ChartType, VolumeV2Settings } from "@/components/LightweightChart";
import { DEFAULT_CHART_CONFIG, DEFAULT_VOLUME_V2 } from "@/components/LightweightChart";
import { NSE_SYMBOLS, findSymbol } from "@/data/nse-symbols";

interface Props {
  value: ChartConfig;
  onChange: (next: ChartConfig) => void;
}

const TYPES: { id: ChartType; label: string }[] = [
  { id: "candles", label: "Candles" },
  { id: "heikin-ashi", label: "Heikin-Ashi" },
  { id: "bars", label: "Bars (OHLC)" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
];

const UP_SWATCHES = ["#22c55e", "#16a34a", "#10b981", "#34d399", "#84cc16"];
const DOWN_SWATCHES = ["#ef4444", "#dc2626", "#f43f5e", "#f97316", "#a855f7"];
const LINE_SWATCHES = ["#3b82f6", "#6366f1", "#a855f7", "#06b6d4", "#eab308"];
const RS_SWATCHES = ["#eab308", "#f59e0b", "#06b6d4", "#a855f7", "#22c55e"];

// Common benchmarks. CNX 500 = ^CRSLDX (Nifty 500).
const BENCHMARK_PRESETS: { yahoo: string; label: string }[] = [
  { yahoo: "^CRSLDX", label: "Nifty 500 (CNX 500)" },
  { yahoo: "^NSEI", label: "Nifty 50" },
  { yahoo: "^NSEBANK", label: "Bank Nifty" },
  { yahoo: "^NSMIDCP", label: "Nifty Next 50" },
  { yahoo: "^NSEMDCP50", label: "Nifty Midcap 100" },
  { yahoo: "^CNXIT", label: "Nifty IT" },
];

export function ChartSettingsMenu({ value, onChange }: Props) {
  const set = <K extends keyof ChartConfig>(k: K, v: ChartConfig[K]) =>
    onChange({ ...value, [k]: v });

  const [benchQuery, setBenchQuery] = useState("");
  const benchMatches = benchQuery.trim()
    ? NSE_SYMBOLS.filter((s) => {
        const q = benchQuery.trim().toLowerCase();
        return (
          s.ticker.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.yahoo.toLowerCase().includes(q)
        );
      }).slice(0, 6)
    : [];

  const currentBench = findSymbol(value.rsSymbol);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <CandlestickChart className="h-3.5 w-3.5" />
          Chart
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 max-h-[80vh] overflow-y-auto">
        <div className="space-y-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Chart type
            </p>
            <div className="grid grid-cols-2 gap-1">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => set("chartType", t.id)}
                  className={`rounded border px-2 py-1.5 text-xs transition-colors ${
                    value.chartType === t.id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <Row label="Log scale (price axis)">
              <Switch
                checked={value.logScale}
                onCheckedChange={(v) => set("logScale", Boolean(v))}
              />
            </Row>
            <Row label="Show volume">
              <Switch
                checked={value.showVolume}
                onCheckedChange={(v) => set("showVolume", Boolean(v))}
              />
            </Row>
            {value.showVolume && (
              <div className="pl-1">
                <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Volume opacity</span>
                  <span>{Math.round(value.volumeOpacity * 100)}%</span>
                </div>
                <Slider
                  value={[Math.round(value.volumeOpacity * 100)]}
                  min={5}
                  max={100}
                  step={5}
                  onValueChange={([v]) => set("volumeOpacity", v / 100)}
                />
              </div>
            )}
            {value.showVolume && (
              <div className="space-y-2 pl-1">
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Volume shape</div>
                <div className="grid grid-cols-3 gap-1">
                  {([
                    { id: "histogram", label: "Histogram" },
                    { id: "bar", label: "Bar" },
                    { id: "line", label: "Line" },
                  ] as const).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => set("volumeShape", m.id)}
                      className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                        (value.volumeShape ?? "histogram") === m.id
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Volume style</div>
                <div className="grid grid-cols-2 gap-1">
                  {([
                    { id: "v1", label: "Simple (v1)" },
                    { id: "v2", label: "Advanced (v2)" },
                  ] as const).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => set("volumeStyle", m.id)}
                      className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                        (value.volumeStyle ?? "v1") === m.id
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {value.volumeStyle === "v2" && <VolumeV2Panel value={value} onChange={onChange} />}
                <Row label={`Volume MA (${value.volumeMALength ?? 10})`}>
                  <Switch
                    checked={Boolean(value.showVolumeMA)}
                    onCheckedChange={(v) => set("showVolumeMA", Boolean(v))}
                  />
                </Row>
                {value.showVolumeMA && (
                  <div className="flex items-center gap-2 pl-1">
                    <input
                      type="number"
                      min={2}
                      max={200}
                      value={value.volumeMALength ?? 10}
                      onChange={(e) => set("volumeMALength", Math.max(2, Number(e.target.value) || 10))}
                      className="h-7 w-16 rounded border border-border bg-background px-2 text-[11px]"
                    />
                    <input
                      type="color"
                      value={value.volumeMAColor ?? "#ffffff"}
                      onChange={(e) => set("volumeMAColor", e.target.value)}
                      className="h-7 w-8 cursor-pointer rounded border border-border bg-background"
                    />
                    <span className="text-[10px] text-muted-foreground">period / color</span>
                  </div>
                )}
              </div>
            )}
            <div className="space-y-2 border-t border-border/60 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Labels
              </p>
              <Row label="RS Rating badge">
                <Switch
                  checked={Boolean(value.showRsRatingLabel)}
                  onCheckedChange={(v) => set("showRsRatingLabel", Boolean(v))}
                />
              </Row>
              <Row label="EPS growth badge">
                <Switch
                  checked={Boolean(value.showEpsLabel)}
                  onCheckedChange={(v) => set("showEpsLabel", Boolean(v))}
                />
              </Row>
              <Row label="Swing high / low prices">
                <Switch
                  checked={Boolean(value.showSwingLabels)}
                  onCheckedChange={(v) => set("showSwingLabels", Boolean(v))}
                />
              </Row>
              {value.showSwingLabels && (
                <div className="flex items-center gap-2 pl-1">
                  <DraftNumber
                    value={value.swingStrength ?? 5}
                    min={2}
                    max={30}
                    fallback={5}
                    onCommit={(n) => set("swingStrength", n)}
                  />
                  <span className="text-[10px] text-muted-foreground">bars each side</span>
                  <DraftNumber
                    value={value.swingMaxLabels ?? 10}
                    min={2}
                    max={40}
                    fallback={10}
                    onCommit={(n) => set("swingMaxLabels", n)}
                  />
                  <span className="text-[10px] text-muted-foreground">labels</span>
                </div>
              )}
            </div>

            <div className="space-y-2 border-t border-border/60 pt-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Key price levels
              </p>
              <Row label="52-week high line">
                <Switch
                  checked={Boolean(value.show52wHighLine)}
                  onCheckedChange={(v) => set("show52wHighLine", Boolean(v))}
                />
              </Row>
              <Row label="52-week low line">
                <Switch
                  checked={Boolean(value.show52wLowLine)}
                  onCheckedChange={(v) => set("show52wLowLine", Boolean(v))}
                />
              </Row>
              <Row label="All-time high line">
                <Switch
                  checked={Boolean(value.showAthLine)}
                  onCheckedChange={(v) => set("showAthLine", Boolean(v))}
                />
              </Row>
              <Row label="All-time low line">
                <Switch
                  checked={Boolean(value.showAtlLine)}
                  onCheckedChange={(v) => set("showAtlLine", Boolean(v))}
                />
              </Row>
            </div>


            <div className="space-y-2 border-t border-border/60 pt-2">
              <Row label="Volume profile (right)">
                <Switch
                  checked={Boolean(value.showVolumeProfile)}
                  onCheckedChange={(v) => set("showVolumeProfile", Boolean(v))}
                />
              </Row>
              {value.showVolumeProfile && (
                <div className="space-y-2 pl-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={6}
                      max={120}
                      value={value.vpBins ?? 40}
                      onChange={(e) => set("vpBins", Math.max(6, Math.min(120, Number(e.target.value) || 40)))}
                      className="h-7 w-16 rounded border border-border bg-background px-2 text-[11px]"
                    />
                    <span className="text-[10px] text-muted-foreground">rows</span>
                    <input
                      type="color"
                      value={value.vpColor ?? "#94a3b8"}
                      onChange={(e) => set("vpColor", e.target.value)}
                      className="h-7 w-8 cursor-pointer rounded border border-border bg-background"
                    />
                    <input
                      type="color"
                      value={value.vpPocColor ?? "#f59e0b"}
                      onChange={(e) => set("vpPocColor", e.target.value)}
                      className="h-7 w-8 cursor-pointer rounded border border-border bg-background"
                    />
                    <span className="text-[10px] text-muted-foreground">bars / POC</span>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Width</span>
                      <span>{value.vpWidthPct ?? 18}%</span>
                    </div>
                    <Slider
                      value={[value.vpWidthPct ?? 18]}
                      min={5}
                      max={45}
                      step={1}
                      onValueChange={([v]) => set("vpWidthPct", v)}
                    />
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>Opacity</span>
                      <span>{Math.round((value.vpOpacity ?? 0.45) * 100)}%</span>
                    </div>
                    <Slider
                      value={[Math.round((value.vpOpacity ?? 0.45) * 100)]}
                      min={10}
                      max={100}
                      step={5}
                      onValueChange={([v]) => set("vpOpacity", v / 100)}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="pl-1">
              <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
                <span>Right bar offset</span>
                <span>{value.rightBarOffset ?? 10} bars</span>
              </div>
              <Slider
                value={[value.rightBarOffset ?? 10]}
                min={0}
                max={40}
                step={1}
                onValueChange={([v]) => set("rightBarOffset", v)}
              />
            </div>
          </div>

          <Separator />

          {(value.chartType === "candles" ||
            value.chartType === "bars" ||
            value.chartType === "heikin-ashi") && (
            <>
              <ColorPicker
                label="Up color"
                value={value.upColor}
                swatches={UP_SWATCHES}
                onChange={(c) => set("upColor", c)}
              />
              <ColorPicker
                label="Down color"
                value={value.downColor}
                swatches={DOWN_SWATCHES}
                onChange={(c) => set("downColor", c)}
              />
            </>
          )}
          {(value.chartType === "line" || value.chartType === "area") && (
            <ColorPicker
              label="Line color"
              value={value.lineColor}
              swatches={LINE_SWATCHES}
              onChange={(c) => set("lineColor", c)}
            />
          )}

          <Separator />

          <div className="space-y-2">
            <Row label="IBD-style benchmark overlay">
              <Switch
                checked={value.rsOverlay}
                onCheckedChange={(v) => set("rsOverlay", Boolean(v))}
              />
            </Row>
            {value.rsOverlay && (
              <div className="space-y-2 pl-1">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Benchmark
                  </div>
                  <div className="mb-1 flex flex-wrap gap-1">
                    {BENCHMARK_PRESETS.map((b) => (
                      <button
                        key={b.yahoo}
                        type="button"
                        onClick={() => set("rsSymbol", b.yahoo)}
                        className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                          value.rsSymbol === b.yahoo
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                  <div className="mb-1 text-[10px] text-muted-foreground">
                    Active:{" "}
                    <span className="font-mono text-foreground">{value.rsSymbol}</span>
                    {currentBench && (
                      <span className="ml-1">· {currentBench.name}</span>
                    )}
                  </div>
                  <Input
                    placeholder="Search any NSE symbol or paste Yahoo ticker…"
                    value={benchQuery}
                    onChange={(e) => setBenchQuery(e.target.value)}
                    className="h-7 text-xs"
                  />
                  {benchMatches.length > 0 && (
                    <div className="mt-1 max-h-40 overflow-y-auto rounded border border-border">
                      {benchMatches.map((s) => (
                        <button
                          key={s.yahoo}
                          type="button"
                          onClick={() => {
                            set("rsSymbol", s.yahoo);
                            setBenchQuery("");
                          }}
                          className="block w-full px-2 py-1 text-left text-xs hover:bg-muted"
                        >
                          <span className="font-semibold">{s.ticker}</span>
                          <span className="ml-2 text-muted-foreground">{s.name}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {benchQuery.trim() && benchMatches.length === 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        const raw = benchQuery.trim().toUpperCase();
                        const y = raw.includes(".") || raw.startsWith("^")
                          ? raw
                          : `${raw}.NS`;
                        set("rsSymbol", y);
                        setBenchQuery("");
                      }}
                      className="mt-1 w-full rounded border border-primary/40 bg-primary/5 px-2 py-1 text-left text-xs hover:bg-primary/10"
                    >
                      Use “{benchQuery.trim().toUpperCase()}” as benchmark
                    </button>
                  )}
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    Mode
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {([
                      { id: "benchmark", label: "Benchmark only" },
                      { id: "compare", label: "Compare vs stock" },
                    ] as const).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => set("rsCompareMode", m.id)}
                        className={`rounded border px-2 py-1 text-[11px] transition-colors ${
                          value.rsCompareMode === m.id
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                <ColorPicker
                  label="Benchmark color"
                  value={value.rsOverlayColor}
                  swatches={RS_SWATCHES}
                  onChange={(c) => set("rsOverlayColor", c)}
                />
                {value.rsCompareMode === "compare" && (
                  <ColorPicker
                    label="Stock color"
                    value={value.rsStockColor}
                    swatches={["#38bdf8", "#22c55e", "#a855f7", "#f59e0b", "#ec4899"]}
                    onChange={(c) => set("rsStockColor", c)}
                  />
                )}
              </div>
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <Row label="MACD sub-pane">
              <Switch
                checked={Boolean(value.macdEnabled)}
                onCheckedChange={(v) => set("macdEnabled", Boolean(v))}
              />
            </Row>
            {value.macdEnabled && (
              <div className="space-y-2 rounded border border-border/60 bg-muted/30 p-2">
                <p className="text-[10px] leading-relaxed text-muted-foreground">
                  MACD = EMA(fast) − EMA(slow); signal = EMA(MACD, signal); histogram = MACD − signal.
                  Gil Morales watches the &ldquo;MACD stretch&rdquo; — when the MACD &amp; signal pull far apart
                  after a strong move, the trend is extended and a snap-back / mean reversion becomes
                  high-probability. Histogram fading from peak = momentum cooling; crossover = trend flip.
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <NumField label="Fast" value={value.macdFast} min={2} max={100} onChange={(n) => set("macdFast", n)} />
                  <NumField label="Slow" value={value.macdSlow} min={3} max={200} onChange={(n) => set("macdSlow", n)} />
                  <NumField label="Signal" value={value.macdSignal} min={1} max={100} onChange={(n) => set("macdSignal", n)} />
                </div>
                <ColorPicker label="MACD line" value={value.macdLineColor} swatches={["#3b82f6", "#06b6d4", "#a855f7"]} onChange={(c) => set("macdLineColor", c)} />
                <ColorPicker label="Signal line" value={value.macdSignalColor} swatches={["#f97316", "#eab308", "#ec4899"]} onChange={(c) => set("macdSignalColor", c)} />
                <ColorPicker label="Histogram +" value={value.macdHistUpColor} swatches={UP_SWATCHES} onChange={(c) => set("macdHistUpColor", c)} />
                <ColorPicker label="Histogram −" value={value.macdHistDownColor} swatches={DOWN_SWATCHES} onChange={(c) => set("macdHistDownColor", c)} />

              </div>
            )}
          </div>

          <Separator />

          <button
            type="button"
            onClick={() => onChange(DEFAULT_CHART_CONFIG)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <Settings className="h-3 w-3" /> Reset to defaults
          </button>

        </div>
      </PopoverContent>
    </Popover>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      {children}
    </label>
  );
}

function ColorPicker({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string;
  value: string;
  swatches: string[];
  onChange: (c: string) => void;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`h-5 w-5 rounded border ${
              value.toLowerCase() === c.toLowerCase() ? "border-foreground" : "border-border/60"
            }`}
            style={{ background: c }}
            aria-label={`Color ${c}`}
          />
        ))}
        <input
          type="color"
          value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#3b82f6"}
          onChange={(e) => onChange(e.target.value)}
          className="h-5 w-7 cursor-pointer rounded border border-border bg-transparent"
          aria-label="Custom color"
        />
      </div>
    </div>
  );
}

function VolumeV2Panel({
  value,
  onChange,
}: {
  value: ChartConfig;
  onChange: (next: ChartConfig) => void;
}) {
  const v2: VolumeV2Settings = { ...DEFAULT_VOLUME_V2, ...(value.volumeV2 ?? {}) };
  const setV2 = <K extends keyof VolumeV2Settings>(k: K, v: VolumeV2Settings[K]) =>
    onChange({ ...value, volumeV2: { ...v2, [k]: v } });

  return (
    <div className="mt-2 space-y-2 rounded border border-border/60 bg-muted/30 p-2">
      <div className="grid grid-cols-2 gap-2">
        <NumField label="Pocket Pivot N" value={v2.ppvLookback} min={2} max={50} onChange={(n) => setV2("ppvLookback", n)} />
        <NumField label="Vol Avg N" value={v2.avgLookback} min={5} max={200} onChange={(n) => setV2("avgLookback", n)} />
        <NumField label="RVol N" value={v2.rvolLookback} min={5} max={100} onChange={(n) => setV2("rvolLookback", n)} />
        <NumField label="Dry frac (1/x)" value={v2.dryFraction} min={2} max={20} onChange={(n) => setV2("dryFraction", n)} />
      </div>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Highest-volume markers</div>
        <div className="grid grid-cols-2 gap-1">
          <Toggle label="HVE (ever)" checked={v2.showHVE} onChange={(b) => setV2("showHVE", b)} />
          <Toggle label="HVY (year)" checked={v2.showHVY} onChange={(b) => setV2("showHVY", b)} />
          <Toggle label="HVQ (quarter)" checked={v2.showHVQ} onChange={(b) => setV2("showHVQ", b)} />
          <Toggle label="HVIPO" checked={v2.showHVIPO} onChange={(b) => setV2("showHVIPO", b)} />
        </div>
        <div className="mt-1">
          <Toggle label="Latest occurrence only" checked={v2.latestOnly} onChange={(b) => setV2("latestOnly", b)} />
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">Info chips</div>
        <div className="grid grid-cols-1 gap-1">
          <Toggle label="Avg ₹Vol" checked={v2.showAvgRupeeVol} onChange={(b) => setV2("showAvgRupeeVol", b)} />
          <Toggle label="RVol %" checked={v2.showRVol} onChange={(b) => setV2("showRVol", b)} />
          <Toggle label="1-min liquidity" checked={v2.showOneMinLiq} onChange={(b) => setV2("showOneMinLiq", b)} />
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Paint price bars (HVE/HVY only)
        </div>
        <div className="grid grid-cols-2 gap-1">
          <Toggle label="Paint HVE bars" checked={v2.paintHVE} onChange={(b) => setV2("paintHVE", b)} />
          <Toggle label="Paint HVY bars" checked={v2.paintHVY} onChange={(b) => setV2("paintHVY", b)} />
        </div>
        {(v2.paintHVE || v2.paintHVY) && (
          <div className="mt-1">
            <Toggle
              label="Preserve body color (wick/border only)"
              checked={v2.preservePriceBody}
              onChange={(b) => setV2("preservePriceBody", b)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function NumField({
  label, value, min, max, onChange,
}: { label: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
        }}
        className="h-7 text-xs"
      />
    </label>
  );
}

function Toggle({
  label, checked, onChange,
}: { label: string; checked: boolean; onChange: (b: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[11px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3 w-3 accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}

function DraftNumber({
  value,
  min,
  max,
  fallback,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  fallback: number;
  onCommit: (n: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const raw = draft;
    setDraft(null);
    if (raw == null) return;
    const n = Number(raw);
    if (!raw.trim() || !Number.isFinite(n)) {
      onCommit(fallback);
      return;
    }
    onCommit(Math.max(min, Math.min(max, Math.round(n))));
  };
  return (
    <input
      type="number"
      min={min}
      max={max}
      value={draft ?? String(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="h-7 w-16 rounded border border-border bg-background px-2 text-[11px]"
    />
  );
}
