import { Helmet } from 'react-helmet-async';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { OpenRolesList } from '@/components/public/careers/OpenRolesList';
import { useUiText } from '@/lib/ui-text';

/**
 * /jobs — the careers page every instance has. The same list is a block
 * (job-listings) for a page the business builds itself, landing page included.
 */
export default function JobsPage() {
  const t = useUiText();
  return (
    <>
      <Helmet>
        <title>{t('careers.metaTitle', 'Open roles — Careers')}</title>
        <meta name="description" content={t('careers.metaDescription', 'Browse our open positions and apply to join the team.')} />
      </Helmet>
      <PublicNavigation />
      <main className="pt-[var(--overlay-header-offset,0px)] min-h-screen bg-background">
        <section className="border-b border-border bg-muted/30">
          <div className="container mx-auto max-w-5xl px-4 py-16 md:py-24">
            <h1 className="text-4xl font-bold tracking-tight md:text-5xl">{t('careers.heroTitle', 'Join the team')}</h1>
            <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
              {t('careers.heroBody', "We're hiring. Find a role that fits and apply in minutes.")}
            </p>
          </div>
        </section>
        <section className="container mx-auto max-w-5xl px-4 py-12 md:py-16">
          <OpenRolesList />
        </section>
      </main>
    </>
  );
}
