import type { MissionTemplate } from '@/lib/agent-missions';
import { MCP_RESOURCES } from '@/lib/agent-missions';

/**
 * The onboarding prompt handed to a connected agent, with URL and key filled in.
 * Shared by the admin Agents page and the portal's My agents page so both doors
 * hand out the same instructions.
 */
export function buildAgentPrompt(opts: {
  mission: MissionTemplate;
  instructions: string;
  mcpUrl: string;
  rawKey: string;
  agentName: string;
  ownerName?: string | null;
}): string {
  const { mission, instructions, mcpUrl, rawKey, agentName, ownerName } = opts;
  const isOperator = mission.category === 'operator';
  const connectUrl = isOperator ? `${mcpUrl}?mode=dispatch` : mcpUrl;
  const instanceRef = (() => {
    try { return new URL(mcpUrl).host.split('.')[0]; } catch { return 'this instance'; }
  })();
  const signAs = ownerName ? `${agentName} (${ownerName.split(/[\s@]/)[0]})` : agentName;

  const introLine = isOperator
    ? `You are **${signAs}**, a connected agent operating a FlowWink business platform${ownerName ? ` on behalf of ${ownerName}` : ''}. You act within ${ownerName ? `${ownerName.split(/[\s@]/)[0]}'s` : 'your'} reach — the gateway checks every call against it — and you sign what you write as ${signAs}.`
    : `You are **${signAs}**, invited to inspect and audit a FlowWink site.`;

  const toolsSection = isOperator
    ? `## Working with tools

This platform has 500+ skills. To keep your context lean, your toolset is small — \`search_skills\`, \`read_skill\`, \`execute_skill\`, plus the lock pair (\`acquire_lock\` / \`release_lock\`) for multi-step work:

- \`search_skills({ query, groups? })\` — describe what you want to do; returns the most relevant skills.
- \`read_skill({ name })\` — load a skill's playbook before running it.
- \`execute_skill({ name, arguments })\` — run a chosen skill by name.

**Workflow**: read your mission → \`search_skills("score new leads")\` → \`read_skill\` if it has instructions → \`execute_skill\`. A call outside your owner's reach answers \`Forbidden\` with the module that is missing; that is a question for an admin, not a reason to retry.`
    : `## Discovering tools

Call \`tools/list\` to see what you can execute, then \`tools/call\` to run a tool.`;

  return `${introLine}

## Connection

Paste this whole block into your MCP client config — **URL and key together**. A FlowWink key is minted for ONE instance (\`${instanceRef}\`) and is rejected everywhere else.

\`\`\`json
{
  "mcpServers": {
    "flowwink": {
      "url": "${connectUrl}",
      "headers": { "Authorization": "Bearer ${rawKey}" }
    }
  }
}
\`\`\`

- **Transport**: MCP over Streamable HTTP (JSON-RPC over POST). Standard surfaces: \`resources/list\`, \`resources/read\`, \`tools/list\`, \`tools/call\`.

## First steps

1. **Read who you are and the context**: \`resources/read\` → \`flowwink://briefing\` — \`you\` (your name, owner, reach), the business, health, objectives, modules.
2. **Read your mission**: \`resources/read\` → \`flowwink://mission\` — stored durably; re-read it when this message has scrolled out of your context.

${toolsSection}

## Key resources

${mission.focusResources.map((r) => {
  const info = MCP_RESOURCES.find((mr) => mr.uri === r);
  return '- `' + r + '` — ' + (info?.description || '');
}).join('\n')}

## Your mission: ${mission.name}

${instructions}
${isOperator ? '' : `
## Reporting

Report issues with \`report_finding\` (via \`tools/call\`): { title, description, severity: critical|high|medium|low, type: bug|ux_issue|suggestion|missing_feature|performance|positive }. High and critical findings become objectives.
`}
## Verify the connection

Read \`flowwink://briefing\` — it should come back with \`you.name\` = "${agentName}".`;
}
