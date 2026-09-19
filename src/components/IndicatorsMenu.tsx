import { useState } from "react";
import { LineChart, X, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  type IndicatorConfig,
  type IndicatorStyle,
  type LineStyleName,
  resolveStyle,
} from "@/components/LightweightChart";
import {
  OVERRIDE_TFS,
  OVERRIDE_TF_LABEL,
  type IndicatorConfigExt,
  type OverrideTf,
} from "@/lib/indicators-adapt";

const EMA_PRESETS = [10, 21, 50, 200];
const SMA_PRESETS = [20, 50, 100, 200];

interface Props {
  value: IndicatorConfig;
  onChange: (next: IndicatorConfig) => void;
  compact?: boolean;
  hasOverride?: boolean;
}

export function IndicatorsMenu({ value, onChange, compact, hasOverride }: Props) {
  const [emaInput, setEmaInput] = useState("");
  const [smaInput, setSmaInput] = useState("");
  const [openStyleKey, setOpenStyleKey] = useState<string | null>(null);

  const toggleIn = (arr: number[], p: number) =>
    arr.includes(p) ? arr.filter((x) => x !== p) : [...arr, p].sort((a, b) => a - b);

  const addCustom = (kind: "ema" | "sma", raw: string) => {
    const p = parseInt(raw, 10);
    if (!Number.isFinite(p) || p < 2 || p > 500) return;
    if (value[kind].includes(p)) return;
    onChange({ ...value, [kind]: [...value[kind], p].sort((a, b) => a - b) });
  };

  const removePeriod = (kind: "ema" | "sma", p: number) => {
    onChange({ ...value, [kind]: value[kind].filter((x) => x !== p) });
  };

  const setStyle = (key: string, patch: Partial<IndicatorStyle>) => {
    const cur = value.styles?.[key] ?? {};
    onChange({ ...value, styles: { ...(value.styles ?? {}), [key]: { ...cur, ...patch } } });
  };

  const resetStyle = (key: string) => {
    if (!value.styles?.[key]) return;
    const next = { ...value.styles };
    delete next[key];
    onChange({ ...value, styles: next });
  };

  const anchoredVwaps = value.anchoredVwaps ?? [];
  const activeCount = value.ema.length + value.sma.length + (value.vwap ? 1 : 0) + anchoredVwaps.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        {compact ? (
          <button
            type="button"
            className={`rounded p-1 transition-colors ${
              hasOverride
                ? "bg-primary/20 text-primary hover:bg-primary/25"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            title={hasOverride ? "Per-pane indicators (override active)" : "Per-pane indicators"}
            aria-label="Pane indicators"
          >
            <LineChart className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Button size="sm" variant="outline" className="gap-1.5">
            <LineChart className="h-3.5 w-3.5" />
            Indicators
            {activeCount > 0 && (
              <span className="ml-0.5 rounded bg-primary/20 px-1.5 text-[10px] font-semibold text-primary">
                {activeCount}
              </span>
            )}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-3">
          <PeriodGroup
            title="EMA"
            kind="ema"
            presets={EMA_PRESETS}
            active={value.ema}
            cfg={value}
            onToggle={(p) => onChange({ ...value, ema: toggleIn(value.ema, p) })}
            onRemove={(p) => removePeriod("ema", p)}
            input={emaInput}
            setInput={setEmaInput}
            onAdd={(raw) => {
              addCustom("ema", raw);
              setEmaInput("");
            }}
            openStyleKey={openStyleKey}
            setOpenStyleKey={setOpenStyleKey}
            setStyle={setStyle}
            resetStyle={resetStyle}
          />

          <Separator />

          <PeriodGroup
            title="SMA"
            kind="sma"
            presets={SMA_PRESETS}
            active={value.sma}
            cfg={value}
            onToggle={(p) => onChange({ ...value, sma: toggleIn(value.sma, p) })}
            onRemove={(p) => removePeriod("sma", p)}
            input={smaInput}
            setInput={setSmaInput}
            onAdd={(raw) => {
              addCustom("sma", raw);
              setSmaInput("");
            }}
            openStyleKey={openStyleKey}
            setOpenStyleKey={setOpenStyleKey}
            setStyle={setStyle}
            resetStyle={resetStyle}
          />

          <Separator />

          <div className="space-y-2">
            <label className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <Checkbox
                  checked={value.vwap}
                  onCheckedChange={(v) => onChange({ ...value, vwap: Boolean(v) })}
                />
                VWAP
              </span>
              {value.vwap && (
                <StyleButton
                  cfg={value}
                  styleKey="vwap"
                  open={openStyleKey === "vwap"}
                  onToggle={() => setOpenStyleKey(openStyleKey === "vwap" ? null : "vwap")}
                />
              )}
            </label>
            {value.vwap && openStyleKey === "vwap" && (
              <StyleEditor
                styleKey="vwap"
                cfg={value}
                setStyle={setStyle}
                resetStyle={resetStyle}
              />
            )}
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Anchored VWAP
              </p>
              <span className="text-[10px] text-muted-foreground">
                {anchoredVwaps.length} anchor{anchoredVwaps.length === 1 ? "" : "s"}
              </span>
            </div>
            {anchoredVwaps.length === 0 ? (
              <p className="text-[11px] leading-snug text-muted-foreground">
                Click the <span className="font-medium text-foreground">⚓</span> button on the chart
                toolbar, then click any candle to anchor a VWAP from that bar.
              </p>
            ) : (
              <div className="space-y-1">
                {anchoredVwaps.map((a) => {
                  const key = `avwap:${a.id}`;
                  const dateStr = a.label ?? new Date(a.time * 1000).toISOString().slice(0, 10);
                  return (
                    <div key={a.id}>
                      <div className="flex items-center justify-between gap-1 rounded bg-muted px-2 py-1 text-[11px]">
                        <span className="truncate">AVWAP {dateStr}</span>
                        <div className="flex items-center gap-1">
                          <StyleButton
                            cfg={value}
                            styleKey={key}
                            open={openStyleKey === key}
                            onToggle={() => setOpenStyleKey(openStyleKey === key ? null : key)}
                          />
                          <button
                            onClick={() => {
                              const nextStyles = { ...(value.styles ?? {}) };
                              delete nextStyles[key];
                              onChange({
                                ...value,
                                anchoredVwaps: anchoredVwaps.filter((x) => x.id !== a.id),
                                styles: nextStyles,
                              });
                            }}
                            className="text-muted-foreground hover:text-destructive"
                            aria-label={`Remove AVWAP ${dateStr}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                      {openStyleKey === key && (
                        <StyleEditor
                          styleKey={key}
                          cfg={value}
                          setStyle={setStyle}
                          resetStyle={resetStyle}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Separator />

          <OverridesSection value={value} onChange={onChange} />

          <Separator />

          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onChange({ ema: [], sma: [], vwap: false, anchoredVwaps: [], styles: {} })}
          >
            Clear all
          </button>
        </div>
        <Label className="sr-only">Indicators</Label>
      </PopoverContent>
    </Popover>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function StyleButton({
  cfg,
  styleKey,
  open,
  onToggle,
}: {
  cfg: IndicatorConfig;
  styleKey: string;
  open: boolean;
  onToggle: () => void;
}) {
  const st = resolveStyle(cfg, styleKey);
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
        open ? "border-primary/60 bg-primary/10" : "border-border hover:bg-muted"
      }`}
      aria-label="Edit style"
    >
      <span
        className="h-3 w-3 rounded-sm border border-border/60"
        style={{ background: st.color }}
      />
      <Settings2 className="h-3 w-3 text-muted-foreground" />
    </button>
  );
}

function StyleRow({
  label,
  styleKey,
  cfg,
  open,
  onToggle,
  setStyle,
  resetStyle,
}: {
  label: string;
  styleKey: string;
  cfg: IndicatorConfig;
  open: boolean;
  onToggle: () => void;
  setStyle: (k: string, p: Partial<IndicatorStyle>) => void;
  resetStyle: (k: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <StyleButton cfg={cfg} styleKey={styleKey} open={open} onToggle={onToggle} />
      </div>
      {open && (
        <StyleEditor
          styleKey={styleKey}
          cfg={cfg}
          setStyle={setStyle}
          resetStyle={resetStyle}
        />
      )}
    </div>
  );
}

const SWATCHES = [
  "#f59e0b", "#3b82f6", "#a855f7", "#ef4444",
  "#06b6d4", "#84cc16", "#ec4899", "#f97316",
  "#eab308", "#22c55e", "#14b8a6", "#94a3b8",
];

function StyleEditor({
  styleKey,
  cfg,
  setStyle,
  resetStyle,
}: {
  styleKey: string;
  cfg: IndicatorConfig;
  setStyle: (k: string, p: Partial<IndicatorStyle>) => void;
  resetStyle: (k: string) => void;
}) {
  const st = resolveStyle(cfg, styleKey);
  return (
    <div className="mt-1.5 space-y-2 rounded-md border border-border bg-muted/30 p-2">
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
          Color
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setStyle(styleKey, { color: c })}
              className={`h-5 w-5 rounded border ${
                st.color.toLowerCase() === c.toLowerCase()
                  ? "border-foreground"
                  : "border-border/60"
              }`}
              style={{ background: c }}
              aria-label={`Color ${c}`}
            />
          ))}
          <input
            type="color"
            value={normalizeHex(st.color)}
            onChange={(e) => setStyle(styleKey, { color: e.target.value })}
            className="h-5 w-7 cursor-pointer rounded border border-border bg-transparent"
            aria-label="Custom color"
          />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Width
          </div>
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setStyle(styleKey, { width: w as 1 | 2 | 3 | 4 })}
                className={`h-6 w-6 rounded border text-[10px] ${
                  st.width === w
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
            Style
          </div>
          <div className="flex gap-1">
            {(["solid", "dashed", "dotted"] as LineStyleName[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStyle(styleKey, { style: s })}
                className={`rounded border px-1.5 py-1 text-[10px] capitalize ${
                  st.style === s
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => resetStyle(styleKey)}
        className="text-[10px] text-muted-foreground hover:text-foreground"
      >
        Reset to default
      </button>
    </div>
  );
}

function normalizeHex(c: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  return "#3b82f6";
}

function PeriodGroup({
  title,
  kind,
  presets,
  active,
  cfg,
  onToggle,
  onRemove,
  input,
  setInput,
  onAdd,
  openStyleKey,
  setOpenStyleKey,
  setStyle,
  resetStyle,
}: {
  title: string;
  kind: "ema" | "sma";
  presets: number[];
  active: number[];
  cfg: IndicatorConfig;
  onToggle: (p: number) => void;
  onRemove: (p: number) => void;
  input: string;
  setInput: (s: string) => void;
  onAdd: (raw: string) => void;
  openStyleKey: string | null;
  setOpenStyleKey: (k: string | null) => void;
  setStyle: (k: string, p: Partial<IndicatorStyle>) => void;
  resetStyle: (k: string) => void;
}) {
  const customs = active.filter((p) => !presets.includes(p));
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </p>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        {presets.map((p) => {
          const isOn = active.includes(p);
          const key = `${kind}:${p}`;
          return (
            <div key={p} className="flex items-center justify-between gap-1">
              <label className="flex min-w-0 items-center gap-2 text-sm">
                <Checkbox checked={isOn} onCheckedChange={() => onToggle(p)} />
                {title} {p}
              </label>
              {isOn && (
                <StyleButton
                  cfg={cfg}
                  styleKey={key}
                  open={openStyleKey === key}
                  onToggle={() => setOpenStyleKey(openStyleKey === key ? null : key)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Style editor for any active preset that is open */}
      {presets.map((p) => {
        const key = `${kind}:${p}`;
        if (!active.includes(p) || openStyleKey !== key) return null;
        return (
          <StyleEditor
            key={key}
            styleKey={key}
            cfg={cfg}
            setStyle={setStyle}
            resetStyle={resetStyle}
          />
        );
      })}

      {customs.length > 0 && (
        <div className="mt-2 space-y-1">
          {customs.map((p) => {
            const key = `${kind}:${p}`;
            return (
              <div key={p}>
                <div className="flex items-center justify-between gap-1 rounded bg-muted px-2 py-1 text-[11px]">
                  <span>{title} {p}</span>
                  <div className="flex items-center gap-1">
                    <StyleButton
                      cfg={cfg}
                      styleKey={key}
                      open={openStyleKey === key}
                      onToggle={() => setOpenStyleKey(openStyleKey === key ? null : key)}
                    />
                    <button
                      onClick={() => onRemove(p)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${title} ${p}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                {openStyleKey === key && (
                  <StyleEditor
                    styleKey={key}
                    cfg={cfg}
                    setStyle={setStyle}
                    resetStyle={resetStyle}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-2 flex items-center gap-1.5">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value.replace(/[^0-9]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd(input);
            }
          }}
          placeholder={`Custom ${title} period`}
          className="h-7 text-xs"
        />
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onAdd(input)}>
          Add
        </Button>
      </div>
    </div>
  );
}

// ---------------- Per-timeframe overrides ----------------

function OverridesSection({
  value,
  onChange,
}: {
  value: IndicatorConfig;
  onChange: (next: IndicatorConfig) => void;
}) {
  const ext = value as IndicatorConfigExt;
  const [expanded, setExpanded] = useState<boolean>(() => Boolean(ext.overrides && Object.keys(ext.overrides).length > 0));
  const [openStyleKey, setOpenStyleKey] = useState<string | null>(null);
  const overrides = ext.overrides ?? {};

  const setTfOverride = (tf: OverrideTf, next: { ema?: number[]; sma?: number[] } | null) => {
    const cur = { ...(ext.overrides ?? {}) };
    if (next === null) {
      delete cur[tf];
    } else {
      cur[tf] = next;
    }
    onChange({ ...value, overrides: cur } as IndicatorConfigExt);
  };

  const setStyle = (key: string, patch: Partial<IndicatorStyle>) => {
    const cur = value.styles?.[key] ?? {};
    onChange({ ...value, styles: { ...(value.styles ?? {}), [key]: { ...cur, ...patch } } });
  };
  const resetStyle = (key: string) => {
    if (!value.styles?.[key]) return;
    const next = { ...value.styles };
    delete next[key];
    onChange({ ...value, styles: next });
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mb-1 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
      >
        <span>Per-timeframe overrides</span>
        <span className="text-[10px] normal-case tracking-normal text-muted-foreground">
          {expanded ? "hide" : "auto-adapt"}
        </span>
      </button>
      {!expanded && (
        <p className="text-[10px] leading-snug text-muted-foreground">
          Periods stay literal on daily and intraday. On weekly they're
          divided by 5 (50 → 10), on monthly by 21. Click to override per
          timeframe.
        </p>
      )}
      {expanded && (
        <div className="space-y-2">
          {OVERRIDE_TFS.map((tf) => {
            const cur = overrides[tf];
            const enabled = Boolean(cur);
            return (
              <div key={tf} className="rounded border border-border/60 p-2">
                <label className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium">{OVERRIDE_TF_LABEL[tf]}</span>
                  <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <Checkbox
                      checked={enabled}
                      onCheckedChange={(v) => {
                        if (v) setTfOverride(tf, cur ?? { ema: [], sma: [] });
                        else setTfOverride(tf, null);
                      }}
                    />
                    Override
                  </span>
                </label>
                {enabled && (
                  <div className="mt-1.5 space-y-1.5">
                    <TfPeriodInput
                      label="EMA"
                      tf={tf}
                      kind="ema"
                      value={cur?.ema ?? []}
                      cfg={value}
                      onChange={(next) => setTfOverride(tf, { sma: cur?.sma ?? [], ema: next })}
                      openStyleKey={openStyleKey}
                      setOpenStyleKey={setOpenStyleKey}
                      setStyle={setStyle}
                      resetStyle={resetStyle}
                    />
                    <TfPeriodInput
                      label="SMA"
                      tf={tf}
                      kind="sma"
                      value={cur?.sma ?? []}
                      cfg={value}
                      onChange={(next) => setTfOverride(tf, { ema: cur?.ema ?? [], sma: next })}
                      openStyleKey={openStyleKey}
                      setOpenStyleKey={setOpenStyleKey}
                      setStyle={setStyle}
                      resetStyle={resetStyle}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TfPeriodInput({
  label,
  tf,
  kind,
  value,
  cfg,
  onChange,
  openStyleKey,
  setOpenStyleKey,
  setStyle,
  resetStyle,
}: {
  label: string;
  tf: OverrideTf;
  kind: "ema" | "sma";
  value: number[];
  cfg: IndicatorConfig;
  onChange: (next: number[]) => void;
  openStyleKey: string | null;
  setOpenStyleKey: (k: string | null) => void;
  setStyle: (k: string, p: Partial<IndicatorStyle>) => void;
  resetStyle: (k: string) => void;
}) {
  const [text, setText] = useState(value.join(", "));
  // Keep the input in sync when parent updates (e.g. after blur normalization).
  const displayed = value.join(", ");
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="w-8 text-[10px] uppercase text-muted-foreground">{label}</span>
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setText(displayed)}
          onBlur={() => onChange(parsePeriods(text))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          placeholder="e.g. 10, 40"
          className="h-6 text-[11px]"
        />
      </div>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1 pl-9">
          {value.map((p) => {
            const key = `${kind}:${tf}:${p}`;
            return (
              <div key={p} className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                <span>{p}</span>
                <StyleButton
                  cfg={cfg}
                  styleKey={key}
                  open={openStyleKey === key}
                  onToggle={() => setOpenStyleKey(openStyleKey === key ? null : key)}
                />
              </div>
            );
          })}
        </div>
      )}
      {value.map((p) => {
        const key = `${kind}:${tf}:${p}`;
        if (openStyleKey !== key) return null;
        return (
          <StyleEditor
            key={key}
            styleKey={key}
            cfg={cfg}
            setStyle={setStyle}
            resetStyle={resetStyle}
          />
        );
      })}
    </div>
  );
}

function parsePeriods(raw: string): number[] {
  return Array.from(
    new Set(
      raw
        .split(/[,\s]+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n >= 2 && n <= 1000),
    ),
  ).sort((a, b) => a - b);
}
