/**
 * Developer — the machine-readable surface, for the people who build AGAINST
 * FlowWink. Three doors, each for a different reader (2026-11-06):
 *
 *   MCP Keys     — a key to the gateway for a script, a job, or an agent you
 *                  are still evaluating. A person's own agent is connected on
 *                  Agents → Connect an agent, which makes the key for them.
 *   Content API  — read the site's content from your own app or site: REST,
 *                  GraphQL, code examples. The headless-site reader.
 *   Webhooks     — tell another system when something happens here.
 *   QA findings  — what a testing agent reported (`beta_test_findings`,
 *                  `scan_beta_findings` / `resolve_finding` over MCP). Moved
 *                  here from Agents (2026-11-22): it is a builder's list, not
 *                  an operator's. The table is the federation module's, so
 *                  the tab is there only while federation is on.
 *
 * What left and why: "MCP Skills" (what agents may do) is an operator's
 * question, not a developer's — it lives on /admin/skills → Manage, so there
 * is ONE skills page instead of three. "Dev Tools" was a mock webhook logger
 * in React state beside the real delivery log, and two "Coming soon" cards.
 */
import { Code2, Webhook, KeyRound, Bug } from 'lucide-react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentApiContent } from '@/pages/admin/ContentApiPage';
import { WebhooksContent } from '@/pages/admin/WebhooksPage';
import { ApiKeysContent } from '@/pages/admin/ApiKeysPage';
import { McpFindings } from '@/components/admin/federation/McpFindings';
import { useIsModuleEnabled } from '@/hooks/useModules';

const TABS = ['mcp-keys', 'api', 'webhooks', 'qa-findings'] as const;
type Tab = (typeof TABS)[number];

const INTRO: Record<Tab, string> = {
  'mcp-keys': 'Keys to the MCP gateway, for a script, a scheduled job, or an agent you are still evaluating. Connecting your own agent starts on Agents → Connect an agent, which makes its key for you.',
  api: 'Read this site\'s content from your own app or site — a headless front-end, a mobile app, a partner integration. Public content needs no key; business data answers to a signed-in user.',
  webhooks: 'Tell another system when something happens here: a form submitted, an order placed, a page published. Each delivery is logged.',
  'qa-findings': 'What a testing agent reported while it exercised this instance. Check a finding with a live call before you act on it — many are a wrong argument name, not a missing feature.',
};

export default function DeveloperPage() {
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const federationOn = useIsModuleEnabled('federation');

  // The skills catalogue moved to its own page; the old deep link still lands.
  if (requested === 'mcp-skills') return <Navigate to="/admin/skills?tab=manage" replace />;

  const known = (TABS as readonly string[]).includes(requested ?? '') && (requested !== 'qa-findings' || federationOn);
  const tab: Tab = known ? (requested as Tab) : 'mcp-keys';

  return (
    <AdminLayout>
      <AdminPageContainer>
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v }, { replace: true })}>
          <AdminPageHeader
            title="Developer"
            description="The platform's machine-readable surface: keys for agents and scripts, the Content API for your own front-ends, webhooks for other systems."
          >
            <TabsList>
              <TabsTrigger value="mcp-keys" className="gap-1.5">
                <KeyRound className="h-3.5 w-3.5" />
                MCP Keys
              </TabsTrigger>
              <TabsTrigger value="api" className="gap-1.5">
                <Code2 className="h-3.5 w-3.5" />
                Content API
              </TabsTrigger>
              <TabsTrigger value="webhooks" className="gap-1.5">
                <Webhook className="h-3.5 w-3.5" />
                Webhooks
              </TabsTrigger>
              {federationOn && (
                <TabsTrigger value="qa-findings" className="gap-1.5">
                  <Bug className="h-3.5 w-3.5" />
                  QA findings
                </TabsTrigger>
              )}
            </TabsList>
          </AdminPageHeader>

          <p className="text-sm text-muted-foreground mb-4 max-w-3xl">{INTRO[tab]}</p>

          <TabsContent value="mcp-keys" className="mt-0">
            <ApiKeysContent />
          </TabsContent>

          <TabsContent value="api" className="mt-0">
            <ContentApiContent />
          </TabsContent>

          <TabsContent value="webhooks" className="mt-0">
            <WebhooksContent />
          </TabsContent>

          {federationOn && (
            <TabsContent value="qa-findings" className="mt-0">
              <McpFindings />
            </TabsContent>
          )}
        </Tabs>
      </AdminPageContainer>
    </AdminLayout>
  );
}
