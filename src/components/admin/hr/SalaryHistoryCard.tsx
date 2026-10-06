import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useEmployees } from "@/hooks/useEmployees";
import { useHrQuery } from "@/hooks/useHrOps";
import { usePlatformFormat } from "@/hooks/usePlatformFormat";

type HistoryRow = {
  id: string;
  effective_date: string;
  previous_cents: number | null;
  new_cents: number;
  change_pct: number | null;
  source: "hire" | "manual" | "revision";
  reason: string | null;
  revision_name: string | null;
};

export function SalaryHistoryCard() {
  const { formatCurrency, formatDate } = usePlatformFormat();
  const { data: employees } = useEmployees();
  const [employeeId, setEmployeeId] = useState("");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Salary history</CardTitle>
        <CardDescription>Every salary change on record for one employee: hire, manual edits and revision rounds.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="max-w-sm">
          <Label>Employee</Label>
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
            <SelectContent>
              {employees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {employeeId && <HistoryTable employeeId={employeeId} formatCurrency={formatCurrency} formatDate={formatDate} />}
      </CardContent>
    </Card>
  );
}

function HistoryTable({ employeeId, formatCurrency, formatDate }: {
  employeeId: string;
  formatCurrency: (cents: number | null | undefined, currency?: string, opts?: Intl.NumberFormatOptions) => string;
  formatDate: (d: string | Date | null | undefined) => string;
}) {
  const q = useHrQuery<{ current_cents: number; history: HistoryRow[] }>("manage_compensation_revision", { p_action: "history", p_employee_id: employeeId }, ["history", employeeId]);
  if (q.isLoading) return <Skeleton className="h-24 w-full" />;
  if (!q.data) return null;
  return (
    <>
      <p className="text-sm text-muted-foreground">Current salary {formatCurrency(q.data.current_cents, undefined, { maximumFractionDigits: 0 })}/month.</p>
      {!q.data.history.length ? (
        <p className="text-sm text-muted-foreground">No change on record yet — history starts with the first change after this feature was installed.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Effective</TableHead>
              <TableHead>From</TableHead>
              <TableHead>To</TableHead>
              <TableHead>Change</TableHead>
              <TableHead>Source</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {q.data.history.map((h) => (
              <TableRow key={h.id}>
                <TableCell>{formatDate(h.effective_date)}</TableCell>
                <TableCell>{h.previous_cents != null ? formatCurrency(h.previous_cents, undefined, { maximumFractionDigits: 0 }) : "—"}</TableCell>
                <TableCell className="font-medium">{formatCurrency(h.new_cents, undefined, { maximumFractionDigits: 0 })}</TableCell>
                <TableCell>{h.change_pct != null ? `${h.change_pct > 0 ? "+" : ""}${h.change_pct} %` : "—"}</TableCell>
                <TableCell><Badge variant={h.source === "revision" ? "default" : "secondary"}>{h.source}</Badge></TableCell>
                <TableCell className="text-xs">{h.reason ?? h.revision_name ?? ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
