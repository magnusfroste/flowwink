import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Employee, useUpdateEmployee } from "@/hooks/useEmployees";
import { format, differenceInDays } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { OnboardingPanel } from "./OnboardingPanel";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  on_leave: "bg-yellow-100 text-yellow-800",
  terminated: "bg-red-100 text-red-800",
};

function isRecentHire(startDate: string | null): boolean {
  if (!startDate) return false;
  const days = differenceInDays(new Date(), new Date(startDate));
  return days >= -7 && days <= 90;
}

export function EmployeeList({ employees }: { employees: Employee[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const update = useUpdateEmployee();

  if (!employees.length) {
    return <p className="text-muted-foreground text-center py-12">No employees yet. Add your first team member.</p>;
  }

  const nameById = new Map(employees.map((e) => [e.id, e.name]));

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Name</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Manager</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Start Date</TableHead>
          <TableHead>Onboarding</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((emp) => {
          const isOpen = expanded === emp.id;
          const showOnboarding = isRecentHire(emp.start_date);
          // Manager candidates: anyone except this employee and their descendants would form a cycle,
          // but DB trigger guards that. Filter only self here for UX.
          const managerCandidates = employees.filter((e) => e.id !== emp.id);

          return (
            <>
              <TableRow key={emp.id} className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : emp.id)}>
                <TableCell>
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </TableCell>
                <TableCell className="font-medium">
                  <div>
                    <p>{emp.name}</p>
                    {emp.email && <p className="text-xs text-muted-foreground">{emp.email}</p>}
                  </div>
                </TableCell>
                <TableCell>{emp.title || "—"}</TableCell>
                <TableCell>{emp.department || "—"}</TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={emp.manager_id ?? "none"}
                    onValueChange={(v) =>
                      update.mutate({ id: emp.id, manager_id: v === "none" ? null : v })
                    }
                  >
                    <SelectTrigger className="h-8 w-[180px]">
                      <SelectValue>
                        {emp.manager_id ? nameById.get(emp.manager_id) ?? "—" : "No manager"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No manager</SelectItem>
                      {managerCandidates.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="capitalize">{emp.employment_type.replace("_", " ")}</TableCell>
                <TableCell>{emp.start_date ? format(new Date(emp.start_date), "MMM d, yyyy") : "—"}</TableCell>
                <TableCell>
                  {showOnboarding ? (
                    <OnboardingPanel employeeId={emp.id} compact />
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={STATUS_COLORS[emp.status] || ""}>
                    {emp.status.replace("_", " ")}
                  </Badge>
                </TableCell>
              </TableRow>
              {isOpen && (
                <TableRow key={`${emp.id}-detail`}>
                  <TableCell colSpan={9} className="bg-muted/30">
                    <div className="p-4">
                      <OnboardingPanel employeeId={emp.id} startDate={emp.start_date} />
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </>
          );
        })}
      </TableBody>
    </Table>
  );
}
