import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiGet, apiPost } from "./client";
import { planSchema } from "../schemas/plan";

export function usePlans() {
  return useQuery({
    queryKey: ["plans"],
    queryFn: () => apiGet("/plans", z.array(planSchema)),
    refetchInterval: 5000,
  });
}

export function useProposePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { objective: string; opportunity_id?: string | null }) => apiPost("/plans", planSchema, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plans"] }),
  });
}

const approvePlanSchema = z.object({
  plan_id: z.string(),
  workflow_id: z.string(),
  run_id: z.string(),
  agent_ids: z.array(z.string()),
});

export function useApprovePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => apiPost(`/plans/${planId}/approve`, approvePlanSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["plans"] });
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useRejectPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (planId: string) => apiPost(`/plans/${planId}/reject`, z.object({ ok: z.boolean() })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["plans"] }),
  });
}
