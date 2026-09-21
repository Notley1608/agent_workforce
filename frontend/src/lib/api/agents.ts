import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiGet, apiPost } from "./client";
import { agentSchema, agentDraftSchema, type AgentDraft } from "../schemas/agent";
import { jobSchema } from "../schemas/job";

export function useAgents() {
  return useQuery({
    queryKey: ["agents"],
    queryFn: () => apiGet("/agents", z.array(agentSchema)),
    refetchInterval: 4000,
  });
}

export function useAgentJobs(agentId: string, { live = false }: { live?: boolean } = {}) {
  return useQuery({
    queryKey: ["agents", agentId, "jobs"],
    queryFn: () => apiGet(`/agents/${agentId}/jobs`, z.array(jobSchema)),
    refetchInterval: (query) => {
      if (!live) return false;
      const jobs = query.state.data;
      const hasActiveJob = jobs?.some((j) => j.status === "running" || j.status === "pending");
      return hasActiveJob ? 1000 : false;
    },
  });
}

export function useCreateAgent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      role: string;
      role_type: "researcher" | "worker";
      capabilities_override?: string[] | null;
      avatar?: string;
      provider?: string;
      model?: string;
      instructions?: string;
    }) => apiPost("/agents", agentSchema, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useProposeAgent() {
  return useMutation({
    mutationFn: (body: { brief: string }) => apiPost("/agents/propose", agentDraftSchema, body),
  });
}

export type { AgentDraft };

export function useAssignTask(agentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { input: string }) => apiPost(`/agents/${agentId}/tasks`, jobSchema, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
      queryClient.invalidateQueries({ queryKey: ["agents", agentId, "jobs"] });
    },
  });
}

const okSchema = z.object({ ok: z.boolean() });

export function useCancelJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiPost(`/jobs/${jobId}/cancel`, jobSchema),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agents"] });
    },
  });
}

export function useApproveJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiPost(`/jobs/${jobId}/approve`, z.object({ ok: z.boolean(), output: z.string() })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
  });
}

export function useRejectJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => apiPost(`/jobs/${jobId}/reject`, okSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agents"] }),
  });
}

const jobEventSchema = z.object({ id: z.string(), job_id: z.string(), label: z.string(), created_at: z.number() });

export function useJobTimeline(jobId: string | null) {
  return useQuery({
    queryKey: ["jobs", jobId, "timeline"],
    queryFn: () => apiGet(`/jobs/${jobId}/timeline`, z.array(jobEventSchema)),
    enabled: jobId !== null,
  });
}
