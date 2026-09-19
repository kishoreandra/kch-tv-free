import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireApprovedAuth } from "@/lib/auth/approved-middleware";

// Shape stored in the DB. Kept loose so we can extend without breaking.
export interface TradeRow {
  id: string;
  user_id: string;
  symbol: string;
  entry_price: number;
  exit_price: number | null;
  quantity: number;
  entry_at: string;
  exit_at: string | null;
  setup: string | null;
  rationale: string | null;
  outcome: string | null;
  notes: string | null;
  tags: string[];
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
}

const tradeInput = z.object({
  symbol: z.string().trim().min(1).max(32).transform((s) => s.toUpperCase()),
  entry_price: z.number().positive(),
  exit_price: z.number().positive().nullable().optional(),
  quantity: z.number().int().positive(),
  entry_at: z.string().min(1),
  exit_at: z.string().nullable().optional(),
  setup: z.string().max(80).nullable().optional(),
  rationale: z.string().max(2000).nullable().optional(),
  outcome: z.enum(["win", "loss", "breakeven", "open"]).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  tags: z.array(z.string().max(40)).max(20).optional(),
  status: z.enum(["open", "closed"]).optional(),
});

function derive(input: z.infer<typeof tradeInput>) {
  const hasExit = input.exit_price != null && input.exit_at;
  const status: "open" | "closed" = input.status ?? (hasExit ? "closed" : "open");
  let outcome = input.outcome ?? null;
  if (status === "closed" && input.exit_price != null && !outcome) {
    const diff = input.exit_price - input.entry_price;
    outcome = diff > 0 ? "win" : diff < 0 ? "loss" : "breakeven";
  }
  if (status === "open") outcome = "open";
  return { status, outcome };
}

export const listTrades = createServerFn({ method: "GET" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await (supabase as any)
      .from("trades")
      .select("*")
      .eq("user_id", userId)
      .order("entry_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as TradeRow[];
  });

export const createTrade = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((input: unknown) => tradeInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { status, outcome } = derive(data);
    const row = {
      user_id: userId,
      symbol: data.symbol,
      entry_price: data.entry_price,
      exit_price: data.exit_price ?? null,
      quantity: data.quantity,
      entry_at: data.entry_at,
      exit_at: data.exit_at ?? null,
      setup: data.setup ?? null,
      rationale: data.rationale ?? null,
      outcome,
      notes: data.notes ?? null,
      tags: data.tags ?? [],
      status,
    };
    const { data: inserted, error } = await (supabase as any)
      .from("trades")
      .insert(row)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return inserted as TradeRow;
  });

const updateInput = tradeInput.extend({ id: z.string().uuid() });

export const updateTrade = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((input: unknown) => updateInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...rest } = data;
    const { status, outcome } = derive(rest);
    const patch = {
      symbol: rest.symbol,
      entry_price: rest.entry_price,
      exit_price: rest.exit_price ?? null,
      quantity: rest.quantity,
      entry_at: rest.entry_at,
      exit_at: rest.exit_at ?? null,
      setup: rest.setup ?? null,
      rationale: rest.rationale ?? null,
      outcome,
      notes: rest.notes ?? null,
      tags: rest.tags ?? [],
      status,
    };
    const { data: updated, error } = await (supabase as any)
      .from("trades")
      .update(patch)
      .eq("id", id)
      .eq("user_id", userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated as TradeRow;
  });

export const deleteTrade = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any)
      .from("trades")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAllTrades = createServerFn({ method: "POST" })
  .middleware([requireApprovedAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await (supabase as any)
      .from("trades")
      .delete()
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
