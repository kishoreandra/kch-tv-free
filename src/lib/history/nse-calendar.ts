// NSE trading calendar helpers (client-safe).
//
// Used to work out which trading session's data we should *expect* to have,
// so a stale Bhavcopy (yesterday's file served as if it were today's) can be
// detected instead of silently overwriting good data.

// NSE equity segment trading holidays. Keep this list current each January.
//
// 2026 entries up to 14-Sep-2026 are *verified* against the archive itself: for
// every weekday the `sec_bhavdata_full` file was fetched and its own DATE1
// compared with the requested date. A weekday whose file is dated anything else
// (the archive echoes the previous session) had no session. That audit found six
// holidays this list was missing — including 14-Sep-2026, Ganesh Chaturthi — and
// four entries that were ordinary sessions (4-Mar, 19-Mar, 1-Apr and 26-Aug
// 2026 all have real, self-dated files). Dates after today cannot be checked and
// come from NSE's published calendar.
export const NSE_HOLIDAYS: string[] = [
  // 2025
  "2025-02-26", "2025-03-14", "2025-03-31", "2025-04-10", "2025-04-14",
  "2025-04-18", "2025-05-01", "2025-08-15", "2025-08-27", "2025-10-02",
  "2025-10-21", "2025-10-22", "2025-11-05", "2025-12-25",
  // 2026 — verified against the archive
  "2026-01-15", "2026-01-26", "2026-03-03", "2026-03-26", "2026-03-31",
  "2026-04-03", "2026-04-14", "2026-05-01", "2026-05-28", "2026-06-26",
  "2026-09-14",
  // 2026 — announced, still in the future
  "2026-10-02", "2026-10-20", "2026-11-09", "2026-11-10", "2026-11-24",
  "2026-12-25",
  // 2026 — fall on a weekend, listed for completeness
  "2026-02-15", "2026-03-21", "2026-08-15",
];

const HOLIDAY_SET = new Set(NSE_HOLIDAYS);

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Current date/time in IST, as plain parts. */
export function istNow(now: Date = new Date()) {
  const d = new Date(now.getTime() + IST_OFFSET_MS);
  return {
    date: d.toISOString().slice(0, 10),
    minuteOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
    dow: d.getUTCDay(),
  };
}

export function isTradingDay(iso: string): boolean {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !HOLIDAY_SET.has(iso);
}

export function previousTradingDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  for (let i = 0; i < 15; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const candidate = d.toISOString().slice(0, 10);
    if (isTradingDay(candidate)) return candidate;
  }
  return iso;
}

/** Bhavcopy is usually published ~18:00 IST; we start expecting it at 17:30. */
export const BHAVCOPY_READY_MINUTE = 17 * 60 + 30;
/** Stop retrying after 21:00 IST. */
export const RETRY_CUTOFF_MINUTE = 21 * 60;

/**
 * The most recent session whose EOD data we should already have.
 * Before the Bhavcopy publishing window (or on a holiday/weekend) this is the
 * previous trading day, never "today".
 */
export function expectedTradingDay(now: Date = new Date()): string {
  const { date, minuteOfDay } = istNow(now);
  if (isTradingDay(date) && minuteOfDay >= BHAVCOPY_READY_MINUTE) return date;
  return previousTradingDay(date);
}
