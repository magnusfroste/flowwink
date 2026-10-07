import { Helmet } from 'react-helmet-async';
import { useUiText } from '@/lib/ui-text';
import { ConnectedAgentsTable } from '@/components/admin/agents/ConnectedAgentsTable';
import { ConnectAgentWizard } from '@/components/admin/agents/ConnectAgentWizard';

/**
 * My agents — a colleague connects their own Claude, ChatGPT or Cursor to this
 * FlowWink. The agent acts as them: it reaches exactly the modules they can
 * reach, and everything it does carries their name. No admin needed.
 */
export default function MyAgentsPage() {
  const t = useUiText();
  const title = t('account.agents.title', 'My agents');
  return (
    <div className="space-y-6">
      <Helmet><title>{title}</title></Helmet>
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <p className="text-sm text-muted-foreground">{t('account.agents.intro', 'Connect the AI assistant you already use. It works here as you, within your access.')}</p>
      </div>
      <ConnectedAgentsTable mine />
      <ConnectAgentWizard mode="self" />
    </div>
  );
}
