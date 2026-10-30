import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * FlowPilot review step 2a: what FlowPilot needs a person for is visible in one
 * place, and 'notify' means someone is told.
 */
const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe("'notify' means someone is told", () => {
  it('agent-execute marks a notify run that did something', () => {
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toMatch(/trustLevel === 'notify' && !handlerFailed && !handlerRefused && !bypassApproval \? \{ log_type: 'notify' \}/);
    expect(src).toMatch(/\.\.\.\(activity\.log_type \? \{ log_type: activity\.log_type \} : \{\}\)/);
  });
  it('the activity row can be acknowledged, and unacknowledged notify runs are indexed', () => {
    const f = readdirSync(join(root, 'supabase/migrations')).find((n) => n.includes('notify-means-someone-is-told'));
    expect(f).toBeTruthy();
    const sql = read(`supabase/migrations/${f}`);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz/);
    expect(sql).toMatch(/WHERE log_type = 'notify' AND acknowledged_at IS NULL/);
  });
  it('the cockpit and the bell show notify runs until acknowledged', () => {
    expect(read('src/components/admin/copilot/FlowPilotOverviewTab.tsx')).toMatch(/Acted on its own/);
    expect(read('src/components/admin/NotificationsBell.tsx')).toMatch(/FlowPilot acted on its own/);
    expect(read('src/hooks/useAgentAttention.ts')).toMatch(/\.eq\('log_type', 'notify'\)/);
  });
});

describe('one approval queue', () => {
  it('staged operations are listed on the Approvals page, not only Accounting', () => {
    const page = read('src/pages/admin/ApprovalsPage.tsx');
    expect(page).toMatch(/<TabsContent value="staged"[\s\S]{0,600}<PendingOperationsList \/>/);
    expect(page).toMatch(/approvalsSearch\.get\('tab'\)/);
  });
  it('the bell counts staged operations', () => {
    expect(read('src/components/admin/NotificationsBell.tsx')).toMatch(/href="\/admin\/approvals\?tab=staged"/);
  });
  it('FlowChat points a pending or staged result at the queue', () => {
    expect(read('src/components/admin/copilot/OperateChat.tsx')).toMatch(/Review in Approvals/);
  });
  it("FlowWork's approval card speaks the admin's language (no hard-coded Swedish)", () => {
    // Comments (line, block and JSX {/* */}) are notes for developers, not UI.
    const card = read('src/components/admin/workspace/StagedActionCard.tsx')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const lines = card.split('\n').filter((l) => /[åäöÅÄÖ]/.test(l));
    expect(lines).toEqual([]);
    // The outcome notes the card prints come from staged-action-outcome.ts.
    const notes = read('src/lib/staged-action-outcome.ts').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(notes.split('\n').filter((l) => /[åäöÅÄÖ]/.test(l))).toEqual([]);
  });
});
