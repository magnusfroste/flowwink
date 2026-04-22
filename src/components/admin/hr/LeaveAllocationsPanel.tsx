import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { Employee } from "@/hooks/useEmployees";
import {
  useDeleteLeaveAllocation,
  useLeaveAllocations,
  useUpsertLeaveAllocation,
} from "@/hooks/useLeaveBalances";

const LEAVE_TYPES = ["vacation", "sick", "parental", "other"] as const;

export function LeaveAllocationsPanel({ employees }: { employees: Employee[] }) {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [open, setOpen] = useState(false);

  const { data: allocations, isLoading } = useLeaveAllocations(undefined, year);
  const upsert = useUpsertLeaveAllocation();
  const remove = useDeleteLeaveAllocation();

  const [form, setForm] = useState({
    employee_id: "",
    leave_type: "vacation",
    year: currentYear,
    allocated_days: 25,
    carried_over_days: 0,
    notes: "",
  });

  const employeeName = (id: string) => employees.find((e) => e.id === id)?.name ?? "—";

  const submit = () => {
    if (!form.employee_id) return;
    upsert.mutate(
      {
        employee_id: form.employee_id,
        leave_type: form.leave_type,
        year: form.year,
        allocated_days: Number(form.allocated_days),
        carried_over_days: Number(form.carried_over_days),
        notes: form.notes || null,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({
            employee_id: "",
            leave_type: "vacation",
            year: currentYear,
            allocated_days: 25,
            carried_over_days: 0,
            notes: "",
          });
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Label htmlFor="year-filter" className="text-sm">
            Year
          </Label>
          <Input
            id="year-filter"
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || currentYear)}
            className="w-24"
          />
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" />
              Set allocation
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set leave allocation</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label>Employee</Label>
                <Select
                  value={form.employee_id}
                  onValueChange={(v) => setForm({ ...form, employee_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Leave type</Label>
                <Select
                  value={form.leave_type}
                  onValueChange={(v) => setForm({ ...form, leave_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAVE_TYPES.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Year</Label>
                <Input
                  type="number"
                  value={form.year}
                  onChange={(e) => setForm({ ...form, year: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Allocated days</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={form.allocated_days}
                  onChange={(e) => setForm({ ...form, allocated_days: Number(e.target.value) })}
                />
              </div>
              <div className="space-y-2">
                <Label>Carried over</Label>
                <Input
                  type="number"
                  step="0.5"
                  value={form.carried_over_days}
                  onChange={(e) =>
                    setForm({ ...form, carried_over_days: Number(e.target.value) })
                  }
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Notes (optional)</Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="e.g. Pro-rated for half year start"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submit} disabled={upsert.isPending || !form.employee_id}>
                {upsert.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : !allocations?.length ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No allocations for {year} yet. Click "Set allocation" to grant quota.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Allocated</TableHead>
              <TableHead className="text-right">Carried over</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {allocations.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{employeeName(a.employee_id)}</TableCell>
                <TableCell>
                  <Badge variant="outline" className="capitalize">
                    {a.leave_type}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(a.allocated_days)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {Number(a.carried_over_days)}
                </TableCell>
                <TableCell className="text-right tabular-nums font-medium">
                  {Number(a.allocated_days) + Number(a.carried_over_days)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                  {a.notes ?? ""}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => remove.mutate(a.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
