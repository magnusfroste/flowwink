import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useEmployees } from "@/hooks/useEmployees";
import { useHrQuery, useHrMutation } from "@/hooks/useHrOps";

type Grade = {
  id: string;
  code: string;
  name: string;
  level: number;
  min_cents: number;
  mid_cents: number | null;
  max_cents: number;
  currency: string;
  is_active: boolean;
  employee_count: number;
};

type Compliance = {
  out_of_band: Array<{
    employee_id: string;
    name: string;
    grade: string;
    monthly_salary_cents: number | null;
    band_min_cents: number;
    band_max_cents: number;
    compa_ratio: number | null;
    issue: "below_band" | "above_band" | "no_salary_set";
  }>;
  ungraded_active_employees: number;
};

const fmt = (cents: number | null | undefined, ccy = "SEK") =>
  cents == null
    ? "—"
    : new Intl.NumberFormat("sv-SE", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(cents / 100);

export function CompensationPanel() {
  const { data: employees } = useEmployees();
  const gradesQ = useHrQuery<{ grades: Grade[] }>("manage_salary_grade", { p_action: "list" }, ["list"]);
  const complianceQ = useHrQuery<Compliance>("manage_salary_grade", { p_action: "compliance" }, ["compliance"]);

  const invalidate: string[][] = [["manage_salary_grade", "list"], ["manage_salary_grade", "compliance"]];
  const createMut = useHrMutation("manage_salary_grade", invalidate);
  const updateMut = useHrMutation("manage_salary_grade", invalidate);
  const deleteMut = useHrMutation("manage_salary_grade", invalidate);
  const assignMut = useHrMutation("manage_salary_grade", invalidate);

  const [dlgOpen, setDlgOpen] = useState(false);
  const [editing, setEditing] = useState<Grade | null>(null);
  const [form, setForm] = useState({ code: "", name: "", level: 1, min_kr: "", mid_kr: "", max_kr: "", currency: "SEK" });

  const openNew = () => {
    setEditing(null);
    setForm({ code: "", name: "", level: 1, min_kr: "", mid_kr: "", max_kr: "", currency: "SEK" });
    setDlgOpen(true);
  };
  const openEdit = (g: Grade) => {
    setEditing(g);
    setForm({
      code: g.code,
      name: g.name,
      level: g.level,
      min_kr: String(Math.round(g.min_cents / 100)),
      mid_kr: g.mid_cents != null ? String(Math.round(g.mid_cents / 100)) : "",
      max_kr: String(Math.round(g.max_cents / 100)),
      currency: g.currency,
    });
    setDlgOpen(true);
  };

  const submit = async () => {
    const base = {
      p_code: form.code,
      p_name: form.name,
      p_level: Number(form.level),
      p_min_cents: Math.round(Number(form.min_kr) * 100),
      p_mid_cents: form.mid_kr ? Math.round(Number(form.mid_kr) * 100) : null,
      p_max_cents: Math.round(Number(form.max_kr) * 100),
      p_currency: form.currency,
    };
    try {
      if (editing) {
        await updateMut.mutateAsync({ p_action: "update", p_grade_id: editing.id, ...base });
        toast.success("Grade updated");
      } else {
        await createMut.mutateAsync({ p_action: "create", ...base });
        toast.success("Grade created");
      }
      setDlgOpen(false);
    } catch {
      /* toast handled in useHrMutation */
    }
  };

  const [assignOpen, setAssignOpen] = useState(false);
  const [assignForm, setAssignForm] = useState({ employee_id: "", grade_id: "" });
  const doAssign = async () => {
    try {
      const res = await assignMut.mutateAsync({
        p_action: "assign",
        p_grade_id: assignForm.grade_id,
        p_employee_id: assignForm.employee_id,
      });
      const inBand = (res as { in_band?: boolean } | null)?.in_band;
      toast.success(inBand === false ? "Assigned — salary out of band" : "Assigned — in band");
      setAssignOpen(false);
    } catch {
      /* handled */
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Salary grades</CardTitle>
          <div className="flex gap-2">
            <Dialog open={assignOpen} onOpenChange={setAssignOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                  <UserPlus className="h-4 w-4 mr-2" /> Assign
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Assign employee to grade</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Employee</Label>
                    <Select value={assignForm.employee_id} onValueChange={(v) => setAssignForm((f) => ({ ...f, employee_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                      <SelectContent>
                        {employees?.map((e) => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Grade</Label>
                    <Select value={assignForm.grade_id} onValueChange={(v) => setAssignForm((f) => ({ ...f, grade_id: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select grade" /></SelectTrigger>
                      <SelectContent>
                        {gradesQ.data?.grades.map((g) => <SelectItem key={g.id} value={g.id}>{g.code} — {g.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={doAssign} disabled={!assignForm.employee_id || !assignForm.grade_id || assignMut.isPending}>Assign</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
              <DialogTrigger asChild>
                <Button size="sm" onClick={openNew}><Plus className="h-4 w-4 mr-2" /> New grade</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editing ? "Edit grade" : "New grade"}</DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
                  <div><Label>Level</Label><Input type="number" value={form.level} onChange={(e) => setForm({ ...form, level: Number(e.target.value) })} /></div>
                  <div className="col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                  <div><Label>Min (kr/mo)</Label><Input type="number" value={form.min_kr} onChange={(e) => setForm({ ...form, min_kr: e.target.value })} /></div>
                  <div><Label>Mid (kr/mo)</Label><Input type="number" value={form.mid_kr} onChange={(e) => setForm({ ...form, mid_kr: e.target.value })} /></div>
                  <div><Label>Max (kr/mo)</Label><Input type="number" value={form.max_kr} onChange={(e) => setForm({ ...form, max_kr: e.target.value })} /></div>
                  <div><Label>Currency</Label><Input value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} /></div>
                </div>
                <DialogFooter>
                  <Button onClick={submit} disabled={createMut.isPending || updateMut.isPending}>{editing ? "Save" : "Create"}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {gradesQ.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : !gradesQ.data?.grades.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No salary grades defined.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Level</TableHead>
                  <TableHead>Min</TableHead>
                  <TableHead>Mid</TableHead>
                  <TableHead>Max</TableHead>
                  <TableHead>Employees</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {gradesQ.data.grades.map((g) => (
                  <TableRow key={g.id}>
                    <TableCell className="font-mono text-xs">{g.code}</TableCell>
                    <TableCell>{g.name}</TableCell>
                    <TableCell>{g.level}</TableCell>
                    <TableCell>{fmt(g.min_cents, g.currency)}</TableCell>
                    <TableCell>{fmt(g.mid_cents, g.currency)}</TableCell>
                    <TableCell>{fmt(g.max_cents, g.currency)}</TableCell>
                    <TableCell>{g.employee_count}</TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(g)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive"
                        onClick={async () => {
                          if (!confirm(`Delete grade ${g.code}?`)) return;
                          try {
                            await deleteMut.mutateAsync({ p_action: "delete", p_grade_id: g.id });
                            toast.success("Deleted");
                          } catch { /* handled */ }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Band compliance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {complianceQ.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {complianceQ.data?.ungraded_active_employees ?? 0} active employees without an assigned grade.
              </p>
              {!complianceQ.data?.out_of_band.length ? (
                <p className="text-sm text-muted-foreground">All graded employees are within their band.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Salary</TableHead>
                      <TableHead>Band</TableHead>
                      <TableHead>Compa</TableHead>
                      <TableHead>Issue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {complianceQ.data.out_of_band.map((r) => (
                      <TableRow key={r.employee_id}>
                        <TableCell className="font-medium">{r.name}</TableCell>
                        <TableCell>{r.grade}</TableCell>
                        <TableCell>{fmt(r.monthly_salary_cents)}</TableCell>
                        <TableCell className="text-xs">{fmt(r.band_min_cents)} – {fmt(r.band_max_cents)}</TableCell>
                        <TableCell>{r.compa_ratio != null ? r.compa_ratio.toFixed(2) : "—"}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">{r.issue.replace(/_/g, " ")}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
