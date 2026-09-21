import { useQuery } from "@tanstack/react-query";
import { apiGet } from "./client";
import { ledgerSchema } from "../schemas/ledger";

export function useLedger() {
  return useQuery({
    queryKey: ["ledger"],
    queryFn: () => apiGet("/ledger", ledgerSchema),
    refetchInterval: 10000,
  });
}
