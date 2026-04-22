import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PayrollPreviewRow = {
  employee_id: string;
  employee_name: string;
  employee_email: string | null;
  personal_number: string | null;
  vacation_days: number;
  sick_days: number;
  parental_days: number;
  other_leave_days: number;
  expense_reimbursement_cents: number;
  representation_cents: number;
  expense_count: number;
  leave_request_ids: string[];
  expense_ids: string[];
};

export type PayrollExport = {
  id: string;
  period_year: number;
  period_month: number;
  status: "draft" | "generated" | "locked";
  format: string;
  csv_content: string | null;
  paxml_content: string | null;
  total_employees: number;
  total_leave_days: number;
  total_expense_cents: number;
  currency: string;
  generated_at: string | null;
  locked_at: string | null;
  notes: string | null;
  created_at: string;
};

export type PayrollExportLine = {
  id: string;
  export_id: string;
  employee_id: string;
  employee_name: string;
  employee_email: string | null;
  personal_number: string | null;
  vacation_days: number;
  sick_days: number;
  parental_days: number;
  other_leave_days: number;
  expense_reimbursement_cents: number;
  representation_cents: number;
  expense_count: number;
};

export function usePayrollPreview(year: number, month: number, enabled = true) {
  return useQuery({
    queryKey: ["payroll-preview", year, month],
    enabled,
    queryFn: async (): Promise<PayrollPreviewRow[]> => {
      const { data, error } = await supabase.rpc("preview_payroll_period", {
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      return (data || []) as PayrollPreviewRow[];
    },
  });
}

export function usePayrollExports() {
  return useQuery({
    queryKey: ["payroll-exports"],
    queryFn: async (): Promise<PayrollExport[]> => {
      const { data, error } = await supabase
        .from("payroll_exports")
        .select("*")
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false });
      if (error) throw error;
      return (data || []) as PayrollExport[];
    },
  });
}

export function usePayrollExportLines(exportId: string | null) {
  return useQuery({
    queryKey: ["payroll-export-lines", exportId],
    enabled: !!exportId,
    queryFn: async (): Promise<PayrollExportLine[]> => {
      const { data, error } = await supabase
        .from("payroll_export_lines")
        .select("*")
        .eq("export_id", exportId!)
        .order("employee_name");
      if (error) throw error;
      return (data || []) as PayrollExportLine[];
    },
  });
}

export function useGeneratePayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ year, month }: { year: number; month: number }) => {
      const { data, error } = await supabase.rpc("generate_payroll_export", {
        p_year: year,
        p_month: month,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-exports"] });
      qc.invalidateQueries({ queryKey: ["payroll-preview"] });
      toast.success("Payroll export generated");
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });
}

export function useLockPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (exportId: string) => {
      const { data, error } = await supabase.rpc("lock_payroll_export", { p_export_id: exportId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["payroll-exports"] });
      toast.success("Period locked");
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });
}

// ── File generation ───────────────────────────────────────────────────────────

