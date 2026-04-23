import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CalendarDays, Filter, AlertCircle } from "lucide-react";

type Employee = {
  id: string;
  name: string;
  email: string | null;
  department: string | null;
  status: string;
  title: string | null;
};

type Allocation = {
  employee_id: string;
  leave_type: string;
  year: number;
  allocated_days: number;
  carried_over_days: number;
};

type LeaveRow = {
  employee_id: string;
  leave_type: string;
  start_date: string;
  days: number;
  status: string;
};

type Row = {
  employee: Employee;
  leave_type: string;
  allocated: number;
  carried: number;
  used: number;
  pending: number;
  remaining: number;
};

const LEAVE_TYPES = ["vacation", "sick", "parental", "other"] as const;
const STATUSES = ["active", "on_leave", "terminated"] as const;

export function LeaveBalancesPanel() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [department, setDepartment] = useState<string>("all");
  const [status, setStatus] = useState<string>("active");
  const [leaveType, setLeaveType] = useState<string>("vacation");
  const [search, setSearch] = useState("");

  const employeesQ = useQuery({
    queryKey: ["hr_balances_employees"],
    queryFn: async (): Promise<Employee[]> => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,name,email,department,status,title")
        .order("name");
      if (error) throw error;
      return (data || []) as Employee[];
    },
  });

  const allocationsQ = useQuery({
    queryKey: ["hr_balances_allocations", year],
    queryFn: async (): Promise<Allocation[]> => {
      const { data, error } = await supabase
        .from("leave_allocations" as any)
        .select("employee_id,leave_type,year,allocated_days,carried_over_days")
        .eq("year", year);
      if (error) throw error;
      return (data || []) as unknown as Allocation[];
    },
  });

  const requestsQ = useQuery({
    queryKey: ["hr_balances_requests", year],
    queryFn: async (): Promise<LeaveRow[]> => {
      const start = `${year}-01-01`;
      const end = `${year}-12-31`;
      const { data, error } = await supabase
        .from("leave_requests")
        .select("employee_id,leave_type,start_date,days,status")
        .gte("start_date", start)
        .lte("start_date", end);
      if (error) throw error;
      return (data || []) as LeaveRow[];
    },
  });

  const departments = useMemo(() => {
    const set = new Set<string>();
    (employeesQ.data || []).forEach((e) => e.department && set.add(e.department));
    return Array.from(set).sort();
  }, [employeesQ.data]);

  const rows: Row[] = useMemo(() => {
    const emps = employeesQ.data || [];
    const allocs = allocationsQ.data || [];
    const reqs = requestsQ.data || [];

    return emps
      .filter((e) => (status === "all" ? true : e.status === status))
      .filter((e) => (department === "all" ? true : (e.department || "—") === department))
      .filter((e) =>
        search.trim()
          ? e.name.toLowerCase().includes(search.toLowerCase()) ||
            (e.email || "").toLowerCase().includes(search.toLowerCase())
          : true
      )
      .map((emp) => {
        const a = allocs.find(
          (x) => x.employee_id === emp.id && x.leave_type === leaveType
        );
        const empReqs = reqs.filter(
          (r) => r.employee_id === emp.id && r.leave_type === leaveType
        );
        const used = empReqs
          .filter((r) => r.status === "approved")
          .reduce((s, r) => s + Number(r.days), 0);
        const pending = empReqs
          .filter((r) => r.status === "pending")
          .reduce((s, r) => s + Number(r.days), 0);
        const allocated = Number(a?.allocated_days || 0);
        const carried = Number(a?.carried_over_days || 0);
        const remaining = allocated + carried - used - pending;
        return {
          employee: emp,
          leave_type: leaveType,
          allocated,
          carried,
          used,
          pending,
          remaining,
        };
      })
      .sort((a, b) => a.remaining - b.remaining);
  }, [employeesQ.data, allocationsQ.data, requestsQ.data, status, department, search, leaveType]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          allocated: acc.allocated + r.allocated,
          carried: acc.carried + r.carried,
          used: acc.used + r.used,
          pending: acc.pending + r.pending,
          remaining: acc.remaining + r.remaining,
        }),
        { allocated: 0, carried: 0, used: 0, pending: 0, remaining: 0 }
      ),
    [rows]
  );

  const isLoading = employeesQ.isLoading || allocationsQ.isLoading || requestsQ.isLoading;
  const noAllocation = rows.filter((r) => r.allocated === 0 && r.carried === 0).length;

  const yearOptions = useMemo(() => {
    const cur = new Date().getFullYear();
    return [cur - 1, cur, cur + 1];
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5" />
          Leave balances
        </CardTitle>
        <CardDescription>
          Per-employee balance for the selected period and leave type. Remaining = allocated + carry-over − approved − pending.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Filters */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="space-y-1">
            <Label className="text-xs flex items-center gap-1">
              <Filter className="h-3 w-3" /> Year
            </Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Leave type</Label>
            <Select value={leaveType} onValueChange={setLeaveType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAVE_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Department</Label>
            <Select value={department} onValueChange={setDepartment}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All departments</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Search</Label>
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or email"
            />
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-3 text-sm">
          <Badge variant="outline">Employees: <strong className="ml-1">{rows.length}</strong></Badge>
          <Badge variant="outline">Allocated: <strong className="ml-1 tabular-nums">{totals.allocated.toFixed(1)}</strong></Badge>
          <Badge variant="outline">Carry-over: <strong className="ml-1 tabular-nums">{totals.carried.toFixed(1)}</strong></Badge>
          <Badge variant="outline">Used: <strong className="ml-1 tabular-nums">{totals.used.toFixed(1)}</strong></Badge>
          <Badge variant="outline">Pending: <strong className="ml-1 tabular-nums">{totals.pending.toFixed(1)}</strong></Badge>
          <Badge>Remaining: <strong className="ml-1 tabular-nums">{totals.remaining.toFixed(1)}</strong></Badge>
        </div>

        {noAllocation > 0 && leaveType === "vacation" && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs">
              {noAllocation} employee(s) have no vacation allocation for {year}. Run <strong>Auto-allocate</strong> from the Allocations tab to seed them.
            </AlertDescription>
          </Alert>
        )}

        {/* Table */}
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Allocated</TableHead>
                <TableHead className="text-right">Carry-over</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead className="text-right">Pending</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={8}><Skeleton className="h-6 w-full" /></TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No employees match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((r) => (
                  <TableRow key={r.employee.id}>
                    <TableCell>
                      <div className="font-medium">{r.employee.name}</div>
                      <div className="text-xs text-muted-foreground">{r.employee.title || r.employee.email}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.employee.department || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.employee.status === "active" ? "default" : "secondary"} className="capitalize">
                        {r.employee.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.allocated.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.carried.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.used.toFixed(1)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.pending > 0 ? (
                        <span className="text-yellow-600 dark:text-yellow-500">{r.pending.toFixed(1)}</span>
                      ) : "0.0"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      <span className={r.remaining < 0 ? "text-destructive" : r.remaining < 5 ? "text-yellow-600 dark:text-yellow-500" : ""}>
                        {r.remaining.toFixed(1)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
