import { useMemo, useState } from "react";
import {
  usePayrollPreview,
  usePayrollExports,
  useGeneratePayroll,
  useLockPayroll,
  generateFortnoxCSV,
  generatePAXml,
  downloadFile,
  type PayrollPreviewRow,
  type PayrollExport,
} from "@/hooks/usePayroll";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, FileText, Lock, Play, AlertCircle, CheckCircle2 } from "lucide-react";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatSEK(cents: number): string {
  return new Intl.NumberFormat("sv-SE", { style: "currency", currency: "SEK" })
    .format(Number(cents) / 100);
}

export function PayrollExportPanel() {
  const now = new Date();
  // Default to previous month (typical payroll workflow)
  const defaultDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [year, setYear] = useState(defaultDate.getFullYear());
  const [month, setMonth] = useState(defaultDate.getMonth() + 1);

  const { data: preview, isLoading: previewLoading } = usePayrollPreview(year, month);
  const { data: exports, isLoading: exportsLoading } = usePayrollExports();
  const generateMut = useGeneratePayroll();
  const lockMut = useLockPayroll();

  const existingExport = useMemo<PayrollExport | undefined>(
    () => exports?.find((e) => e.period_year === year && e.period_month === month),
    [exports, year, month]
  );

  const totals = useMemo(() => {
    if (!preview) return { employees: 0, days: 0, cents: 0 };
    return preview.reduce(
      (acc, r) => ({
        employees: acc.employees + 1,
        days: acc.days + Number(r.vacation_days) + Number(r.sick_days) + Number(r.parental_days) + Number(r.other_leave_days),
        cents: acc.cents + Number(r.expense_reimbursement_cents) + Number(r.representation_cents),
      }),
      { employees: 0, days: 0, cents: 0 }
    );
  }, [preview]);

  const missingPersonalNumbers = useMemo(
    () => preview?.filter((r) => !r.personal_number).length || 0,
    [preview]
  );

  const handleDownloadCSV = (rows: PayrollPreviewRow[]) => {
    const csv = generateFortnoxCSV(rows, year, month);
    // Add BOM for Excel/Fortnox to detect UTF-8 with Swedish characters
    downloadFile("\ufeff" + csv, `payroll-${year}-${String(month).padStart(2, "0")}.csv`, "text/csv;charset=utf-8");
  };

  const handleDownloadPAXml = (rows: PayrollPreviewRow[]) => {
    const xml = generatePAXml(rows, year, month);
    downloadFile(xml, `payroll-${year}-${String(month).padStart(2, "0")}.paxml.xml`, "application/xml;charset=utf-8");
  };

  const yearOptions = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Period</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Year</label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Month</label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {existingExport && (
            <Badge variant={existingExport.status === "locked" ? "default" : "secondary"} className="ml-auto">
              {existingExport.status === "locked" ? <><Lock className="h-3 w-3 mr-1" /> Locked</> : "Generated"}
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Employees</p>
          <p className="text-2xl font-bold">{previewLoading ? "…" : totals.employees}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Total leave days</p>
          <p className="text-2xl font-bold">{previewLoading ? "…" : totals.days.toFixed(1)}</p>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Total reimbursements</p>
          <p className="text-2xl font-bold">{previewLoading ? "…" : formatSEK(totals.cents)}</p>
        </CardContent></Card>
      </div>

      {missingPersonalNumbers > 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {missingPersonalNumbers} employee(s) are missing personal numbers. PAXml requires these for payroll system import. Add them in the Employees tab.
          </AlertDescription>
        </Alert>
      )}

      {/* Preview / Export */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">
            {existingExport ? "Export" : "Preview"} — {MONTHS[month - 1]} {year}
          </CardTitle>
          <div className="flex gap-2">
            {!existingExport && preview && preview.length > 0 && (
              <Button
                size="sm"
                onClick={() => generateMut.mutate({ year, month })}
                disabled={generateMut.isPending}
              >
                <Play className="h-4 w-4 mr-1" />
                Generate export
              </Button>
            )}
            {existingExport && existingExport.status === "generated" && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => generateMut.mutate({ year, month })}
                  disabled={generateMut.isPending}
                >
                  Regenerate
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => lockMut.mutate(existingExport.id)}
                  disabled={lockMut.isPending}
                >
                  <Lock className="h-4 w-4 mr-1" />
                  Lock period
                </Button>
              </>
            )}
            {preview && preview.length > 0 && (
              <>
                <Button size="sm" variant="outline" onClick={() => handleDownloadCSV(preview)}>
                  <Download className="h-4 w-4 mr-1" />
                  Fortnox CSV
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleDownloadPAXml(preview)}>
                  <FileText className="h-4 w-4 mr-1" />
                  PAXml
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {previewLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !preview || preview.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
              <p>No approved leave or expenses to export for {MONTHS[month - 1]} {year}.</p>
              {existingExport && <p className="text-xs mt-1">All source rows already linked to this export.</p>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Personal #</TableHead>
                    <TableHead className="text-right">Vac</TableHead>
                    <TableHead className="text-right">Sick</TableHead>
                    <TableHead className="text-right">Paren</TableHead>
                    <TableHead className="text-right">Other</TableHead>
                    <TableHead className="text-right">Expenses</TableHead>
                    <TableHead className="text-right">Repr.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.map((r) => (
                    <TableRow key={r.employee_id}>
                      <TableCell className="font-medium">
                        {r.employee_name}
                        {r.employee_email && <div className="text-xs text-muted-foreground">{r.employee_email}</div>}
                      </TableCell>
                      <TableCell>
                        {r.personal_number || <Badge variant="outline" className="text-xs">missing</Badge>}
                      </TableCell>
                      <TableCell className="text-right">{Number(r.vacation_days) || "—"}</TableCell>
                      <TableCell className="text-right">{Number(r.sick_days) || "—"}</TableCell>
                      <TableCell className="text-right">{Number(r.parental_days) || "—"}</TableCell>
                      <TableCell className="text-right">{Number(r.other_leave_days) || "—"}</TableCell>
                      <TableCell className="text-right">{Number(r.expense_reimbursement_cents) > 0 ? formatSEK(r.expense_reimbursement_cents) : "—"}</TableCell>
                      <TableCell className="text-right">{Number(r.representation_cents) > 0 ? formatSEK(r.representation_cents) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Export history</CardTitle>
        </CardHeader>
        <CardContent>
          {exportsLoading ? (
            <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : !exports || exports.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No exports yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Employees</TableHead>
                  <TableHead className="text-right">Days</TableHead>
                  <TableHead className="text-right">Reimbursements</TableHead>
                  <TableHead>Generated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exports.map((e) => (
                  <TableRow
                    key={e.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => { setYear(e.period_year); setMonth(e.period_month); }}
                  >
                    <TableCell className="font-medium">{MONTHS[e.period_month - 1]} {e.period_year}</TableCell>
                    <TableCell>
                      <Badge variant={e.status === "locked" ? "default" : "secondary"}>
                        {e.status === "locked" && <Lock className="h-3 w-3 mr-1" />}
                        {e.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{e.total_employees}</TableCell>
                    <TableCell className="text-right">{Number(e.total_leave_days).toFixed(1)}</TableCell>
                    <TableCell className="text-right">{formatSEK(e.total_expense_cents)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.generated_at ? new Date(e.generated_at).toLocaleString("sv-SE") : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
