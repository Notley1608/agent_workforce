import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiGet, apiPost } from "./client";
import { orchestratorMessageSchema } from "../schemas/workspace";

export function useOrchestratorMessages({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ["orchestrator", "messages"],
    queryFn: () => apiGet("/orchestrator/messages", z.array(orchestratorMessageSchema)),
    enabled,
  });
}

export function useAskOrchestrator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (question: string) => apiPost("/orchestrator/ask", z.object({ answer: z.string() }), { question }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["orchestrator", "messages"] }),
  });
}
