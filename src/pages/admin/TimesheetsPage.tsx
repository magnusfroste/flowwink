import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WeeklyTimesheetTab } from '@/components/admin/timesheets/WeeklyTimesheetTab';
import { ProjectsTab } from '@/components/admin/timesheets/ProjectsTab';

export default function TimesheetsPage() {
  return (
    <AdminLayout>
    <div className="space-y-6">
      <AdminPageHeader
        title="Timesheets"
        description="Track time per project and client"
      />

      <Tabs defaultValue="weekly" className="space-y-4">
        <TabsList>
          <TabsTrigger value="weekly">Weekly View</TabsTrigger>
          <TabsTrigger value="projects">Projects</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly">
          <WeeklyTimesheetTab />
        </TabsContent>
        <TabsContent value="projects">
          <ProjectsTab />
        </TabsContent>
      </Tabs>
    </div>
    </AdminLayout>
  );
}
