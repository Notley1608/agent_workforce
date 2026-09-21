import { z } from "zod";

export const ledgerEntrySchema = z.object({
  id: z.string(),
  kind: z.string(),
  amount: z.number(),
  note: z.string(),
  created_at: z.number(),
});

export const ledgerSchema = z.object({
  balance: z.number(),
  recovery_mode: z.boolean(),
  mode: z.enum(["running", "recovery", "emergency_stop"]),
  total_revenue: z.number(),
  total_cost: z.number(),
  entries: z.array(ledgerEntrySchema),
});

export type Ledger = z.infer<typeof ledgerSchema>;
