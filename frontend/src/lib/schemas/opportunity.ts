import { z } from "zod";

export const opportunitySchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.string(),
  forecast_value: z.number().nullable(),
  workflow_id: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.number(),
  updated_at: z.number(),
});

export type Opportunity = z.infer<typeof opportunitySchema>;
