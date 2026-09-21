import { z } from "zod";
import { workflowStepSchema } from "./job";

export const workflowSchema = z.object({
  id: z.string(),
  name: z.string(),
  agent_ids: z.array(z.string()),
});

export type Workflow = z.infer<typeof workflowSchema>;

export const workflowRunSchema = z.object({
  id: z.string(),
  workflow_id: z.string(),
  status: z.string(),
  input: z.string(),
  steps: z.array(workflowStepSchema),
});

export type WorkflowRun = z.infer<typeof workflowRunSchema>;
