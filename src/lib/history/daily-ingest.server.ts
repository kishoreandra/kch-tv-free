// Validated daily EOD ingestion for `daily_prices`.
//
// Why this exists: the old job blindly trusted whatever the NSE archive
// returned. If the file for today wasn't published yet (or the CDN served a
// stale copy) we silently ended up with yesterday's candle as "latest", which
// makes every EMA/volume/price alert wrong for a whole day with no signal.
//
// This module therefore:
//   1. works out the *expected* trading day (weekends + NSE holidays aware)
//   2. validates the date stamped inside the downloaded file
//   3. refuses to write anything when the source is stale
//   4. verifies every tracked symbol got a row with real (non-zero) volume
//   5. records the outcome in `data_ingest_status` so the UI can warn

import { assertBhavcopyForDate, fetchNseCsv, parseBhavcopy, parseBhavcopyFileDate, ddmmyyyy } from "@/lib/breadth/bhavcopy.server";
import { expectedTradingDay, istNow, RETRY_CUTOFF_MINUTE } from "./nse-calendar";

const ARCHIVE = "https://nsearchives.nseindia.com";
export const DAILY_INGEST_ID = "daily_prices";

const norm = (s: string) => s.replace(/\.NS$/i, "").trim().toUpperCase();

export type IngestStatus = "ok" | "partial" | "stale_source" | "unavailable" | "skipped" | "error";

export interface IngestReport {
  expected_date: string;
  fetched_date: string | null;
  status: IngestStatus;
  rows: number;
  symbols_checked: number;
  missing_symbols: string[];
  message: string;
}

async function readStatus(admin: any) {
  const { data } = await admin
    .from("data_ingest_status")
    .select("*")
    .eq("id", DAILY_INGEST_ID)
    .maybeSingle();
  return data as any | null;
}

async function writeStatus(admin: any, patch: Record<string, unknown>) {
  await admin
    .from("data_ingest_status")
    .upsert({ id: DAILY_INGEST_ID, ...patch, updated_at: new Date().toISOString() }, { onConflict: "id" });
}

/**
 * Per-symbol completeness check: every symbol in the official daily file should have a row for
 * `date` with a non-null, non-zero volume.
 */
export async function verifyCoverage(
  admin: any,
  date: string,
  symbols: string[],
): Promise<string[]> {
  const missing: string[] = [];
  for (let i = 0; i < symbols.length; i += 300) {
    const chunk = symbols.slice(i, i + 300);
    const { data } = await admin
      .from("daily_prices")
      .select("symbol,volume,close")
      .eq("trade_date", date)
      .in("symbol", chunk);
    const good = new Set(
      ((data ?? []) as any[])
        .filter((r) => r.close != null && r.volume != null && Number(r.volume) > 0)
        .map((r) => norm(String(r.symbol))),
    );
    for (const s of chunk) if (!good.has(s)) missing.push(s);
  }
  return missing;
}

export interface IngestOptions {
  /** Explicit session to ingest; defaults to the expected trading day. */
  date?: string;
  /** Re-run even when the expected day is already complete. */
  force?: boolean;
  /** Honour the 21:00 IST retry cutoff (cron does, manual refresh doesn't). */
  respectCutoff?: boolean;
}

