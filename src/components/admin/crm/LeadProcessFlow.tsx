import { useActiveModules, moduleShown } from '@/lib/module-visibility';
import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, ChevronRight, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLeadPipelineChain } from '@/hooks/useLeadPipelineChain';
import { usePlatformFormat } from '@/hooks/usePlatformFormat';
import { cn } from '@/lib/utils';

interface Props {
  leadId: string;
  email: string | null | undefined;
}

/**
 * Process flow for one contact: Contact → Opportunity → Quote → Contract → Invoice.
 *
 * Purpose is onboarding, not reporting: a new colleague should be able to see
 * at a glance which step this record has reached and what the next action is,
 * without knowing which module owns which object.
 */
/** The module each step of the lead's process belongs to. */
const STEP_MODULE: Partial<Record<string, string>> = { deal: 'deals', quote: 'quotes', contract: 'contracts', invoice: 'invoicing' };

export function LeadProcessFlow({ leadId, email }: Props) {
  const { data } = useLeadPipelineChain(leadId, email ?? undefined);
  const { formatCurrency } = usePlatformFormat();

  const active = useActiveModules();
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const allSteps = [
    {
      key: 'contact',
      label: 'Contact',
      help: 'The person or company. Created from a form, an email or manually.',
      done: true,
      meta: null as string | null,
    },
    {
      key: 'deal',
      // "Deal" — the module's own word. The contact-funnel STATUS 'opportunity'
      // is the consequence (auto-set when the first deal is created); labelling
      // this step with the status word made two funnels read as one.
      label: 'Deal',
      help: 'A concrete sales opportunity with value and stage. Everything downstream hangs off the deal. Creating the first deal moves the contact to status Opportunity.',
      done: !!data?.deal.done,
      meta: data?.deal.count ? `${data.deal.count} · ${formatCurrency(data.deal.amountCents, undefined, { minimumFractionDigits: 0 })}` : null,
    },
    {
      key: 'quote',
      label: 'Quote',
      help: 'A formal proposal sent to the customer. Created from the deal.',
      done: !!data?.quote.done,
      meta: data?.quote.count ? `${data.quote.count} · ${formatCurrency(data.quote.amountCents, undefined, { minimumFractionDigits: 0 })}` : null,
    },
    {
      key: 'contract',
      label: 'Contract',
      help: 'The signed agreement. Drafted from an accepted quote, signed digitally.',
      done: !!data?.contract.done,
      meta: data?.contract.count ? `${data.contract.count}` : null,
    },
    {
      key: 'invoice',
      label: 'Invoice',
      help: 'Billing — either one-off from the quote or recurring from the contract.',
      done: !!data?.invoice.done,
      meta: data?.invoice.count ? `${data.invoice.count}` : null,
    },
  ];

  // A step of a module that is off is not part of this instance's process.
  const steps = allSteps.filter((st) => !STEP_MODULE[st.key] || moduleShown(STEP_MODULE[st.key]!, active));
  const nextStep = steps.find((s) => !s.done);

  const nextAction = (() => {
    if (!nextStep) return null;
    switch (nextStep.key) {
      case 'deal':
        // Create must CREATE: scroll to the section AND open its dialog — a
        // bare scroll reads as a dead button when the section is already in view.
        return {
          label: 'Create deal',
          onClick: () => {
            scrollTo('lead-deals');
            window.dispatchEvent(new CustomEvent('flowwink:open-create-deal'));
          },
          to: null,
        };
      case 'quote':
        return { label: 'Open the deal to quote', onClick: () => scrollTo('lead-deals'), to: null };
      case 'contract':
        return { label: 'Go to quotes', onClick: null, to: '/admin/quotes' };
      case 'invoice':
        return { label: 'Go to invoices', onClick: null, to: '/admin/invoices' };
      default:
        return null;
    }
  })();

  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
          <TooltipProvider>
            {steps.map((step, i) => (
              <div key={step.key} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs',
                        step.done
                          ? 'border-primary/30 bg-primary/10 text-foreground'
                          : nextStep?.key === step.key
                            ? 'border-dashed border-primary/50 text-foreground'
                            : 'border-border text-muted-foreground',
                      )}
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 items-center justify-center rounded-full text-[10px]',
                          step.done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {step.done ? <Check className="h-3 w-3" /> : i + 1}
                      </span>
                      <span className="font-medium">{step.label}</span>
                      {step.meta && (
                        <span className="text-xs text-muted-foreground tabular-nums">{step.meta}</span>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">{step.help}</TooltipContent>
                </Tooltip>
              </div>
            ))}
          </TooltipProvider>
          </div>

          <div className="flex items-center gap-2 md:ml-auto shrink-0">
            {nextStep ? (
              <>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  Next: {nextStep.label.toLowerCase()}
                </span>
                {nextAction &&
                  (nextAction.to ? (
                    <Button size="sm" variant="outline" asChild>
                      <Link to={nextAction.to}>{nextAction.label}</Link>
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={nextAction.onClick ?? undefined}>
                      {nextAction.label}
                    </Button>
                  ))}
              </>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <HelpCircle className="h-3.5 w-3.5" />
                Full cycle complete
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
