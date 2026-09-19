// Server fn: append a new list (built from screener results) to the user's
// user_data.lists jsonb array. Returns the created list id.

import { createServerFn } from "@tanstack/react-start";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";

interface Sym {
  ticker: string;
  name: string;
  yahoo: string;
  sector?: string;
}

export const saveResultsAsWatchlist = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((data: { name: string; symbols: Sym[]; color?: string }) => {
    if (!data?.name) throw new Error("name required");
    if (!Array.isArray(data?.symbols)) throw new Error("symbols required");
    return {
      name: data.name.trim().slice(0, 60),
      color: data.color ?? "#f59e0b",
      symbols: data.symbols.slice(0, 3000).map((s) => ({
        ticker: String(s.ticker),
        name: String(s.name ?? s.ticker),
        yahoo: String(s.yahoo),
        sector: s.sector ? String(s.sector) : undefined,
      })),
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: fetchErr } = await supabase
      .from("user_data")
      .select("lists")
      .eq("user_id", userId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);

    const id = `list_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const newList = {
      id,
      name: data.name,
      color: data.color,
      symbols: data.symbols,
      notes: {},
      kind: "scanning" as const,
    };

    const current = Array.isArray(existing?.lists) ? (existing!.lists as unknown[]) : [];
    const next = [...current, newList] as unknown as any;

    if (existing) {
      const { error } = await supabase
        .from("user_data")
        .update({ lists: next })
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("user_data")
        .insert({ user_id: userId, lists: next });
      if (error) throw new Error(error.message);
    }
    return { id, name: data.name, count: data.symbols.length, list: newList };
  });

// Merge (dedupe) screener results into an existing list OR into a brand-new
// named list, tagging each symbol's note with the scan(s) it came from so
// duplicates can be traced back to their source screener.
export const mergeResultsIntoWatchlist = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((data: {
    targetListId?: string | null;
    newListName?: string | null;
    scanName: string;
    symbols: Sym[];
    color?: string;
    mode?: "override" | "append";
  }) => {
    if (!Array.isArray(data?.symbols)) throw new Error("symbols required");
    if (!data?.scanName) throw new Error("scanName required");
    if (!data?.targetListId && !data?.newListName) {
      throw new Error("targetListId or newListName required");
    }
    return {
      targetListId: data.targetListId ?? null,
      newListName: data.newListName ? data.newListName.trim().slice(0, 60) : null,
      scanName: data.scanName.trim().slice(0, 60),
      mode: data.mode === "append" ? ("append" as const) : ("override" as const),
      color: data.color ?? "#f59e0b",
      symbols: data.symbols.slice(0, 3000).map((s) => ({
        ticker: String(s.ticker),
        name: String(s.name ?? s.ticker),
        yahoo: String(s.yahoo),
        sector: s.sector ? String(s.sector) : undefined,
      })),
    };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing, error: fetchErr } = await supabase
      .from("user_data")
      .select("lists")
      .eq("user_id", userId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);

    const current = Array.isArray(existing?.lists) ? ([...(existing!.lists as any[])]) : [];

    let targetIdx = -1;
    if (data.targetListId) {
      targetIdx = current.findIndex((l: any) => l?.id === data.targetListId);
      if (targetIdx === -1) throw new Error("Target watchlist not found");
    } else {
      const id = `list_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      current.push({
        id,
        name: data.newListName!,
        color: data.color,
        symbols: [],
        notes: {},
        kind: "scanning" as const,
      });
      targetIdx = current.length - 1;
    }

    const target = { ...current[targetIdx] };
    const override = data.mode === "override";
    // Override wipes the list's current members (and their notes) so it holds
    // exactly this scan's results; append keeps what's already there.
    const existingSyms: Sym[] = override
      ? []
      : Array.isArray(target.symbols)
        ? target.symbols
        : [];
    const existingNotes: Record<string, string> = override ? {} : { ...(target.notes ?? {}) };
    const removed = override
      ? (Array.isArray(target.symbols) ? target.symbols.length : 0)
      : 0;
    const haveYahoo = new Set(existingSyms.map((s) => s.yahoo));

    let added = 0;
    let tagged = 0;
    const tag = `Scan: ${data.scanName}`;
    for (const s of data.symbols) {
      const prev = existingNotes[s.yahoo] ?? "";
      const tags = prev ? prev.split(" | ") : [];
      if (!tags.includes(tag)) {
        tags.push(tag);
        existingNotes[s.yahoo] = tags.join(" | ");
        tagged++;
      }
      if (!haveYahoo.has(s.yahoo)) {
        existingSyms.push(s);
        haveYahoo.add(s.yahoo);
        added++;
      }
    }

    target.symbols = existingSyms;
    target.notes = existingNotes;
    current[targetIdx] = target;

    const payload = current as unknown as any;
    if (existing) {
      const { error } = await supabase
        .from("user_data")
        .update({ lists: payload })
        .eq("user_id", userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase
        .from("user_data")
        .insert({ user_id: userId, lists: payload });
      if (error) throw new Error(error.message);
    }
    return {
      id: target.id as string,
      name: target.name as string,
      added,
      tagged,
      removed,
      mode: data.mode,
      total: existingSyms.length,
    };
  });

// Lightweight listing of the user's existing watchlists for picker UIs.
export const listUserWatchlists = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("user_data")
      .select("lists")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const lists = Array.isArray(data?.lists) ? (data!.lists as any[]) : [];
    return {
      lists: lists.map((l) => ({
        id: String(l?.id ?? ""),
        name: String(l?.name ?? "Untitled"),
        color: String(l?.color ?? "#f59e0b"),
        count: Array.isArray(l?.symbols) ? l.symbols.length : 0,
      })).filter((l) => l.id),
    };
  });
