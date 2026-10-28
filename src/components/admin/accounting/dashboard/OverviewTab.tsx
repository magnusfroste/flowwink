import { BooksAttentionCard } from './BooksAttentionCard';
import { EventsToBookCard } from './EventsToBookCard';
import { AgentActivityCard } from './AgentActivityCard';
import { ResultCard } from './ResultCard';
import { VatCard } from './VatCard';
import { TaxPreviewCard } from './TaxPreviewCard';
import { PeriodStatusCard } from './PeriodStatusCard';

export function OverviewTab({ onNavigate }: { onNavigate?: (tabId: string) => void }) {
  return (
    <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <BooksAttentionCard onNavigate={onNavigate} />
      <EventsToBookCard onNavigate={onNavigate} />
      <AgentActivityCard />
      <ResultCard />
      <VatCard />
      <TaxPreviewCard />
      <PeriodStatusCard onNavigate={onNavigate} />
    </div>
  );
}
