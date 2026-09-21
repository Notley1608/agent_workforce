import { z } from "zod";

export const agentSchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  role_type: z.enum(["researcher", "worker"]),
  avatar: z.string(),
  provider: z.string(),
  model: z.string(),
  instructions: z.string(),
  status: z.string(),
  jobs_done: z.number(),
  jobs_completed: z.number(),
  total_cost: z.number(),
  current_job_input: z.string().nullable(),
});

export type Agent = z.infer<typeof agentSchema>;

export const agentDraftSchema = z.object({
  name: z.string(),
  role: z.string(),
  role_type: z.enum(["researcher", "worker"]),
  instructions: z.string(),
  capabilities_override: z.array(z.string()).nullable(),
});

export type AgentDraft = z.infer<typeof agentDraftSchema>;
