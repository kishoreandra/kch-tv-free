import { createServerFn } from "@tanstack/react-start";
import { requireAdminAuth } from "@/lib/auth/approved-middleware";

// Manually rebuilds price_bands from NSE's sec_list.csv (the /band-alerts
// "Refresh sec bands" button). Admin-only: the cron route enforces the
// scheduled-job api key, and this gate keeps the trigger restricted to admins.
export const refreshPriceBandsNow = createServerFn({ method: "POST" })
  .middleware([requireAdminAuth])
  .handler(async () => {
    const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY ?? "";
    if (!apiKey) throw new Error("Backend publishable key is not configured");
    const url = "https://kch-tv.lovable.app/api/public/cron/refresh-price-bands";
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: "{}",
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Official NSE price-band refresh failed (${res.status}): ${text.slice(0, 200)}`);
    }
    try {
      const j = JSON.parse(text);
      const b = j?.bandChanges;
      const changes = b?.changes;
      const extra = typeof changes === "number" ? `, ${changes} band change${changes === 1 ? "" : "s"}` : "";
      // Delivery status belongs in the message: a failed Telegram send used to
      // look exactly like a successful one, so the alert could go missing
      // without a word anywhere.
      const delivery =
        typeof changes === "number" && changes > 0
          ? b?.alerted
            ? " — Telegram alert sent"
            : ` — ⚠️ Telegram alert NOT sent${b?.alertError ? `: ${b.alertError}` : ""}`
          : "";
      return {
        message: `Loaded ${j.upserted ?? "?"} bands from NSE sec_list.csv (effective ${j.effective_date ?? "?"}${extra})${delivery}`,
        alerted: typeof changes === "number" && changes > 0 ? Boolean(b?.alerted) : null,
        alertError: (b?.alertError as string | undefined) ?? null,
      };
    } catch {
      return { message: text.slice(0, 200), alerted: null, alertError: null };
    }
});
