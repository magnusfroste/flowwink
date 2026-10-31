import { useParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, MapPin, Building2 } from 'lucide-react';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { ApplicationForm } from '@/components/public/careers/ApplicationForm';
import { useEmploymentLabel } from '@/hooks/useEmploymentLabel';
import { useUiText } from '@/lib/ui-text';

/**
 * /jobs/:slug — one open role and its application form. The form is the
 * shared ApplicationForm (CV upload, screening questions, consent) that sends
 * everything to process-job-application; this page reads nothing private.
 */
export default function JobDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const t = useUiText();
  const label = useEmploymentLabel();

  const { data: job, isLoading } = useQuery({
    queryKey: ['public_job_posting', slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_postings')
        .select('id, title, slug, department, location, employment_type, remote_policy, description, responsibilities, requirements, perks, meta')
        .eq('slug', slug!)
        .eq('status', 'published')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto max-w-4xl px-4 py-12">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="mt-6 h-12 w-2/3" />
          <Skeleton className="mt-4 h-64 w-full" />
        </div>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="min-h-screen bg-background">
        <div className="container mx-auto max-w-4xl px-4 py-24 text-center">
          <h1 className="text-2xl font-bold">{t('careers.notFoundTitle', 'Role not found')}</h1>
          <p className="mt-2 text-muted-foreground">{t('careers.notFoundBody', 'This position is no longer open.')}</p>
          <Button asChild className="mt-6">
            <Link to="/jobs">{t('careers.backToRoles', 'Back to all roles')}</Link>
          </Button>
        </div>
      </main>
    );
  }

  const sections: Array<[string, string | null]> = [
    [t('careers.responsibilities', 'What you will do'), job.responsibilities],
    [t('careers.requirements', 'What we are looking for'), job.requirements],
    [t('careers.perks', 'What we offer'), job.perks?.length ? job.perks.map((p) => `• ${p}`).join('\n') : null],
  ];

  return (
    <>
      <Helmet>
        <title>{`${job.title} — ${t('careers.careers', 'Careers')}`}</title>
        <meta name="description" content={job.description?.slice(0, 160) ?? job.title} />
        <meta property="og:title" content={job.title} />
        <meta property="og:description" content={job.description?.slice(0, 160) ?? job.title} />
        <meta property="og:type" content="website" />
      </Helmet>
      <PublicNavigation />
      <main className="pt-[var(--overlay-header-offset,0px)] min-h-screen bg-background">
        <div className="container mx-auto max-w-4xl px-4 py-8 md:py-12">
          <Button asChild variant="ghost" size="sm" className="mb-6">
            <Link to="/jobs"><ArrowLeft className="mr-2 h-4 w-4" /> {t('careers.allRoles', 'All roles')}</Link>
          </Button>

          <header className="mb-10">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{label(job.employment_type)}</Badge>
              {job.department && <Badge variant="outline" className="gap-1"><Building2 className="h-3 w-3" /> {job.department}</Badge>}
              {job.location && <Badge variant="outline" className="gap-1"><MapPin className="h-3 w-3" /> {job.location}</Badge>}
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{job.title}</h1>
            <Button asChild className="mt-6"><a href="#apply">{t('careers.applyNow', 'Apply now')}</a></Button>
          </header>

          {job.description && (
            <article className="prose prose-neutral mb-12 max-w-none whitespace-pre-wrap text-foreground dark:prose-invert">{job.description}</article>
          )}
          {sections.filter(([, body]) => !!body).map(([title, body]) => (
            <section key={title} className="mb-12">
              <h2 className="mb-3 text-xl font-semibold">{title}</h2>
              <article className="prose prose-neutral max-w-none whitespace-pre-wrap text-foreground dark:prose-invert">{body}</article>
            </section>
          ))}

          <Card id="apply">
            <CardHeader>
              <CardTitle>{t('careers.applyTitle', 'Apply for this role')}</CardTitle>
              <CardDescription>{t('careers.applyBody', 'Attach your CV and answer a few questions — it takes a couple of minutes.')}</CardDescription>
            </CardHeader>
            <CardContent>
              <ApplicationForm posting={job} />
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
