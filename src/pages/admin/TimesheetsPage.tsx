import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WeeklyTimesheetTab } from '@/components/admin/timesheets/WeeklyTimesheetTab';
import { ProjectsTab } from '@/components/admin/timesheets/ProjectsTab';
import { TasksTab } from '@/components/admin/timesheets/TasksTab';
import { BudgetTab } from '@/components/admin/timesheets/BudgetTab';

export default function TimesheetsPage() {
  return (
    <AdminLayout>
    <div className="space-y-6">
      <AdminPageHeader
        title="Projects & Timesheets"
        description="Manage projects, tasks, time tracking and budgets"
      />

      <Tabs defaultValue="tasks" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tasks">Tasks</TabsTrigger>
          <TabsTrigger value="weekly">Timesheet</TabsTrigger>
          <TabsTrigger value="budget">Budget</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
        </TabsList>

        <TabsContent value="tasks">
          <TasksTab />
        </TabsContent>
        <TabsContent value="weekly">
          <WeeklyTimesheetTab />
        </TabsContent>
        <TabsContent value="budget">
          <BudgetTab />
        </TabsContent>
        <TabsContent value="projects">
          <ProjectsTab />
        </TabsContent>
      </Tabs>
    </div>
    </AdminLayout>
  );
}
