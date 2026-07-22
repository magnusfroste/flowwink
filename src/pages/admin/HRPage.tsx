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
import { Users, CalendarOff, AlertTriangle } from "lucide-react";
import { useState } from "react";
import { useOpenOnQueryParam } from "@/hooks/useOpenOnQueryParam";

export default function HRPage() {
  const { data: employees, isLoading: empLoading } = useEmployees();
  const { data: leaveRequests, isLoading: leaveLoading } = useLeaveRequests();
  const [newEmployeeOpen, setNewEmployeeOpen] = useState(false);
  useOpenOnQueryParam('new', '1', () => setNewEmployeeOpen(true));

  const activeCount = employees?.filter((e) => e.status === "active").length || 0;
  const onLeaveCount = employees?.filter((e) => e.status === "on_leave").length || 0;
  const pendingLeave = leaveRequests?.filter((r) => r.status === "pending").length || 0;

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader title="HR & Employees">
          <NewEmployeeDialog open={newEmployeeOpen} onOpenChange={setNewEmployeeOpen} />
        </AdminPageHeader>

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

        <Tabs defaultValue="employees">
          <TabsList>
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
          </TabsList>
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
