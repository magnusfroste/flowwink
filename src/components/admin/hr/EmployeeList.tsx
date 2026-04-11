import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Employee } from "@/hooks/useEmployees";
import { format } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  on_leave: "bg-yellow-100 text-yellow-800",
  terminated: "bg-red-100 text-red-800",
};

export function EmployeeList({ employees }: { employees: Employee[] }) {
  if (!employees.length) {
    return <p className="text-muted-foreground text-center py-12">No employees yet. Add your first team member.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Start Date</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {employees.map((emp) => (
          <TableRow key={emp.id}>
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
              <Badge variant="outline" className={STATUS_COLORS[emp.status] || ""}>
                {emp.status.replace("_", " ")}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
