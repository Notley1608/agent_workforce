import { z } from "zod";

export const automationSchema = z.object({
  id: z.string(),
  workflow_id: z.string(),
  schedule_type: z.enum(["interval", "daily"]),
  interval_minutes: z.number().nullable(),
  daily_at: z.string().nullable(),
  input: z.string(),
  enabled: z.coerce.boolean(),
  next_run_at: z.number().nullable(),
  last_run_at: z.number().nullable(),
  last_run_status: z.string().nullable(),
});

export type Automation = z.infer<typeof automationSchema>;
