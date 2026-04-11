import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useEmployees, useLeaveRequests } from "@/hooks/useEmployees";
import { EmployeeList } from "@/components/admin/hr/EmployeeList";
import { NewEmployeeDialog } from "@/components/admin/hr/NewEmployeeDialog";
import { LeaveRequestsPanel } from "@/components/admin/hr/LeaveRequestsPanel";
import { Users, CalendarOff, AlertTriangle } from "lucide-react";

export default function HRPage() {
  const { data: employees, isLoading: empLoading } = useEmployees();
  const { data: leaveRequests, isLoading: leaveLoading } = useLeaveRequests();

  const activeCount = employees?.filter((e) => e.status === "active").length || 0;
  const onLeaveCount = employees?.filter((e) => e.status === "on_leave").length || 0;
  const pendingLeave = leaveRequests?.filter((r) => r.status === "pending").length || 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="HR & Employees"
          description="Manage team members, leave requests, and onboarding"
        >
          <NewEmployeeDialog />
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
        </Tabs>
      </div>
    </AdminLayout>
  );
}
