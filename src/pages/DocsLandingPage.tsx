import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles, Boxes, GitBranch, Network, BookOpen, Github } from 'lucide-react';
import { PublicNavigation } from '@/components/public/PublicNavigation';
import { PublicFooter } from '@/components/public/PublicFooter';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDocsPages } from '@/hooks/useDocs';
import { DocsSidebar } from '@/components/docs/DocsSidebar';
import { DocsChat } from '@/components/docs/DocsChat';
import { useIsEmbed } from '@/hooks/useIsEmbed';

const HIGHLIGHTS = [
  {
    icon: Sparkles,
    category: 'concepts',
    title: 'What is Flowwink?',
    body: 'A self-hosted Business Operating System powered by autonomous agents. Start here.',
  },
  {
    icon: Boxes,
    category: 'modules',
    title: 'Modules',
    body: 'CRM, Orders, Accounting, HR, Purchasing — every capability is an opt-in module that exposes skills to FlowPilot.',
  },
  {
    icon: GitBranch,
    category: 'processes',
    title: 'Processes',
    body: 'Lead-to-customer, quote-to-cash, procure-to-pay. See how data flows end-to-end.',
  },
  {
    icon: Network,
    category: 'architecture',
    title: 'Architecture',
    body: 'How FlowPilot reasons, how skills are selected, how the platform stays modular.',
  },
];

export default function DocsLandingPage() {
  const { data: pages = [], isLoading } = useDocsPages();
  const embed = useIsEmbed();

  return (
    <>
      <Helmet>
        <title>Docs — Flowwink</title>
        <meta
          name="description"
          content="Public documentation for Flowwink — the self-hosted Business Operating System powered by autonomous agents. Browse modules, processes, and architecture."
        />
        <link rel="canonical" href="https://flowwink.com/docs" />
      </Helmet>

      {!embed && <PublicNavigation />}

      <main className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8 lg:py-12 max-w-7xl">
          <div className="grid grid-cols-12 gap-8">
            {/* Sidebar */}
            <aside className="col-span-12 lg:col-span-3 hidden lg:block sticky top-20 self-start">
              {!isLoading && <DocsSidebar pages={pages} />}
            </aside>

            {/* Content */}
            <div className="col-span-12 lg:col-span-9 space-y-12">
              {/* Hero */}
              <header className="space-y-4 max-w-3xl">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
                  <BookOpen className="h-3 w-3" />
                  Documentation
                </div>
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
                  Flowwink, end to end.
                </h1>
                <p className="text-lg text-muted-foreground leading-relaxed">
                  A self-hosted Business Operating System where an autonomous agent — FlowPilot —
                  runs content, leads, orders, and growth around the clock. Browse the modules,
                  follow a process, or just{' '}
                  <button
                    onClick={() => {
                      const btn = document.querySelector('[data-docs-chat-trigger]');
                      (btn as HTMLButtonElement | null)?.click();
                    }}
                    className="text-primary underline underline-offset-2 hover:text-primary/80"
                  >
                    ask the docs
                  </button>
                  .
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button asChild>
                    <Link to="/docs/concepts/elevator-pitch">
                      Elevator pitch <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button variant="outline" asChild>
                    <a
                      href="https://github.com/magnusfroste/flowwink"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Github className="mr-2 h-4 w-4" /> GitHub
                    </a>
                  </Button>
                </div>
              </header>

              {/* Highlight cards */}
              <section>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {HIGHLIGHTS.map(({ icon: Icon, category, title, body }) => {
                    const count = pages.filter((p) => p.category === category).length;
                    return (
                      <Link key={category} to={`/docs/${category}`} className="group">
                        <Card className="p-6 h-full hover:border-primary/50 transition-colors">
                          <div className="flex items-start justify-between mb-3">
                            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                              <Icon className="h-5 w-5 text-primary" />
                            </div>
                            {count > 0 && (
                              <span className="text-xs text-muted-foreground">{count} pages</span>
                            )}
                          </div>
                          <h3 className="font-semibold mb-1.5 group-hover:text-primary transition-colors">
                            {title}
                          </h3>
                          <p className="text-sm text-muted-foreground leading-relaxed">{body}</p>
                        </Card>
                      </Link>
                    );
                  })}
                </div>
              </section>

              {/* Empty state */}
              {!isLoading && pages.length === 0 && (
                <Card className="p-8 text-center">
                  <p className="text-muted-foreground mb-2">No docs synced yet.</p>
                  <p className="text-sm text-muted-foreground">
                    An admin needs to run the docs sync from <code>/admin/docs</code>.
                  </p>
                </Card>
              )}
            </div>
          </div>
        </div>
      </main>

      {!embed && <PublicFooter />}
      {!embed && <DocsChat />}
    </>
  );
}
