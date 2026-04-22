import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Wand2, AlertCircle } from "lucide-react";

type AllocationRow = {
  employee_id: string;
  employee_name: string;
  allocated_days: number;
  carried_over_days: number;
  action: string;
};

type VacationPolicy = {
  id: string;
  name: string;
  min_age: number;
  min_tenure_years: number;
  vacation_days: number;
  max_carry_over_days: number;
  is_active: boolean;
  priority: number;
  description: string | null;
};

export function AutoAllocateDialog() {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(new Date().getFullYear());
  const [preview, setPreview] = useState<AllocationRow[] | null>(null);
  const qc = useQueryClient();

  const { data: policies } = useQuery({
    queryKey: ["vacation_policies"],
    enabled: open,
    queryFn: async (): Promise<VacationPolicy[]> => {
      const { data, error } = await supabase
        .from("vacation_policies")
        .select("*")
        .order("priority", { ascending: false });
      if (error) throw error;
      return (data || []) as VacationPolicy[];
    },
  });

  const previewMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("auto_allocate_vacation", {
        p_year: year,
        p_dry_run: true,
      });
      if (error) throw error;
      return (data || []) as AllocationRow[];
    },
    onSuccess: (data) => setPreview(data),
    onError: (e: Error) => toast.error(`Preview failed: ${e.message}`),
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("auto_allocate_vacation", {
        p_year: year,
        p_dry_run: false,
      });
      if (error) throw error;
      return (data || []) as AllocationRow[];
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["leave_allocations"] });
      qc.invalidateQueries({ queryKey: ["leave_balances"] });
      toast.success(`Allocated vacation for ${data.length} employees`);
      setOpen(false);
      setPreview(null);
    },
    onError: (e: Error) => toast.error(`Failed: ${e.message}`),
  });

  const totalDays = preview?.reduce((s, r) => s + Number(r.allocated_days), 0) || 0;
  const totalCarry = preview?.reduce((s, r) => s + Number(r.carried_over_days), 0) || 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPreview(null); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Wand2 className="h-4 w-4 mr-1" />
          Auto-allocate
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Auto-allocate vacation</DialogTitle>
          <DialogDescription>
            Calculate vacation days per employee based on age and tenure, using active policies. Carry-over from previous year is included automatically (capped per policy).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Year</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => { setYear(Number(e.target.value)); setPreview(null); }}
                className="w-28"
              />
            </div>
            <Button onClick={() => previewMut.mutate()} disabled={previewMut.isPending}>
              {previewMut.isPending ? "Calculating…" : "Preview"}
            </Button>
          </div>

          {policies && policies.length > 0 && (
            <div className="rounded-md border bg-muted/30 p-3">
              <p className="text-xs font-medium mb-2">Active policies (highest priority wins):</p>
              <div className="space-y-1">
                {policies.filter(p => p.is_active).map((p) => (
                  <div key={p.id} className="flex items-center justify-between text-xs">
                    <span>
                      <Badge variant="outline" className="mr-2">{p.vacation_days} days</Badge>
                      {p.name}
                      {p.min_age > 0 && <span className="text-muted-foreground"> · age {p.min_age}+</span>}
                      {p.min_tenure_years > 0 && <span className="text-muted-foreground"> · {p.min_tenure_years}y tenure</span>}
                    </span>
                    <span className="text-muted-foreground">priority {p.priority}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {preview && preview.length === 0 && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>No active employees found.</AlertDescription>
            </Alert>
          )}

          {preview && preview.length > 0 && (
            <>
              <div className="flex gap-4 text-sm">
                <div><span className="text-muted-foreground">Employees:</span> <strong>{preview.length}</strong></div>
                <div><span className="text-muted-foreground">Total days:</span> <strong>{totalDays}</strong></div>
                <div><span className="text-muted-foreground">Carry-over:</span> <strong>{totalCarry.toFixed(1)}</strong></div>
              </div>
              <div className="max-h-80 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Days</TableHead>
                      <TableHead className="text-right">Carry-over</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.map((r) => (
                      <TableRow key={r.employee_id}>
                        <TableCell className="font-medium">{r.employee_name}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.allocated_days}</TableCell>
                        <TableCell className="text-right tabular-nums">{Number(r.carried_over_days).toFixed(1)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {(Number(r.allocated_days) + Number(r.carried_over_days)).toFixed(1)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.action.includes("create") ? "default" : "secondary"}>
                            {r.action.replace("would_", "")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Employees without birth date default to the statutory minimum (25 days). Add birth dates in the Employees tab for accurate tier matching.
                </AlertDescription>
              </Alert>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => applyMut.mutate()}
            disabled={!preview || preview.length === 0 || applyMut.isPending}
          >
            {applyMut.isPending ? "Applying…" : `Apply to ${preview?.length || 0} employees`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
