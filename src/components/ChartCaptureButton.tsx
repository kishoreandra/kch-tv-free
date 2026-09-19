import { useState } from "react";
import { toPng } from "html-to-image";
import { jsPDF } from "jspdf";
import { Camera, Copy, Download, FileText, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";

type Props = {
  /** Returns the element to capture (usually the chart area). */
  getTarget: () => HTMLElement | null;
  /** Base file name, e.g. the ticker. */
  fileName?: string;
};

const SCALE = 3; // high-resolution capture

function isCrossOriginImg(node: Node): boolean {
  if (!(node instanceof HTMLImageElement)) return false;
  try {
    return new URL(node.src, location.href).origin !== location.origin;
  } catch {
    return false;
  }
}

async function capture(el: HTMLElement): Promise<string> {
  const bg = getComputedStyle(document.body).backgroundColor || "#0b0b0d";
  const opts = {
    pixelRatio: SCALE,
    cacheBust: true,
    backgroundColor: bg,
    // Skip hidden UI chrome and cross-origin images (e.g. external favicons)
    // whose fetch would fail CORS and reject the whole capture.
    filter: (node: Node) => {
      if (node instanceof HTMLElement && node.dataset.captureHide === "true") return false;
      if (isCrossOriginImg(node)) return false;
      return true;
    },
  };
  try {
    return await toPng(el, opts);
  } catch {
    // Retry without cacheBust (its extra fetches are the usual failure point).
    return toPng(el, { ...opts, cacheBust: false });
  }
}

export function ChartCaptureButton({ getTarget, fileName = "chart" }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const stamp = () => {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  };

  const run = async (kind: "copy" | "png" | "pdf" | "print") => {
    const el = getTarget();
    if (!el) {
      toast.error("Nothing to capture");
      return;
    }
    setBusy(kind);
    try {
      const dataUrl = await capture(el);
      const name = `${fileName}-${stamp()}`;

      if (kind === "png") {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${name}.png`;
        a.click();
        toast.success("PNG downloaded");
      } else if (kind === "copy") {
        const blob = await (await fetch(dataUrl)).blob();
        if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
          throw new Error("Clipboard images not supported in this browser");
        }
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        toast.success("Image copied to clipboard");
      } else {
        const img = new Image();
        img.src = dataUrl;
        await new Promise((res, rej) => {
          img.onload = res;
          img.onerror = rej;
        });
        const landscape = img.width >= img.height;
        const pdf = new jsPDF({
          orientation: landscape ? "landscape" : "portrait",
          unit: "pt",
          format: "a4",
        });
        const pw = pdf.internal.pageSize.getWidth();
        const ph = pdf.internal.pageSize.getHeight();
        const margin = 18;
        const ratio = Math.min((pw - margin * 2) / img.width, (ph - margin * 2) / img.height);
        const w = img.width * ratio;
        const h = img.height * ratio;
        pdf.addImage(dataUrl, "PNG", (pw - w) / 2, (ph - h) / 2, w, h, undefined, "FAST");
        if (kind === "pdf") {
          pdf.save(`${name}.pdf`);
          toast.success("PDF downloaded");
        } else {
          pdf.autoPrint();
          const url = pdf.output("bloburl");
          window.open(url as unknown as string, "_blank");
        }
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Capture failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          title="Screenshot chart (high resolution)"
          aria-label="Screenshot chart"
          data-capture-hide="true"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-1">
        <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          Capture @{SCALE}x
        </div>
        <button
          onClick={() => run("copy")}
          disabled={busy != null}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          <Copy className="h-3.5 w-3.5" /> Copy as image
        </button>
        <button
          onClick={() => run("png")}
          disabled={busy != null}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          <Download className="h-3.5 w-3.5" /> Download PNG
        </button>
        <button
          onClick={() => run("pdf")}
          disabled={busy != null}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          <FileText className="h-3.5 w-3.5" /> Download PDF
        </button>
        <button
          onClick={() => run("print")}
          disabled={busy != null}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted disabled:opacity-50"
        >
          <Printer className="h-3.5 w-3.5" /> Print
        </button>
      </PopoverContent>
    </Popover>
  );
}
