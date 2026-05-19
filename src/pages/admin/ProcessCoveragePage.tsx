import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/admin/StatCard';
import { getAllUnifiedModules } from '@/lib/module-def';
import {
  PROCESS_IDS,
  PROCESS_LABELS,
  MATURITY_LABELS,
  type ProcessId,
  type MaturityLevel,
} from '@/lib/processes';
import { Layers, Workflow, Boxes, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// Ensure all modules are registered (side-effect import)
import '@/lib/module-registry';

const MATURITY_STYLES: Record<MaturityLevel, string> = {
  L1: 'bg-muted text-muted-foreground border-border',
  L2: 'bg-warning/10 text-warning border-warning/30',
  L3: 'bg-primary/10 text-primary border-primary/30',
  L4: 'bg-success/10 text-success border-success/30',
  L5: 'bg-success/20 text-success border-success/50',
};

interface ModuleEntry {
  id: string;
  name: string;
  maturity: MaturityLevel;
  description?: string;
}

const PROCESS_DESCRIPTIONS: Record<ProcessId, string> = {
  'lead-to-customer': 'From first touch to closed customer.',
  'quote-to-cash': 'Quote → order → invoice → cash collected.',
  'procure-to-pay': 'Request → PO → goods receipt → vendor payment.',
  'order-to-delivery': 'Order capture → pick/pack → ship → deliver.',
  'hire-to-retire': 'Applicant → employee → leave/payroll → offboard.',
  'content-to-conversion': 'Idea → publish → distribute → convert.',
  'record-to-report': 'Journal → reconcile → close → report.',
  'support-to-resolution': 'Ticket/chat → triage → resolution → CSAT.',
};

export default function ProcessCoveragePage() {
  const { coverage, totals } = useMemo(() => {
    const all = getAllUnifiedModules();
    const map = new Map<ProcessId, ModuleEntry[]>();
    for (const p of PROCESS_IDS) map.set(p, []);

    let taggedModules = 0;
    for (const mod of all) {
      const processes = (mod.processes ?? []) as ProcessId[];
      const maturity = (mod.maturity ?? 'L1') as MaturityLevel;
      if (processes.length > 0) taggedModules += 1;
      for (const p of processes) {
        if (!map.has(p)) continue;
        map.get(p)!.push({
          id: mod.id,
          name: mod.name,
          maturity,
          description: mod.description,
        });
      }
    }

    // Sort modules within each process: higher maturity first, then name
    const order: MaturityLevel[] = ['L5', 'L4', 'L3', 'L2', 'L1'];
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          order.indexOf(a.maturity) - order.indexOf(b.maturity) ||
          a.name.localeCompare(b.name),
      );
    }

    return {
      coverage: map,
      totals: {
        processes: PROCESS_IDS.length,
        modules: all.length,
        taggedModules,
        avgPerProcess: (
          Array.from(map.values()).reduce((s, l) => s + l.length, 0) /
          PROCESS_IDS.length
        ).toFixed(1),
      },
    };
  }, []);

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Process Coverage"
          description="Which modules participate in each end-to-end business process — and at what maturity level."
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Processes" value={totals.processes} icon={Workflow} variant="primary" />
          <StatCard label="Modules" value={totals.modules} icon={Boxes} variant="default" />
          <StatCard label="Tagged modules" value={totals.taggedModules} icon={Layers} variant="success" />
          <StatCard label="Avg per process" value={totals.avgPerProcess} icon={Sparkles} variant="muted" />
        </div>

        <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
          <p className="font-medium mb-2">Maturity scale</p>
          <div className="flex flex-wrap gap-2">
            {(['L1', 'L2', 'L3', 'L4', 'L5'] as MaturityLevel[]).map((m) => (
              <span
                key={m}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded border px-2 py-0.5 text-xs',
                  MATURITY_STYLES[m],
                )}
              >
                <span className="font-mono font-semibold">{m}</span>
                <span>{MATURITY_LABELS[m]}</span>
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {PROCESS_IDS.map((pid) => {
            const owners = coverage.get(pid) ?? [];
            return (
              <Card key={pid} className={owners.length === 0 ? 'border-destructive/40' : ''}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{PROCESS_LABELS[pid]}</CardTitle>
                      <CardDescription className="mt-0.5 text-xs">
                        {PROCESS_DESCRIPTIONS[pid]}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {owners.length} {owners.length === 1 ? 'module' : 'modules'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {owners.length === 0 ? (
                    <p className="text-sm text-destructive">
                      No modules own this process — orphan.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {owners.map((m) => (
                        <li
                          key={m.id}
                          className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground truncate">
                              {m.name}
                            </div>
                            {m.description && (
                              <div className="text-xs text-muted-foreground line-clamp-1">
                                {m.description}
                              </div>
                            )}
                          </div>
                          <span
                            className={cn(
                              'shrink-0 inline-flex items-center rounded border px-2 py-0.5 text-xs font-mono font-semibold',
                              MATURITY_STYLES[m.maturity],
                            )}
                            title={MATURITY_LABELS[m.maturity]}
                          >
                            {m.maturity}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          Source of truth: <code>processes</code> + <code>maturity</code> on each{' '}
          <code>defineModule()</code> manifest in <code>src/lib/modules/</code>. See{' '}
          <Link to="/admin/developer" className="underline">Developer</Link> for the skill catalog.
        </p>
      </AdminPageContainer>
    </AdminLayout>
  );
}
