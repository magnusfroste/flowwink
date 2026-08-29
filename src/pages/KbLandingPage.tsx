import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { SeoHead } from '@/components/public/SeoHead';
import { KbHubBlock } from '@/components/public/blocks/KbHubBlock';

/**
 * The knowledge base at its own address.
 *
 * Added because `/kb/:slug` shipped without it: the article page's "back to
 * Knowledge Base" link pointed at `/kb`, which matched no route — the same
 * class of bug the article page was built to fix, reintroduced one link over.
 *
 * It renders the same hub block operators place on their own pages, so an
 * instance that put the KB on `/help` and a visitor who arrived at `/kb` from
 * a chat citation see the same thing. Operators keep full control of their own
 * page; this is the address that always works.
 */
export default function KbLandingPage() {
  return (
    <>
      <SeoHead title="Knowledge Base" description="Browse questions and answers." />
      <PublicNavigation />
      <main className="pt-[var(--overlay-header-offset,0px)] min-h-screen bg-background">
        <KbHubBlock data={{}} />
      </main>
      <PublicFooter />
    </>
  );
}