export async function ingestExpectedDay(admin: any, opts: IngestOptions = {}): Promise<IngestReport> {
  const expected = opts.date ?? expectedTradingDay();
  const prior = await readStatus(admin);
  const attempts =
    prior?.expected_date === expected ? Number(prior?.attempts ?? 0) + 1 : 1;

  const base = {
    expected_date: expected,
    attempts,
    last_attempt_at: new Date().toISOString(),
  };

  // Already good for this session — nothing to do (cheap no-op for the retry cron).
  if (!opts.force && prior?.expected_date === expected && prior?.status === "ok") {
    return {
      expected_date: expected,
      fetched_date: prior.fetched_date ?? expected,
      status: "skipped",
      rows: Number(prior.rows_ingested ?? 0),
      symbols_checked: Number(prior.symbols_checked ?? 0),
      missing_symbols: [],
      message: `Already ingested for ${expected}`,
    };
  }

  // The cutoff only applies while we are waiting on *today's* file; a
  // backlogged earlier session should always be fetched.
  const nowIst = istNow();
  if (opts.respectCutoff && expected === nowIst.date && nowIst.minuteOfDay > RETRY_CUTOFF_MINUTE) {
    const message = `Past the 21:00 IST cutoff without data for ${expected}`;
    await writeStatus(admin, { ...base, status: "unavailable", message });
    return {
      expected_date: expected,
      fetched_date: null,
      status: "unavailable",
      rows: 0,
      symbols_checked: 0,
      missing_symbols: [],
      message,
    };
  }

  // ---------------------------------------------------------------- download
  let text: string;
  try {
    text = await fetchNseCsv(`${ARCHIVE}/products/content/sec_bhavdata_full_${ddmmyyyy(expected)}.csv`);
  } catch (e) {
    const message = `Bhavcopy for ${expected} not available yet (attempt ${attempts}): ${
      e instanceof Error ? e.message : String(e)
    }`;
    await writeStatus(admin, { ...base, status: "unavailable", fetched_date: null, message });
    return {
      expected_date: expected,
      fetched_date: null,
      status: "unavailable",
      rows: 0,
      symbols_checked: 0,
      missing_symbols: [],
      message,
    };
  }

  // ------------------------------------------------------- date validation
  // The archive answers a date it has no file for with HTTP 200 and an *older*
  // CSV, so the file's own DATE1 is the only proof this really is `expected`.
  // The rule lives in one place — shared with the cron/backfill writers.
  const fileDate = parseBhavcopyFileDate(text);
  try {
    assertBhavcopyForDate(text, expected);
  } catch (e) {
    const message = `${e instanceof Error ? e.message : String(e)} — nothing was written.`;
    await writeStatus(admin, { ...base, status: "stale_source", fetched_date: fileDate, message });
    return {
      expected_date: expected,
      fetched_date: fileDate,
      status: "stale_source",
      rows: 0,
      symbols_checked: 0,
      missing_symbols: [],
      message,
    };
  }

  // -------------------------------------------------------------- ingestion
  try {
    const parsed = parseBhavcopy(text, expected);
    if (parsed.length < 500) throw new Error(`Bhavcopy parsed only ${parsed.length} rows`);

    const now = new Date().toISOString();
    const writeRows = async (rows: typeof parsed) => {
      for (let k = 0; k < rows.length; k += 500) {
        const { error } = await admin
          .from("daily_prices")
          .upsert(
            rows.slice(k, k + 500).map((r) => ({ ...r, updated_at: now })),
            { onConflict: "symbol,trade_date" },
          );
        if (error) throw new Error(error.message);
      }
    };
    await writeRows(parsed);

    // Verify the complete official EQ/BE file, then rewrite any gaps once.
    // This catches a partial batch write without waiting for tomorrow's run.
    const allSymbols = parsed.map((r) => norm(r.symbol));
    let missing = await verifyCoverage(admin, expected, allSymbols);
    if (missing.length > 0) {
      const missingSet = new Set(missing);
      await writeRows(parsed.filter((r) => missingSet.has(norm(r.symbol))));
      missing = await verifyCoverage(admin, expected, missing);
    }

    const status: IngestStatus = missing.length === 0 ? "ok" : "partial";
    const message =
      missing.length === 0
        ? `Ingested and verified all ${parsed.length} NSE EQ/BE rows for ${expected}.`
        : `Ingested ${parsed.length} NSE EQ/BE rows for ${expected}; ${missing.length} symbol(s) still missing after repair.`;
    if (missing.length > 0) console.warn("daily ingest gaps after repair:", missing.slice(0, 50).join(","));

    await writeStatus(admin, {
      ...base,
      status,
      fetched_date: expected,
      rows_ingested: parsed.length,
      symbols_checked: allSymbols.length,
      missing_symbols: missing.slice(0, 200),
      message,
      completed_at: new Date().toISOString(),
    });

    return {
      expected_date: expected,
      fetched_date: expected,
      status,
      rows: parsed.length,
      symbols_checked: allSymbols.length,
      missing_symbols: missing,
      message,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await writeStatus(admin, { ...base, status: "error", fetched_date: fileDate ?? null, message });
    return {
      expected_date: expected,
      fetched_date: fileDate,
      status: "error",
      rows: 0,
      symbols_checked: 0,
      missing_symbols: [],
      message,
    };
  }
}

/** Freshness summary for the UI staleness badge. */
export async function dailyDataFreshness(admin: any) {
  const expected = expectedTradingDay();
  const [{ data: latest }, status] = await Promise.all([
    // `expected` is by definition the newest session that can exist, so anything
    // dated after it is a phantom (an archive echo stored under a holiday's
    // date). Ignoring it keeps the badge honest instead of reporting "as of
    // <holiday>" as if the market had traded.
    admin
      .from("daily_prices")
      .select("trade_date")
      .lte("trade_date", expected)
      .order("trade_date", { ascending: false })
      .limit(1),
    readStatus(admin),
  ]);
  const latestDate = (latest?.[0] as any)?.trade_date ?? null;
  return {
    expected_date: expected,
    latest_date: latestDate,
    stale: latestDate !== expected,
    status: (status?.status ?? "unknown") as string,
    attempts: Number(status?.attempts ?? 0),
    missing_count: Array.isArray(status?.missing_symbols) ? status.missing_symbols.length : 0,
    message: (status?.message ?? null) as string | null,
    last_attempt_at: (status?.last_attempt_at ?? null) as string | null,
  };
}
