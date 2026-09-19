// Telegram delivery helpers. Server-only: reads TELEGRAM_BOT_TOKEN /
// TELEGRAM_CHAT_ID from the environment at call time.
//
// If TELEGRAM_CHAT_ID is not configured we fall back to resolving the chat id
// from getUpdates (works once the owner has messaged the bot at least one
// time). That keeps setup to "message the bot" with no extra secret.

export interface TelegramResult {
  sent: boolean;
  reason?: string;
  chatId?: string;
}

async function resolveChatId(token: string): Promise<string | null> {
  const explicit = process.env.TELEGRAM_CHAT_ID ?? "";
  if (explicit.trim()) return explicit.trim();
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
    if (!res.ok) return null;
    const json = (await res.json()) as {
      ok?: boolean;
      result?: Array<{ message?: { chat?: { id?: number } } }>;
    };
    const updates = json.result ?? [];
    for (let i = updates.length - 1; i >= 0; i--) {
      const id = updates[i]?.message?.chat?.id;
      if (typeof id === "number") return String(id);
    }
    return null;
  } catch {
    return null;
  }
}

/** Escapes the five characters Telegram's HTML parse mode cares about. */
export function escapeHtml(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Public base URL of this deployment, used to build links inside Telegram
// messages. Set APP_URL in the host's environment.
const SITE = process.env.APP_URL ?? "";

/** `SYMBOL` linked to our chart view, with a small TradingView link beside it. */
export function symbolLinks(ticker: string): string {
  const t = escapeHtml(ticker.replace(/\.NS$/i, "").toUpperCase());
  return `<a href="${SITE}/?symbol=${encodeURIComponent(`${t}.NS`)}"><b>${t}</b></a> · <a href="https://in.tradingview.com/chart/?symbol=${encodeURIComponent(`NSE:${t}`)}">TV</a>`;
}

/** Splits text into <=3800 char chunks on line boundaries (Telegram caps at 4096). */
function chunk(text: string, limit = 3800): string[] {
  if (text.length <= limit) return [text];
  const out: string[] = [];
  let cur = "";
  for (const line of text.split("\n")) {
    const piece = line.length > limit ? line.slice(0, limit) : line;
    if (cur.length + piece.length + 1 > limit) {
      if (cur) out.push(cur);
      cur = piece;
    } else {
      cur = cur ? `${cur}\n${piece}` : piece;
    }
  }
  if (cur) out.push(cur);
  return out;
}

export async function sendTelegram(
  text: string,
  opts: { html?: boolean } = {},
): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? "";
  if (!token) return { sent: false, reason: "TELEGRAM_BOT_TOKEN is not configured" };
  const chatId = await resolveChatId(token);
  if (!chatId) {
    return {
      sent: false,
      reason:
        "No Telegram chat id. Send any message to your bot once, or set TELEGRAM_CHAT_ID.",
    };
  }
  // Long digests are delivered as several numbered messages instead of being
  // cut off at Telegram's per-message limit.
  const parts = chunk(text);
  for (let i = 0; i < parts.length; i++) {
    const body = parts.length > 1 ? `${parts[i]}\n\n(${i + 1}/${parts.length})` : parts[i];
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: body,
        ...(opts.html ? { parse_mode: "HTML" } : {}),
        disable_web_page_preview: true,
      }),
    });
    const raw = await res.text();
    if (!res.ok) {
      return { sent: false, reason: `Telegram ${res.status}: ${raw.slice(0, 200)}`, chatId };
    }
    try {
      const parsed = JSON.parse(raw) as { ok?: boolean; description?: string };
      if (parsed.ok === false) {
        return { sent: false, reason: parsed.description ?? "Telegram rejected the message", chatId };
      }
    } catch {
      /* non-JSON success body is fine */
    }
  }
  return { sent: true, chatId };
}

