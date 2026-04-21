import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { JobPostingsList } from '@/components/admin/recruitment/JobPostingsList';
import { NewJobDialog } from '@/components/admin/recruitment/NewJobDialog';
import { CandidateKanban } from '@/components/admin/recruitment/CandidateKanban';
import { useApplications, useJobPostings } from '@/hooks/useRecruitment';
import { Briefcase, Users, Star } from 'lucide-react';

export default function RecruitmentPage() {
  const { data: jobs } = useJobPostings();
  const { data: apps } = useApplications();

  const openJobs = jobs?.filter((j) => j.status === 'published').length ?? 0;
  const totalApps = apps?.length ?? 0;
  const topScored = apps?.filter((a) => (a.ai_score ?? 0) >= 80).length ?? 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Recruitment"
          description="Job postings, candidate pipeline, and AI-assisted screening"
        >
          <NewJobDialog />
        </AdminPageHeader>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Briefcase className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{openJobs}</p>
                <p className="text-sm text-muted-foreground">Published roles</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{totalApps}</p>
                <p className="text-sm text-muted-foreground">Total candidates</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 pt-6">
              <Star className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">{topScored}</p>
                <p className="text-sm text-muted-foreground">High-fit candidates (≥80)</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="pipeline">
          <TabsList>
            <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
            <TabsTrigger value="jobs">Jobs</TabsTrigger>
          </TabsList>
          <TabsContent value="pipeline" className="mt-4">
            <CandidateKanban />
          </TabsContent>
          <TabsContent value="jobs" className="mt-4">
            <JobPostingsList />
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
