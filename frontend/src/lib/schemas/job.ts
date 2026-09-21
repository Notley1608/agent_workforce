import { z } from "zod";

export const jobSchema = z.object({
  id: z.string(),
  agent_id: z.string(),
  input: z.string(),
  status: z.string(),
  output: z.string().nullable(),
  error: z.string().nullable(),
  tools_used: z.array(z.string()),
  cost: z.number().nullable(),
});

export type Job = z.infer<typeof jobSchema>;

export const workflowStepSchema = jobSchema.extend({
  agent_name: z.string(),
});

export type WorkflowStep = z.infer<typeof workflowStepSchema>;

export const jobEventSchema = z.object({
  id: z.string(),
  job_id: z.string(),
  label: z.string(),
  created_at: z.number(),
});

export type JobEvent = z.infer<typeof jobEventSchema>;
