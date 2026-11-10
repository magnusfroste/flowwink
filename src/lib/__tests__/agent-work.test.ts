import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { summarizeAgentWork, openQuestionTasks, stopReason, isAgentCall, agentLabel, type AgentActivityRow, type TaskCommentRow } from '@/lib/agent-work';

/**
 * Agent work, in plain words (#869). The panel shows an owner what waits on a
 * person and where an agent was stopped. These pin the reading: who counts as
 * an agent, what counts as waiting, and that an off module stays quiet.
 */
const row = (o: Partial<AgentActivityRow>): AgentActivityRow => ({
  id: Math.random().toString(36).slice(2), agent: 'mcp', skill_name: 'manage_lead', status: 'success',
  error_message: null, output: null, created_at: '2026-11-10T09:00:00Z', ...o,
});
const comment = (o: Partial<TaskCommentRow>): TaskCommentRow => ({
  task_id: 't1', project_id: 'p1', kind: 'comment', author_type: 'person', author_name: null, created_at: '2026-11-10T09:00:00Z', ...o,
});
const base = { comments: [], stagedCount: 0, todayStart: '2026-11-10T00:00:00Z', shown: () => true };

describe('agent work', () => {
  it('a person at the admin and the scheduler are not agents', () => {
    expect(isAgentCall({ agent: 'mcp' })).toBe(true);
    expect(isAgentCall({ agent: 'flowpilot' })).toBe(true);
    for (const a of ['admin_ui', 'cron', 'system', 'automation', '', null]) expect(isAgentCall({ agent: a })).toBe(false);
    expect(agentLabel('mcp')).toBe('Connected agent');
    expect(agentLabel('hermes')).toBe('Hermes');
  });

  it('counts today, and the week\'s refused and failed apart', () => {
    const s = summarizeAgentWork({
      ...base,
      activity: [
        row({ agent: 'flowpilot' }), row({ agent: 'mcp' }), row({ agent: 'mcp' }),
        row({ created_at: '2026-11-08T09:00:00Z' }),                    // success, not today
        row({ status: 'refused', output: { status: 'refused', code: 'MODULE_DISABLED' }, created_at: '2026-11-09T09:00:00Z' }),
        row({ status: 'failed', error_message: 'period is locked\nstack…', created_at: '2026-11-10T08:00:00Z' }),
        row({ agent: 'cron', status: 'failed' }),                       // the automation widget's
        row({ agent: 'admin_ui' }),                                     // a person
      ],
    });
    expect(s.actionsToday).toBe(3);
    expect(s.agentsToday).toEqual(['Connected agent', 'FlowPilot']);
    expect(s.refused).toBe(1);
    expect(s.failed).toBe(1);
    expect(s.stopped.map((x) => [x.outcome, x.reason])).toEqual([['failed', 'period is locked'], ['refused', 'module disabled']]);
  });

  it('a skill of a module that is off is not shown at all', () => {
    const s = summarizeAgentWork({
      ...base,
      activity: [row({ skill_name: 'manage_webinar', status: 'failed' }), row({ skill_name: 'manage_lead', status: 'failed' })],
      shown: (skill) => skill !== 'manage_webinar',
    });
    expect(s.failed).toBe(1);
    expect(s.stopped[0].skill).toBe('manage_lead');
  });

  it('a question waits until a person writes after it', () => {
    const asked = comment({ kind: 'question', author_type: 'agent', created_at: '2026-11-09T10:00:00Z' });
    expect(openQuestionTasks([asked])).toEqual(['t1']);
    expect(openQuestionTasks([asked, comment({ created_at: '2026-11-09T09:00:00Z' })])).toEqual(['t1']); // written before
    expect(openQuestionTasks([asked, comment({ created_at: '2026-11-09T11:00:00Z' })])).toEqual([]);      // answered
    // a later step by the agent itself is not an answer; a person's own question is not an agent's
    expect(openQuestionTasks([asked, comment({ kind: 'step', author_type: 'agent', created_at: '2026-11-09T12:00:00Z' })])).toEqual(['t1']);
    expect(openQuestionTasks([comment({ kind: 'question' })])).toEqual([]);
    const s = summarizeAgentWork({ ...base, activity: [], comments: [asked, comment({ task_id: 't2', kind: 'question', author_type: 'flowpilot' })], stagedCount: 2 });
    expect([s.openQuestions, s.staged]).toEqual([2, 2]);
  });

  it('the reason is the refusal\'s code, else the error\'s first line, else says so', () => {
    expect(stopReason(row({ status: 'refused', output: { result: { code: 'READ_ONLY_KEY' } } }))).toBe('read only key');
    expect(stopReason(row({ status: 'failed', error_message: 'x'.repeat(200) })).length).toBe(88);
    expect(stopReason(row({ status: 'failed' }))).toBe('no reason recorded');
  });

  it('the panel is on the dashboard, in the admin preset, and reads the one module rule', () => {
    const root = join(__dirname, '../../..');
    expect(readFileSync(join(root, 'src/pages/admin/AdminDashboard.tsx'), 'utf-8')).toMatch(/case 'agent-work':\s+return <AgentWorkDashboardWidget/);
    // The availability map is a second list: a widget missing from it is silently never drawn.
    expect(readFileSync(join(root, 'src/pages/admin/AdminDashboard.tsx'), 'utf-8')).toMatch(/'agent-work': true,/);
    const presets = readFileSync(join(root, 'src/lib/dashboard-presets.ts'), 'utf-8');
    expect(presets).toMatch(/id: 'agent-work'/);
    expect(presets).toMatch(/admin: \[[^\]]*'agent-work'/);
    expect(readFileSync(join(root, 'src/components/admin/AgentWorkDashboardWidget.tsx'), 'utf-8')).toMatch(/skillShown\(skill, active\)/);
  });
});
