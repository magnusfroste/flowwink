import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type OnboardingItem = { title: string; done: boolean };

export type OnboardingChecklist = {
  id: string;
  employee_id: string;
  title: string;
  items: OnboardingItem[];
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

function normalizeItems(items: unknown): OnboardingItem[] {
  if (!Array.isArray(items)) return [];
  return items
    .filter((i) => i && typeof i === "object")
    .map((i: any) => ({
      title: String(i.title ?? ""),
      done: Boolean(i.done),
    }));
}

export function useOnboardingChecklists(employeeId?: string) {
  return useQuery({
    queryKey: ["onboarding_checklists", employeeId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("onboarding_checklists").select("*").order("created_at", { ascending: false });
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((c: any) => ({ ...c, items: normalizeItems(c.items) })) as OnboardingChecklist[];
    },
  });
}

export function useToggleOnboardingItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      checklist_id,
      employee_id,
      index,
      done,
      currentItems,
    }: {
      checklist_id: string;
      employee_id: string;
      index: number;
      done: boolean;
      currentItems: OnboardingItem[];
    }) => {
      const item = currentItems[index];
      const next = currentItems.map((it, i) => (i === index ? { ...it, done } : it));
      const allDone = next.length > 0 && next.every((i) => i.done);
      const completed_at = allDone ? new Date().toISOString() : null;

      const { error } = await supabase
        .from("onboarding_checklists")
        .update({
          items: next as any,
          completed_at,
        })
        .eq("id", checklist_id);
      if (error) throw error;

      // Audit log — fire-and-forget, do not block UI on failure
      const { data: userData } = await supabase.auth.getUser();
      await supabase.from("audit_logs").insert({
        action: done ? "onboarding.item_completed" : "onboarding.item_uncompleted",
        entity_type: "onboarding_checklist",
        entity_id: checklist_id,
        user_id: userData?.user?.id ?? null,
        metadata: {
          employee_id,
          checklist_id,
          item_index: index,
          item_title: item?.title ?? null,
          done,
          checklist_completed: allDone,
          total_items: next.length,
          completed_items: next.filter((i) => i.done).length,
        },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding_checklists"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function onboardingProgress(items: OnboardingItem[]) {
  if (!items.length) return { done: 0, total: 0, pct: 0 };
  const done = items.filter((i) => i.done).length;
  return { done, total: items.length, pct: Math.round((done / items.length) * 100) };
}
