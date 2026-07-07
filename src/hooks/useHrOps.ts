import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logger } from "@/lib/logger";

type RpcName =
  | "manage_salary_grade"
  | "manage_training"
  | "manage_disciplinary"
  | "manage_shift";

async function callRpc<T = unknown>(fn: RpcName, args: Record<string, unknown>): Promise<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.rpc as any)(fn, args);
  if (error) {
    logger.error(`[hr-rpc] ${fn}`, error);
    throw error;
  }
  return data as T;
}

export function useHrQuery<T = unknown>(fn: RpcName, args: Record<string, unknown>, key: unknown[]) {
  return useQuery({
    queryKey: [fn, ...key],
    queryFn: () => callRpc<T>(fn, args),
  });
}

export function useHrMutation(fn: RpcName, invalidateKeys: string[][]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: Record<string, unknown>) => callRpc(fn, args),
    onSuccess: () => {
      for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: k });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Operation failed";
      toast.error(msg);
    },
  });
}

export { callRpc as hrRpc };
