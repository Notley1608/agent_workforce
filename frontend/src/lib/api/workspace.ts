import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiGet, apiPost } from "./client";
import {
  infrastructureItemSchema,
  usageSchema,
  settingsSchema,
  activityEventSchema,
  orchestratorMessageSchema,
} from "../schemas/workspace";

export function useInfrastructure() {
  return useQuery({
    queryKey: ["infrastructure"],
    queryFn: () => apiGet("/infrastructure", z.array(infrastructureItemSchema)),
  });
}

export function useToggleInfrastructure() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (key: string) => apiPost(`/infrastructure/${key}/toggle`, infrastructureItemSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["infrastructure"] }),
  });
}

export function useUsage() {
  return useQuery({
    queryKey: ["usage"],
    queryFn: () => apiGet("/usage", usageSchema),
    refetchInterval: 10000,
  });
}

export function useActivity() {
  return useQuery({
    queryKey: ["activity"],
    queryFn: () => apiGet("/activity", z.array(activityEventSchema)),
    refetchInterval: 5000,
  });
}

export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => apiGet("/settings", settingsSchema),
  });
}

export function useOrchestratorMessages() {
  return useQuery({
    queryKey: ["orchestrator", "messages"],
    queryFn: () => apiGet("/orchestrator/messages", z.array(orchestratorMessageSchema)),
  });
}

export function useAskOrchestrator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (question: string) => apiPost("/orchestrator/ask", z.object({ answer: z.string() }), { question }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orchestrator", "messages"] }),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { daily_limit?: number | null; recovery_threshold?: number | null; emergency_stop?: boolean }) =>
      apiPost("/settings", settingsSchema, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });
}
