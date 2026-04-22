import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type Skill = { id: string; name: string; category: string | null; description: string | null };
export type EmployeeSkill = {
  id: string;
  employee_id: string;
  skill_id: string;
  proficiency_level: number | null;
  years_experience: number | null;
  notes: string | null;
  skills_catalog?: Skill;
};
export type Certification = {
  id: string;
  employee_id: string;
  name: string;
  issuer: string | null;
  certificate_number: string | null;
  issued_date: string | null;
  expires_at: string | null;
  document_url: string | null;
  notes: string | null;
};

export function useSkillsCatalog() {
  return useQuery({
    queryKey: ["skills_catalog"],
    queryFn: async () => {
      const { data, error } = await supabase.from("skills_catalog").select("*").order("name");
      if (error) throw error;
      return data as Skill[];
    },
  });
}

export function useEmployeeSkills(employeeId?: string) {
  return useQuery({
    queryKey: ["employee_skills", employeeId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("employee_skills").select("*, skills_catalog(*)");
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return data as EmployeeSkill[];
    },
  });
}

export function useCertifications(employeeId?: string) {
  return useQuery({
    queryKey: ["certifications", employeeId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("certifications").select("*").order("expires_at", { ascending: true, nullsFirst: false });
      if (employeeId) q = q.eq("employee_id", employeeId);
      const { data, error } = await q;
      if (error) throw error;
      return data as Certification[];
    },
  });
}

export function useUpsertEmployeeSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<EmployeeSkill> & { employee_id: string; skill_id: string }) => {
      const { error } = await supabase.from("employee_skills").upsert(input as any, { onConflict: "employee_id,skill_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee_skills"] });
      toast.success("Skill saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteEmployeeSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("employee_skills").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["employee_skills"] });
      toast.success("Skill removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpsertCertification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Certification> & { employee_id: string; name: string }) => {
      if (input.id) {
        const { error } = await supabase.from("certifications").update(input as any).eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("certifications").insert(input as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certifications"] });
      toast.success("Certification saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteCertification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("certifications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["certifications"] });
      toast.success("Certification removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function certificationStatus(expires_at: string | null): "expired" | "expiring" | "valid" | "none" {
  if (!expires_at) return "none";
  const days = Math.floor((new Date(expires_at).getTime() - Date.now()) / 86400000);
  if (days < 0) return "expired";
  if (days <= 30) return "expiring";
  return "valid";
}
