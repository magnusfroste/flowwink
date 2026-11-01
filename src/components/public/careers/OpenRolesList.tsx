import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Briefcase, MapPin } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUiText } from '@/lib/ui-text';
import { fetchOpenRoles, type OpenRole } from '@/lib/careers';
import { useEmploymentLabel } from '@/hooks/useEmploymentLabel';

/**
 * The open roles — the /jobs page and the job-listings block both render this,
 * so a role published in the admin (or by an agent) is on every careers
 * surface at once. Filters appear when there is something to filter.
 */
export function OpenRolesList({ limit, showFilters = true, department }: { limit?: number; showFilters?: boolean; department?: string }) {
  const t = useUiText();
  const label = useEmploymentLabel();
  const { data, isLoading } = useQuery({ queryKey: ['public_job_postings'], queryFn: fetchOpenRoles });
  const [dept, setDept] = useState('all');
  const [loc, setLoc] = useState('all');

  const roles = useMemo(() => {
    let r = (data ?? []) as OpenRole[];
    if (department) r = r.filter((j) => (j.department ?? '').toLowerCase() === department.toLowerCase());
    if (dept !== 'all') r = r.filter((j) => j.department === dept);
    if (loc !== 'all') r = r.filter((j) => j.location === loc);
    return limit ? r.slice(0, limit) : r;
  }, [data, department, dept, loc, limit]);

  const departments = useMemo(() => [...new Set((data ?? []).map((j) => j.department).filter(Boolean))] as string[], [data]);
  const locations = useMemo(() => [...new Set((data ?? []).map((j) => j.location).filter(Boolean))] as string[], [data]);

  if (isLoading) {
    return <div className="space-y-4"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>;
  }
  if (!data?.length) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <Briefcase className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="mb-2 text-xl font-semibold">{t('careers.noneTitle', 'No open roles right now')}</h3>
          <p className="text-muted-foreground">{t('careers.noneBody', 'Check back soon — we update this page regularly.')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {showFilters && !department && (departments.length > 1 || locations.length > 1) && (
        <div className="flex flex-wrap gap-3">
          {departments.length > 1 && (
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('careers.allDepartments', 'All departments')}</SelectItem>
                {departments.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {locations.length > 1 && (
            <Select value={loc} onValueChange={setLoc}>
              <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('careers.allLocations', 'All locations')}</SelectItem>
                {locations.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      )}
      <div className="grid gap-4">
        {roles.map((job) => (
          <Link key={job.id} to={`/jobs/${job.slug}`} className="group block">
            <Card className="transition-colors hover:border-primary/50">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <CardTitle className="text-xl group-hover:text-primary">{job.title}</CardTitle>
                    <CardDescription className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                      {job.department && <span>{job.department}</span>}
                      {job.location && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {job.location}</span>}
                    </CardDescription>
                  </div>
                  <Badge variant="secondary">{label(job.employment_type)}</Badge>
                </div>
              </CardHeader>
              {job.description && (
                <CardContent>
                  <div className="flex items-center justify-between gap-4">
                    <p className="line-clamp-2 max-w-2xl text-sm text-muted-foreground">{job.description.replace(/[#*_>`]/g, '').slice(0, 220)}</p>
                    <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                  </div>
                </CardContent>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
