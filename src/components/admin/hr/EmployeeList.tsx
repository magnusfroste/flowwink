import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Employee } from "@/hooks/useEmployees";
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

  if (!employees.length) {
    return <p className="text-muted-foreground text-center py-12">No employees yet. Add your first team member.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Name</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Department</TableHead>
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
                  <TableCell colSpan={8} className="bg-muted/30">
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
