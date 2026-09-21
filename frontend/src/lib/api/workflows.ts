import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiGet, apiPost } from "./client";
import { workflowSchema, workflowRunSchema } from "../schemas/workflow";

export function useWorkflows() {
  return useQuery({
    queryKey: ["workflows"],
    queryFn: () => apiGet("/workflows", z.array(workflowSchema)),
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; agent_ids: string[] }) => apiPost("/workflows", workflowSchema, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows"] }),
  });
}

export function useRunWorkflow(workflowId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: string) =>
      apiPost(`/workflows/${workflowId}/run`, z.object({ run_id: z.string(), status: z.string() }), { input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workflows", workflowId, "runs"] }),
  });
}

export function useWorkflowRuns(workflowId: string, { live = false }: { live?: boolean } = {}) {
  return useQuery({
    queryKey: ["workflows", workflowId, "runs"],
    queryFn: () => apiGet(`/workflows/${workflowId}/runs`, z.array(workflowRunSchema)),
    refetchInterval: (query) => {
      if (!live) return false;
      const runs = query.state.data;
      const hasActiveRun = runs?.some((r) => r.status === "running");
      return hasActiveRun ? 1000 : false;
    },
  });
}
