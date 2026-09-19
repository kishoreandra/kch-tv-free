import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Trash2, Plus, Bell } from "lucide-react";
import {
  EMA_OPTIONS,
  describeAlert,
  type Alert,
  type AlertType,
  type AlertDirection,
} from "@/lib/alerts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  symbol: string;
  interval: string;
  alerts: Alert[];
  onAdd: (a: Alert) => void;
  onUpdate: (id: string, patch: Partial<Alert>) => void;
  onRemove: (id: string) => void;
  soundEnabled: boolean;
  onSoundChange: (v: boolean) => void;
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function AlertsDialog({
  open, onOpenChange, symbol, interval, alerts, onAdd, onUpdate, onRemove, soundEnabled, onSoundChange,
}: Props) {
  const [type, setType] = useState<AlertType>("price");
  const [direction, setDirection] = useState<AlertDirection>("above");
  const [level, setLevel] = useState("");
  const [ema, setEma] = useState(21);
  const [fast, setFast] = useState(10);
  const [slow, setSlow] = useState(21);
  const [note, setNote] = useState("");

  const scoped = useMemo(
    () => alerts.filter((a) => a.symbol === symbol && a.interval === interval),
    [alerts, symbol, interval],
  );

  const handleAdd = () => {
    const base = {
      id: uid(),
      symbol,
      interval,
      direction,
      enabled: true,
      note: note.trim() || undefined,
      createdAt: Date.now(),
    } as const;
    let a: Alert;
    if (type === "price") {
      const n = parseFloat(level);
      if (!isFinite(n) || n <= 0) return;
      a = { ...base, type: "price", level: n };
    } else if (type === "price_ema") {
      a = { ...base, type: "price_ema", ema };
    } else {
      if (fast === slow) return;
      a = { ...base, type: "ema_ema", fast, slow };
    }
    onAdd(a);
    setLevel("");
    setNote("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-4 w-4" /> Alerts · {symbol.replace(/\.NS$/, "")} · {interval}
          </DialogTitle>
          <DialogDescription>
            Browser-side alerts. They fire only while this tab is open and use Yahoo data (typically ~15 min delayed).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 rounded-md border border-border p-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as AlertType)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="price">Price crosses level</SelectItem>
                  <SelectItem value="price_ema">Price crosses EMA</SelectItem>
                  <SelectItem value="ema_ema">EMA crosses EMA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as AlertDirection)}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="above">Crosses above ↑</SelectItem>
                  <SelectItem value="below">Crosses below ↓</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {type === "price" && (
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">Price level</Label>
                <Input
                  type="number"
                  step="0.05"
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                  placeholder="e.g. 1234.50"
                  className="h-8 text-xs"
                />
              </div>
            )}

            {type === "price_ema" && (
              <div className="space-y-1 col-span-2">
                <Label className="text-xs">EMA length</Label>
                <Select value={String(ema)} onValueChange={(v) => setEma(Number(v))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMA_OPTIONS.map((n) => (
                      <SelectItem key={n} value={String(n)}>EMA {n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {type === "ema_ema" && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs">Fast EMA</Label>
                  <Select value={String(fast)} onValueChange={(v) => setFast(Number(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMA_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>EMA {n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Slow EMA</Label>
                  <Select value={String(slow)} onValueChange={(v) => setSlow(Number(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {EMA_OPTIONS.map((n) => (
                        <SelectItem key={n} value={String(n)}>EMA {n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-8 text-xs" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Switch id="snd" checked={soundEnabled} onCheckedChange={onSoundChange} />
              <Label htmlFor="snd" className="text-xs">Sound on trigger</Label>
            </div>
            <Button size="sm" onClick={handleAdd}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add alert
            </Button>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto">
          {scoped.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              No alerts for this symbol on {interval}.
            </p>
          ) : (
            <ul className="divide-y divide-border text-xs">
              {scoped.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{describeAlert(a)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {a.note ? a.note + " · " : ""}
                      {a.lastTriggeredAt
                        ? `Last triggered ${new Date(a.lastTriggeredAt).toLocaleString()}`
                        : "Armed"}
                    </div>
                  </div>
                  <Switch
                    checked={a.enabled}
                    onCheckedChange={(v) => onUpdate(a.id, { enabled: v })}
                  />
                  <button
                    onClick={() => onRemove(a.id)}
                    className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    aria-label="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
