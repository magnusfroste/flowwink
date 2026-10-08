/**
 * "Var kommer detta ifrån" — the one line under a row that says who wrote it.
 *
 * Rows carry two halves: the person (created_by / updated_by → profiles) and
 * the surface or agent (created_by_agent / updated_by_agent). The surface is a
 * fixed vocabulary ('flowpilot', 'mcp', …); since 2026-10-08 the MCP gateway
 * passes the connected agent's own name instead ('Hermes_peter'), so the line
 * reads "Peter via Hermes_peter" rather than "Peter via external agent". Both
 * halves are facts a colleague needs before trusting the row — a NULL person
 * means "no signed-in human", not "nobody".
 */
export const AGENT_SURFACE_LABEL: Record<string, string> = {
  flowwork: 'FlowWork',
  flowpilot: 'FlowPilot',
  flowchat: 'FlowChat',
  mcp: 'external agent',
  cron: 'scheduled run',
  agent: 'agent',
};

/** Human-readable surface or agent name. Unknown values are agent names and pass through. */
export function agentSurfaceLabel(agent: string | null | undefined): string | null {
  if (!agent) return null;
  return AGENT_SURFACE_LABEL[agent] ?? agent;
}

/** "Peter via Hermes_peter" · "Peter" · "FlowPilot" · null when nothing is known. */
export function provenanceLabel(human: string | null | undefined, agent: string | null | undefined): string | null {
  const surface = agentSurfaceLabel(agent);
  if (human && surface) return `${human} via ${surface}`;
  return human ?? surface ?? null;
}
