import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Employee, useUpdateEmployee } from "@/hooks/useEmployees";
import { differenceInDays } from "date-fns";
import { usePlatformFormat } from "@/hooks/usePlatformFormat";
import { ChevronDown, ChevronRight } from "lucide-react";
import { OnboardingPanel } from "./OnboardingPanel";
import { useAssignablePeople } from "@/hooks/useAssignablePeople";

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
  /* Kontot personen loggar in med. Tidrapporteringen hänger på employees,
     medan uppgifter och kapacitet hänger på kontot — utan den här länken går
     timmar och arbete inte att lägga bredvid varandra, och kapacitetsrapporten
     namngav alla "Unknown" (#519). */
  const { data: people = [] } = useAssignablePeople();
  const { formatDate } = usePlatformFormat();

  if (!employees.length) {
    return <p className="text-muted-foreground text-center py-12">No employees yet. Add your first team member.</p>;
  }

  const nameById = new Map(employees.map((e) => [e.id, e.name]));
  const accountName = new Map(people.map((p) => [p.id, p.name] as const));
  /* Kontot är unikt per anställd i databasen (partiellt unikt index), så ett
     redan taget konto visas men går inte att välja — annars möts man av ett
     databasfel i stället för ett svar. E-postmatchningen är ett FÖRSLAG, inte
     en automatisk koppling: en gissning som skriver sig själv är samma klass
     som kodens "Blog" (#513). Människan bekräftar. */
  const takenBy = new Map(
    employees.filter((e) => e.user_id).map((e) => [e.user_id as string, e.name] as const),
  );
  const accountsFor = (emp: Employee) => {
    const mail = (emp.email ?? "").trim().toLowerCase();
    return people
      .map((p) => ({
        id: p.id,
        name: p.name,
        matchesEmail: !!mail && (p.email ?? "").trim().toLowerCase() === mail,
        takenBy: takenBy.get(p.id) && takenBy.get(p.id) !== emp.name ? takenBy.get(p.id)! : null,
      }))
      .sort((a, b) => (a.matchesEmail === b.matchesEmail ? 0 : a.matchesEmail ? -1 : 1));
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-8" />
          <TableHead>Name</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>Department</TableHead>
          <TableHead>Manager</TableHead>
          <TableHead>Account</TableHead>
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
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Select
                    value={emp.user_id ?? "none"}
                    onValueChange={(v) =>
                      update.mutate({ id: emp.id, user_id: v === "none" ? null : v })
                    }
                  >
                    <SelectTrigger className="h-8 w-[190px]">
                      <SelectValue>
                        {emp.user_id ? accountName.get(emp.user_id) ?? "Unknown account" : "Not linked"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not linked</SelectItem>
                      {accountsFor(emp).map((a) => (
                        <SelectItem key={a.id} value={a.id} disabled={a.takenBy !== null}>
                          {a.name}
                          {a.matchesEmail ? " · same email" : ""}
                          {a.takenBy ? ` · already ${a.takenBy}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="capitalize">{emp.employment_type.replace("_", " ")}</TableCell>
                <TableCell>{emp.start_date ? formatDate(emp.start_date, { year: "numeric", month: "short", day: "numeric" }) : "—"}</TableCell>
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
                  {/* Följer antalet kolumner: 9 rubriker + chevronkolumnen. */}
                  <TableCell colSpan={10} className="bg-muted/30">
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