function escapeCSV(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (s.includes(",") || s.includes("\"") || s.includes("\n") || s.includes(";")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function generateFortnoxCSV(
  rows: PayrollPreviewRow[] | PayrollExportLine[],
  year: number,
  month: number
): string {
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const headers = [
    "Period",
    "Personnummer",
    "Anställdsnamn",
    "Email",
    "Semester (dgr)",
    "Sjuk (dgr)",
    "Föräldra (dgr)",
    "Övrig ledighet (dgr)",
    "Utlägg (SEK)",
    "Representation (SEK)",
    "Antal utlägg",
  ];
  const lines = [headers.join(";")];
  for (const r of rows) {
    lines.push([
      period,
      escapeCSV(r.personal_number || ""),
      escapeCSV(r.employee_name),
      escapeCSV(r.employee_email || ""),
      Number(r.vacation_days).toFixed(1).replace(".", ","),
      Number(r.sick_days).toFixed(1).replace(".", ","),
      Number(r.parental_days).toFixed(1).replace(".", ","),
      Number(r.other_leave_days).toFixed(1).replace(".", ","),
      (Number(r.expense_reimbursement_cents) / 100).toFixed(2).replace(".", ","),
      (Number(r.representation_cents) / 100).toFixed(2).replace(".", ","),
      String(r.expense_count),
    ].join(";"));
  }
  return lines.join("\r\n");
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate PAXml — Swedish standard payroll XML used by Visma/Hogia/Kontek.
 * Uses simplified PAXml 2.x structure with absence (frånvaro) and salary additions.
 * Real production exports may need company-specific tuning.
 */
export function generatePAXml(
  rows: PayrollPreviewRow[] | PayrollExportLine[],
  year: number,
  month: number
): string {
  const period = `${year}-${String(month).padStart(2, "0")}`;
  const startDate = `${period}-01`;
  const endDate = `${period}-${new Date(year, month, 0).getDate()}`;

  const employeeXml = rows.map((r) => {
    const empNo = r.personal_number || r.employee_id.slice(0, 8);
    const absences: string[] = [];
    if (Number(r.vacation_days) > 0) {
      absences.push(`      <frånvaro typ="SEM" omf="100">
        <datum fr="${startDate}" tom="${endDate}"/>
        <tim>${(Number(r.vacation_days) * 8).toFixed(2)}</tim>
      </frånvaro>`);
    }
    if (Number(r.sick_days) > 0) {
      absences.push(`      <frånvaro typ="SJK" omf="100">
        <datum fr="${startDate}" tom="${endDate}"/>
        <tim>${(Number(r.sick_days) * 8).toFixed(2)}</tim>
      </frånvaro>`);
    }
    if (Number(r.parental_days) > 0) {
      absences.push(`      <frånvaro typ="FPE" omf="100">
        <datum fr="${startDate}" tom="${endDate}"/>
        <tim>${(Number(r.parental_days) * 8).toFixed(2)}</tim>
      </frånvaro>`);
    }
    if (Number(r.other_leave_days) > 0) {
      absences.push(`      <frånvaro typ="OAV" omf="100">
        <datum fr="${startDate}" tom="${endDate}"/>
        <tim>${(Number(r.other_leave_days) * 8).toFixed(2)}</tim>
      </frånvaro>`);
    }

    const additions: string[] = [];
    if (Number(r.expense_reimbursement_cents) > 0) {
      additions.push(`      <löneart artnr="UTL">
        <benämning>Utläggsersättning</benämning>
        <antal>1</antal>
        <á-pris>${(Number(r.expense_reimbursement_cents) / 100).toFixed(2)}</á-pris>
        <belopp>${(Number(r.expense_reimbursement_cents) / 100).toFixed(2)}</belopp>
      </löneart>`);
    }
    if (Number(r.representation_cents) > 0) {
      additions.push(`      <löneart artnr="REP">
        <benämning>Representation</benämning>
        <antal>1</antal>
        <á-pris>${(Number(r.representation_cents) / 100).toFixed(2)}</á-pris>
        <belopp>${(Number(r.representation_cents) / 100).toFixed(2)}</belopp>
      </löneart>`);
    }

    return `  <anställd anstid="${xmlEscape(empNo)}">
    <namn>${xmlEscape(r.employee_name)}</namn>
${r.personal_number ? `    <persnr>${xmlEscape(r.personal_number)}</persnr>` : ""}
${r.employee_email ? `    <epost>${xmlEscape(r.employee_email)}</epost>` : ""}
    <löneperiod fr="${startDate}" tom="${endDate}">
${absences.join("\n")}
${additions.join("\n")}
    </löneperiod>
  </anställd>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<paxml xmlns="http://www.lonefakta.se/schema/paxml" version="2.0">
  <header>
    <programnamn>FlowWink</programnamn>
    <programversion>1.0</programversion>
    <skapad>${new Date().toISOString()}</skapad>
    <period>${period}</period>
  </header>
${employeeXml}
</paxml>`;
}

export function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
