import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmployees, useLeaveRequests } from "@/hooks/useEmployees";
import { EmployeeList } from "@/components/admin/hr/EmployeeList";
import { NewEmployeeDialog } from "@/components/admin/hr/NewEmployeeDialog";
import { LeaveRequestsPanel } from "@/components/admin/hr/LeaveRequestsPanel";
import { LeaveAllocationsPanel } from "@/components/admin/hr/LeaveAllocationsPanel";
import { PayrollExportPanel } from "@/components/admin/hr/PayrollExportPanel";
import { OrgChart } from "@/components/admin/hr/OrgChart";
import { PerformancePanel } from "@/components/admin/hr/PerformancePanel";
import { AttendancePanel } from "@/components/admin/hr/AttendancePanel";
import { SkillsPanel } from "@/components/admin/hr/SkillsPanel";
import { ContractsPanel } from "@/components/admin/hr/ContractsPanel";
import { LeaveBalancesPanel } from "@/components/admin/hr/LeaveBalancesPanel";
import { CompensationPanel } from "@/components/admin/hr/CompensationPanel";
import { TrainingPanel } from "@/components/admin/hr/TrainingPanel";
import { DisciplinaryPanel } from "@/components/admin/hr/DisciplinaryPanel";
import { ShiftsPanel } from "@/components/admin/hr/ShiftsPanel";
import { HrGuide } from "@/components/admin/hr/HrGuide";
import { Users, CalendarOff, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useOpenOnQueryParam } from "@/hooks/useOpenOnQueryParam";
import { useWorkspace } from "@/hooks/useWorkspace";
import { activeItem } from "@/lib/workspaces";

export default function HRPage() {
  const { data: employees, isLoading: empLoading } = useEmployees();
  const { data: leaveRequests, isLoading: leaveLoading } = useLeaveRequests();
  const [newEmployeeOpen, setNewEmployeeOpen] = useState(false);
  // ?tab=leave from the dashboard's "Out today" tile — the Tabs used to
  // ignore it (defaultValue only) and every HR link landed on Employees.
  // HR is a workspace (src/lib/workspaces.ts): every view has its address, and
  // the menu is the panel on the left. The guide (hr_process_guide) is one
  // entry, not a gate: without ?tab= the page opens on it only while the
  // company has no employees yet — a founder starting out is led through it —
  // and on Employees after that. Anyone can open it again under "Start here".
  const [searchParams, setSearchParams] = useSearchParams();
  const urlTab = searchParams.get('tab');
  const landing = employees && employees.length === 0 ? 'guide' : 'employees';
  const tab = urlTab ?? landing;
  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params);
  };
  useEffect(() => {
    // Write the landing into the address once the employees are known, so the
    // menu marks it and the back button returns to it.
    if (urlTab || empLoading) return;
    const params = new URLSearchParams(searchParams);
    params.set('tab', landing);
    setSearchParams(params, { replace: true });
  }, [urlTab, empLoading, landing, searchParams, setSearchParams]);
  const workspace = useWorkspace();
  const current = workspace ? activeItem(workspace.def, '/admin/hr', `?tab=${tab}`) : null;
  useOpenOnQueryParam('new', '1', () => setNewEmployeeOpen(true));

  const activeCount = employees?.filter((e) => e.status === "active").length || 0;
  const onLeaveCount = employees?.filter((e) => e.status === "on_leave").length || 0;
  const pendingLeave = leaveRequests?.filter((r) => r.status === "pending").length || 0;

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader title={current?.label ?? "HR & Employees"}>
          <NewEmployeeDialog open={newEmployeeOpen} onOpenChange={setNewEmployeeOpen} />
        </AdminPageHeader>

        {(!workspace || tab === 'employees') && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{empLoading ? "…" : activeCount}</p>
                <p className="text-sm text-muted-foreground">Active Employees</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <CalendarOff className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{empLoading ? "…" : onLeaveCount}</p>
                <p className="text-sm text-muted-foreground">On Leave</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <AlertTriangle className="h-8 w-8 text-orange-500" />
              <div>
                <p className="text-2xl font-bold">{leaveLoading ? "…" : pendingLeave}</p>
                <p className="text-sm text-muted-foreground">Pending Requests</p>
              </div>
            </CardContent>
          </Card>
        </div>
        )}

        <Tabs value={tab} onValueChange={setTab}>
          {/* Fifteen tabs: they wrap instead of running off the page. Only
              without the workspace panel, which is the menu otherwise. */}
          {!workspace && <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="guide">Start here</TabsTrigger>
            <TabsTrigger value="employees">Employees</TabsTrigger>
            <TabsTrigger value="leave">Leave Requests{pendingLeave > 0 && ` (${pendingLeave})`}</TabsTrigger>
            <TabsTrigger value="allocations">Allocations</TabsTrigger>
            <TabsTrigger value="balances">Balances</TabsTrigger>
            <TabsTrigger value="payroll">Payroll</TabsTrigger>
            <TabsTrigger value="orgchart">Org Chart</TabsTrigger>
            <TabsTrigger value="performance">Performance</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="skills">Skills & Certs</TabsTrigger>
            <TabsTrigger value="contracts">Contracts</TabsTrigger>
            <TabsTrigger value="compensation">Compensation</TabsTrigger>
            <TabsTrigger value="training">Training</TabsTrigger>
            <TabsTrigger value="disciplinary">Disciplinary</TabsTrigger>
            <TabsTrigger value="shifts">Shifts</TabsTrigger>
          </TabsList>}
          <TabsContent value="guide">
            <HrGuide onOpenTab={setTab} onNewEmployee={() => setNewEmployeeOpen(true)} />
          </TabsContent>
          <TabsContent value="employees">
            <Card>
              <CardContent className="pt-6">
                {empLoading ? (
                  <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : (
                  <EmployeeList employees={employees || []} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="leave">
            <Card>
              <CardContent className="pt-6">
                {leaveLoading ? (
                  <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : (
                  <LeaveRequestsPanel requests={leaveRequests || []} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="allocations">
            <Card>
              <CardContent className="pt-6">
                {empLoading ? (
                  <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : (
                  <LeaveAllocationsPanel employees={employees || []} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="balances">
            <LeaveBalancesPanel />
          </TabsContent>
          <TabsContent value="payroll">
            <PayrollExportPanel />
          </TabsContent>
          <TabsContent value="orgchart">
            {empLoading ? (
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
            ) : (
              <OrgChart employees={employees || []} />
            )}
          </TabsContent>
          <TabsContent value="performance">
            <PerformancePanel />
          </TabsContent>
          <TabsContent value="attendance">
            <AttendancePanel />
          </TabsContent>
          <TabsContent value="skills">
            <SkillsPanel />
          </TabsContent>
          <TabsContent value="contracts">
            <ContractsPanel />
          </TabsContent>
          <TabsContent value="compensation">
            <CompensationPanel />
          </TabsContent>
          <TabsContent value="training">
            <TrainingPanel />
          </TabsContent>
          <TabsContent value="disciplinary">
            <DisciplinaryPanel />
          </TabsContent>
          <TabsContent value="shifts">
            <ShiftsPanel />
          </TabsContent>
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}
