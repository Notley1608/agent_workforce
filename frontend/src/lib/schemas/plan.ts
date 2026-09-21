import { z } from "zod";

export const planStepSchema = z.object({
  name: z.string(),
  role: z.string(),
  provider: z.string(),
  model: z.string(),
  capabilities: z.array(z.string()),
  instructions: z.string(),
});

export type PlanStep = z.infer<typeof planStepSchema>;

export const planSchema = z.object({
  id: z.string(),
  objective: z.string(),
  summary: z.string(),
  steps: z.array(planStepSchema),
  warnings: z.array(z.string()),
  status: z.enum(["proposed", "approved", "rejected"]),
  workflow_id: z.string().nullable(),
  opportunity_id: z.string().nullable(),
});

export type Plan = z.infer<typeof planSchema>;
