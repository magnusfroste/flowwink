import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Briefcase, MapPin, ArrowRight } from 'lucide-react';

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  temporary: 'Temporary',
  internship: 'Internship',
};

export default function JobsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['public_job_postings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_postings')
        .select('id, title, slug, department, location, employment_type, description, created_at')
        .eq('status', 'published')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <Helmet>
        <title>Open roles — Careers</title>
        <meta name="description" content="Browse our open positions and apply to join the team." />
      </Helmet>
      <main className="min-h-screen bg-background">
        <section className="border-b border-border bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4 py-16 md:py-24">
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">Join the team</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              We're hiring across multiple roles. Find one that fits and apply in minutes.
            </p>
          </div>
        </section>

        <section className="container mx-auto max-w-5xl px-4 py-12 md:py-16">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : !data?.length ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Briefcase className="mb-4 h-12 w-12 text-muted-foreground" />
                <h2 className="mb-2 text-xl font-semibold">No open roles right now</h2>
                <p className="text-muted-foreground">Check back soon — we update this page regularly.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {data.map((job) => (
                <Link key={job.id} to={`/jobs/${job.slug}`} className="group block">
                  <Card className="transition-colors hover:border-primary/50">
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <CardTitle className="text-xl group-hover:text-primary">{job.title}</CardTitle>
                          <CardDescription className="mt-2 flex flex-wrap items-center gap-3 text-sm">
                            {job.department && <span>{job.department}</span>}
                            {job.location && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3.5 w-3.5" /> {job.location}
                              </span>
                            )}
                          </CardDescription>
                        </div>
                        <Badge variant="secondary">{EMPLOYMENT_LABEL[job.employment_type] ?? job.employment_type}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between">
                        {job.description ? (
                          <p className="line-clamp-2 max-w-2xl text-sm text-muted-foreground">
                            {job.description.replace(/[#*_>`-]/g, '').slice(0, 200)}…
                          </p>
                        ) : <span />}
                        <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary" />
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
