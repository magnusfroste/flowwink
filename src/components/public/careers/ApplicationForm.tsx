import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Loader2, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useUiText, useUiTextLanguage } from '@/lib/ui-text';
import { useBranding } from '@/providers/BrandingProvider';
import { logger } from '@/lib/logger';
import {
  assessApplication, CV_ACCEPT, CV_MAX_BYTES, fetchRetentionMonths, screeningQuestionsOf,
  submitApplication, uploadCv,
} from '@/lib/careers';

interface Posting {
  id: string;
  title: string;
  meta?: unknown;
}

/**
 * A candidate's application for one role — the careers page and the
 * job-listings block both render this. It writes nothing itself: the CV goes
 * to the careers upload area and everything else to process-job-application,
 * the one door every application (and every agent) goes through.
 */
export function ApplicationForm({ posting }: { posting: Posting }) {
  const t = useUiText();
  const { lang } = useUiTextLanguage();
  const { branding } = useBranding();
  const company = (branding as { organizationName?: string } | undefined)?.organizationName || t('careers.us', 'us');
  const questions = useMemo(() => screeningQuestionsOf(posting.meta), [posting.meta]);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [cover, setCover] = useState('');
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvText, setCvText] = useState('');
  const [pasteInstead, setPasteInstead] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [months, setMonths] = useState(12);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => { void fetchRetentionMonths().then(setMonths); }, []);

  const submit = async () => {
    setError(null);
    if (name.trim().length < 2) return setError(t('careers.errName', 'Please enter your name.'));
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError(t('careers.errEmail', 'Please enter a valid e-mail address.'));
    if (!cvFile && cvText.trim().length < 50) return setError(t('careers.errCv', 'Attach your CV or paste at least a few lines of it.'));
    const check = assessApplication({ questions, answers, consent });
    if (check.ok === false) {
      return setError(check.code === 'CONSENT_REQUIRED'
        ? t('careers.errConsent', 'Please agree to how we keep your application.')
        : check.code === 'ANSWER_REQUIRED'
          ? `${t('careers.errAnswer', 'Please answer')}: ${check.missing?.join(', ')}`
          : check.message);
    }
    setBusy(true);
    try {
      const storage_path = cvFile ? await uploadCv(cvFile, posting.id) : undefined;
      const res = await submitApplication({
        job_posting_id: posting.id,
        candidate_name: name.trim(),
        candidate_email: email.trim(),
        candidate_phone: phone.trim() || undefined,
        linkedin_url: linkedin.trim() || undefined,
        cover_letter: cover.trim() || undefined,
        resume_text: cvFile ? undefined : cvText.trim(),
        storage_path,
        screening_answers: check.answers,
        consent: true,
        lang: lang || undefined,
      });
      if (res.success === false) {
        setError(res.error);
        return;
      }
      setDone(true);
    } catch (e) {
      logger.error('[careers] application failed', e);
      setError(t('careers.errGeneric', 'Something went wrong. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <CheckCircle2 className="mb-3 h-12 w-12 text-primary" />
        <h3 className="text-xl font-semibold">{t('careers.thanksTitle', 'Application received')}</h3>
        <p className="mt-2 text-muted-foreground">
          {t('careers.thanksBody', 'Thank you, {name}. We have sent a confirmation to your e-mail and will be in touch.').replace('{name}', name.split(' ')[0])}
        </p>
      </div>
    );
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      noValidate
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cand-name">{t('careers.name', 'Full name')} *</Label>
          <Input id="cand-name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cand-email">{t('careers.email', 'E-mail')} *</Label>
          <Input id="cand-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cand-phone">{t('careers.phone', 'Phone')}</Label>
          <Input id="cand-phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cand-linkedin">{t('careers.linkedin', 'LinkedIn profile')}</Label>
          <Input id="cand-linkedin" type="url" placeholder="https://linkedin.com/in/…" value={linkedin} onChange={(e) => setLinkedin(e.target.value)} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('careers.cv', 'CV')} *</Label>
        {pasteInstead ? (
          <>
            <Textarea rows={8} value={cvText} onChange={(e) => setCvText(e.target.value)} placeholder={t('careers.cvPaste', 'Paste the text of your CV here…')} />
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setPasteInstead(false)}>
              {t('careers.cvUploadInstead', 'Upload a file instead')}
            </button>
          </>
        ) : cvFile ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 truncate">{cvFile.name}</span>
            <button type="button" aria-label={t('common.remove', 'Remove')} onClick={() => setCvFile(null)}><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <>
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground hover:bg-muted/40">
              <Upload className="h-5 w-5" />
              <span>{t('careers.cvDrop', 'Choose a file — PDF, Word or text, at most 10 MB')}</span>
              <input
                type="file"
                accept={CV_ACCEPT}
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  if (f && f.size > CV_MAX_BYTES) { setError(t('careers.errCvSize', 'The file is larger than 10 MB.')); return; }
                  setCvFile(f);
                }}
              />
            </label>
            <button type="button" className="text-xs text-primary hover:underline" onClick={() => setPasteInstead(true)}>
              {t('careers.cvPasteInstead', 'No file at hand? Paste the text instead')}
            </button>
          </>
        )}
      </div>

      {questions.length > 0 && (
        <div className="space-y-4">
          {questions.map((q) => (
            <div key={q.id} className="space-y-2">
              <Label>{q.label}{q.required ? ' *' : ''}</Label>
              {q.type === 'yes_no' ? (
                <RadioGroup
                  className="flex gap-6"
                  value={answers[q.id] ?? ''}
                  onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}
                >
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="yes" /> {t('common.yes', 'Yes')}</label>
                  <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="no" /> {t('common.no', 'No')}</label>
                </RadioGroup>
              ) : q.type === 'choice' && q.options?.length ? (
                <RadioGroup value={answers[q.id] ?? ''} onValueChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))}>
                  {q.options.map((o) => (
                    <label key={o} className="flex items-center gap-2 text-sm"><RadioGroupItem value={o} /> {o}</label>
                  ))}
                </RadioGroup>
              ) : (
                <Textarea rows={3} value={answers[q.id] ?? ''} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="cand-cover">{t('careers.cover', 'Why this role? (optional)')}</Label>
        <Textarea id="cand-cover" rows={4} value={cover} onChange={(e) => setCover(e.target.value)} />
      </div>

      <label className="flex items-start gap-3 text-sm text-muted-foreground">
        <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
        <span>
          {t('careers.consent', '{company} may keep my application and CV to assess me for this role. It is deleted when the recruitment ends, and at the latest after {months} months.')
            .replace('{company}', company)
            .replace('{months}', String(months))}
        </span>
      </label>

      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

      <Button type="submit" size="lg" disabled={busy} className="w-full md:w-auto">
        {busy ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('careers.sending', 'Sending…')}</> : t('careers.submit', 'Send application')}
      </Button>
    </form>
  );
}
