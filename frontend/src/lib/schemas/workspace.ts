import { z } from "zod";

export const infrastructureItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  enabled: z.coerce.boolean(),
});

export type InfrastructureItem = z.infer<typeof infrastructureItemSchema>;

export const usageSchema = z.object({
  total_cost: z.number(),
  total_input_tokens: z.number(),
  total_output_tokens: z.number(),
  total_jobs: z.number(),
  today_cost: z.number(),
});

export type Usage = z.infer<typeof usageSchema>;

export const settingsSchema = z.object({
  daily_spend_limit: z.number().nullable(),
  recovery_threshold: z.number().nullable(),
  emergency_stop: z.boolean(),
  operating_mode: z.enum(["running", "recovery", "emergency_stop"]),
});

export type Settings = z.infer<typeof settingsSchema>;

export const activityEventSchema = z.object({
  ts: z.number(),
  label: z.string(),
});

export type ActivityEvent = z.infer<typeof activityEventSchema>;

export const orchestratorMessageSchema = z.object({
  id: z.string(),
  role: z.enum(["owner", "orchestrator"]),
  content: z.string(),
  created_at: z.number(),
});

export type OrchestratorMessage = z.infer<typeof orchestratorMessageSchema>;
