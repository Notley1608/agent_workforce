import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiDelete, apiGet, apiPost } from "./client";
import { automationSchema } from "../schemas/automation";

export function useAutomations(workflowId: string) {
  return useQuery({
    queryKey: ["automations", workflowId],
    queryFn: () => apiGet(`/workflows/${workflowId}/automations`, z.array(automationSchema)),
  });
}

export function useCreateAutomation(workflowId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { schedule_type: "interval" | "daily"; interval_minutes?: number | null; daily_at?: string | null; input: string }) =>
      apiPost(`/workflows/${workflowId}/automations`, automationSchema, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations", workflowId] }),
  });
}

export function useToggleAutomation(workflowId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (automationId: string) => apiPost(`/automations/${automationId}/toggle`, automationSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations", workflowId] }),
  });
}

export function useDeleteAutomation(workflowId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (automationId: string) => apiDelete(`/automations/${automationId}`, z.object({ ok: z.boolean() })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations", workflowId] }),
  });
}
