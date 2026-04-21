import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useQuery, useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, MapPin, Building2, CheckCircle2 } from 'lucide-react';

const EMPLOYMENT_LABEL: Record<string, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
  temporary: 'Temporary',
  internship: 'Internship',
};

const applicationSchema = z.object({
  candidate_name: z.string().trim().min(2, 'Name is required').max(120),
  candidate_email: z.string().trim().email('Valid email required').max(255),
  candidate_phone: z.string().trim().max(40).optional(),
  linkedin_url: z.string().trim().url('Must be a valid URL').max(500).optional().or(z.literal('')),
  resume_text: z.string().trim().min(50, 'Paste at least 50 characters from your CV').max(20000),
  cover_letter: z.string().trim().max(5000).optional(),
});

export default function JobDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    candidate_name: '',
    candidate_email: '',
    candidate_phone: '',
    linkedin_url: '',
    resume_text: '',
    cover_letter: '',
  });

  const { data: job, isLoading } = useQuery({
    queryKey: ['public_job_posting', slug],
    enabled: !!slug,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_postings')
        .select('*')
        .eq('slug', slug!)
        .eq('status', 'published')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = applicationSchema.safeParse(form);
      if (!parsed.success) {
        const first = Object.values(parsed.error.flatten().fieldErrors)[0]?.[0];
        throw new Error(first ?? 'Invalid submission');
      }
      if (!job) throw new Error('Job not found');

      const { data, error } = await supabase
        .from('applications')
        .insert({
          job_posting_id: job.id,
          candidate_name: parsed.data.candidate_name,
          candidate_email: parsed.data.candidate_email,
          candidate_phone: parsed.data.candidate_phone || null,
          linkedin_url: parsed.data.linkedin_url || null,
          cover_letter: parsed.data.cover_letter || null,
          parsed_resume: { raw_text: parsed.data.resume_text, source: 'public_form' },
          source: 'careers_page',
          stage: 'applied',
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      setSubmitted(true);
      toast({ title: 'Application submitted', description: 'We will get back to you soon.' });
    },
    onError: (e: Error) => {
      toast({ title: 'Submission failed', description: e.message, variant: 'destructive' });
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
          <h1 className="text-2xl font-bold">Role not found</h1>
          <p className="mt-2 text-muted-foreground">This position is no longer open.</p>
          <Button asChild className="mt-6">
            <Link to="/jobs">Back to all roles</Link>
          </Button>
        </div>
      </main>
    );
  }

  return (
    <>
      <Helmet>
        <title>{job.title} — Careers</title>
        <meta name="description" content={job.description?.slice(0, 160) ?? `Apply for ${job.title}`} />
        <meta property="og:title" content={`${job.title} — Careers`} />
        <meta property="og:description" content={job.description?.slice(0, 160) ?? `Apply for ${job.title}`} />
        <meta property="og:type" content="website" />
      </Helmet>

      <main className="min-h-screen bg-background">
        <div className="container mx-auto max-w-4xl px-4 py-8 md:py-12">
          <Button asChild variant="ghost" size="sm" className="mb-6">
            <Link to="/jobs">
              <ArrowLeft className="mr-2 h-4 w-4" /> All roles
            </Link>
          </Button>

          <header className="mb-10">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{EMPLOYMENT_LABEL[job.employment_type] ?? job.employment_type}</Badge>
              {job.department && (
                <Badge variant="outline" className="gap-1">
                  <Building2 className="h-3 w-3" /> {job.department}
                </Badge>
              )}
              {job.location && (
                <Badge variant="outline" className="gap-1">
                  <MapPin className="h-3 w-3" /> {job.location}
                </Badge>
              )}
            </div>
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{job.title}</h1>
          </header>

          {job.description && (
            <article className="prose prose-neutral mb-12 max-w-none whitespace-pre-wrap text-foreground dark:prose-invert">
              {job.description}
            </article>
          )}

          {job.requirements && (
            <section className="mb-12">
              <h2 className="mb-3 text-xl font-semibold">Requirements</h2>
              <article className="prose prose-neutral max-w-none whitespace-pre-wrap text-foreground dark:prose-invert">
                {job.requirements}
              </article>
            </section>
          )}

          <Card id="apply">
            <CardHeader>
              <CardTitle>Apply for this role</CardTitle>
              <CardDescription>
                Fill in the form below. Paste your CV as text — we'll parse PDFs in a future update.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-10 text-center">
                  <CheckCircle2 className="mb-3 h-12 w-12 text-emerald-500" />
                  <h3 className="text-xl font-semibold">Application received</h3>
                  <p className="mt-2 text-muted-foreground">
                    Thanks {form.candidate_name.split(' ')[0]}. We'll review and get back to you by email.
                  </p>
                  <Button asChild variant="outline" className="mt-6">
                    <Link to="/jobs">Browse more roles</Link>
                  </Button>
                </div>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    submit.mutate();
                  }}
                  className="space-y-4"
                >
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="name">Full name *</Label>
                      <Input
                        id="name"
                        required
                        value={form.candidate_name}
                        onChange={(e) => setForm((f) => ({ ...f, candidate_name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        value={form.candidate_email}
                        onChange={(e) => setForm((f) => ({ ...f, candidate_email: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={form.candidate_phone}
                        onChange={(e) => setForm((f) => ({ ...f, candidate_phone: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="linkedin">LinkedIn URL</Label>
                      <Input
                        id="linkedin"
                        type="url"
                        placeholder="https://linkedin.com/in/…"
                        value={form.linkedin_url}
                        onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="resume">CV / Resume (paste as text) *</Label>
                    <Textarea
                      id="resume"
                      required
                      rows={10}
                      placeholder="Paste your CV content here…"
                      value={form.resume_text}
                      onChange={(e) => setForm((f) => ({ ...f, resume_text: e.target.value }))}
                    />
                    <p className="text-xs text-muted-foreground">
                      PDF upload coming soon. For now, paste the text from your CV.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cover">Cover letter</Label>
                    <Textarea
                      id="cover"
                      rows={5}
                      placeholder="Why are you a great fit?"
                      value={form.cover_letter}
                      onChange={(e) => setForm((f) => ({ ...f, cover_letter: e.target.value }))}
                    />
                  </div>
                  <Button type="submit" size="lg" disabled={submit.isPending} className="w-full md:w-auto">
                    {submit.isPending ? 'Submitting…' : 'Submit application'}
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
