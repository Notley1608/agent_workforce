import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { apiGet, apiPost } from "./client";
import { opportunitySchema } from "../schemas/opportunity";
import { ledgerEntrySchema } from "../schemas/ledger";

export function useOpportunities() {
  return useQuery({
    queryKey: ["opportunities"],
    queryFn: () => apiGet("/opportunities", z.array(opportunitySchema)),
    refetchInterval: 5000,
  });
}

const opportunityDetailSchema = opportunitySchema.extend({
  ledger: z.array(ledgerEntrySchema),
  plan_ids: z.array(z.string()),
});

export function useOpportunity(opportunityId: string) {
  return useQuery({
    queryKey: ["opportunities", opportunityId],
    queryFn: () => apiGet(`/opportunities/${opportunityId}`, opportunityDetailSchema),
  });
}

export function useCreateOpportunity() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; description?: string; forecast_value?: number | null }) =>
      apiPost("/opportunities", opportunitySchema, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["opportunities"] }),
  });
}

export function useDiscoverOpportunities() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { hint?: string }) => apiPost("/opportunities/discover", z.array(opportunitySchema), body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["opportunities"] }),
  });
}

export function useSetOpportunityStatus(opportunityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (status: string) => apiPost(`/opportunities/${opportunityId}/status`, opportunitySchema, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
    },
  });
}

export function useRecordRevenue(opportunityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { amount: number; note?: string }) =>
      apiPost(`/opportunities/${opportunityId}/revenue`, opportunitySchema, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["opportunities"] });
      queryClient.invalidateQueries({ queryKey: ["ledger"] });
    },
  });
}

export function useRecordLearning(opportunityId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (note: string) => apiPost(`/opportunities/${opportunityId}/notes`, opportunitySchema, { note }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["opportunities", opportunityId] }),
  });
}
