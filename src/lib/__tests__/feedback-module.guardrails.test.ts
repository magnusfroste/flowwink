import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { feedbackModule } from '../modules/feedback-module';
import { FEEDBACK_DEFAULT_ENDPOINT, receivesHere, sameHost } from '../feedback-endpoint';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

/**
 * The feedback module: Easypanel's board for every instance, with the endpoint
 * as the dial. Default: send to www.flowwink.com (feedback + a daily ping).
 * An instance whose endpoint names itself receives: /feedback, /admin/feedback,
 * manage_feedback. One code path for the admin form and an agent.
 */
describe('feedback module — on by default, endpoint upstream', () => {
  it('is registered, on by default, and declares its four skills and the daily ping', () => {
    expect(feedbackModule.id).toBe('feedback');
    expect(feedbackModule.skills).toEqual(['submit_feedback', 'feedback_ping', 'manage_feedback', 'browse_feedback']);
    expect(feedbackModule.automations?.map((a) => a.skill_name)).toEqual(['feedback_ping']);
    expect(feedbackModule.automations?.[0].executor).toBe('platform');
    const useModules = read('src/hooks/useModules.tsx');
    expect(useModules).toMatch(/feedback: \{\n {4}enabled: true,/);
    expect(useModules).toMatch(/'\/admin\/feedback': 'feedback'/);
    expect(read('src/lib/module-registry.ts')).toMatch(/feedbackModule/);
    expect(read('src/components/admin/adminNavigation.ts')).toMatch(/href: "\/admin\/feedback", icon: MessageSquarePlus, moduleId: "feedback"/);
  });
  it('the endpoint is one constant, and "receives here" means empty or this site', () => {
    expect(FEEDBACK_DEFAULT_ENDPOINT).toBe('https://www.flowwink.com');
    expect(read('supabase/functions/agent-execute/index.ts')).toMatch(/const FEEDBACK_DEFAULT_ENDPOINT = 'https:\/\/www\.flowwink\.com';/);
    expect(receivesHere('', 'https://a.example')).toBe(true);
    expect(receivesHere('https://a.example/', 'https://a.example')).toBe(true);
    expect(receivesHere('https://www.flowwink.com', 'https://a.example')).toBe(false);
    expect(sameHost('https://A.example/x', 'https://a.example')).toBe(true);
  });
  it('the skills are self-describing and the ping honours share_usage', () => {
    const seeds = feedbackModule.skillSeeds!;
    for (const s of seeds) {
      expect(s.description, s.name).toMatch(/Use when:/);
      expect(s.description, s.name).toMatch(/NOT for:/);
      expect(s.handler, s.name).toBe('module:feedback');
    }
    expect(seeds.find((s) => s.name === 'browse_feedback')!.scope).toBe('both');
    const src = read('supabase/functions/agent-execute/index.ts');
    expect(src).toMatch(/case 'feedback': \{\n {6}return await executeFeedbackAction\(supabase, skillName, args\);/);
    expect(src).toMatch(/if \(settings\.share_usage === false\) return \{ skipped: 'feedback\.share_usage is off — nothing was sent\.' \};/);
    expect(src).toMatch(/`\$\{endpoint\}\/api\/\$\{sub\}`/);
    // The ping carries the schema head beside the skills sha (instance_sync_status
    // admits the service role); a ledger it cannot read answers null, never a
    // failed ping — and the receiver stores exactly that field.
    expect(src).toMatch(/await supabase\.rpc\('instance_sync_status'\)/);
    expect(src).toMatch(/return \{ app: 'flowwink', skills_sha, migration_head, modules_enabled, module_count: modules_enabled\.length \};/);
    expect(src).toMatch(/skills_sha: version\.skills_sha, migration_head: version\.migration_head,/);
    expect(read('supabase/functions/content-api/index.ts')).toMatch(/p_migration_head: typeof body\.migration_head === 'string'/);
    expect(read('src/pages/admin/FeedbackPage.tsx')).toMatch(/\{r\.migration_head \?\? '—'\}/);
  });
  it('the receiving side: tables with public read, content-api routes, the Vercel proxy, the pages', () => {
    const sql = read('supabase/migrations/20261027190000_feedbackbradan.sql');
    for (const t of ['feedback_posts', 'feedback_votes', 'feedback_comments', 'feedback_instances']) expect(sql).toContain(`CREATE TABLE IF NOT EXISTS public.${t}`);
    expect(sql).toMatch(/"feedback_posts_public_read" ON public\.feedback_posts FOR SELECT TO anon, authenticated USING \(true\)/);
    expect(sql).toMatch(/can_access_module\(auth\.uid\(\), 'feedback'\)/);
    expect(sql).not.toMatch(/feedback_votes_public_read/);
    const api = read('supabase/functions/content-api/index.ts');
    for (const route of ["sub === 'ping'", "sub === 'vote'", "sub === 'comment'", "pathParts[1] === 'posts'", "pathParts[1] === 'post'"]) expect(api).toContain(route);
    expect(api).toMatch(/typeof body\.website === 'string' && body\.website\.trim\(\)/);
    expect(read('api/feedback.ts')).toMatch(/content-api\/feedback\$\{sub \? `\/\$\{sub\}` : ''\}/);
    expect(read('vercel.json')).toMatch(/"src": "\/api\/feedback\/\(\.\*\)"/);
    const app = read('src/App.tsx');
    expect(app).toContain('{ path: "/feedback", element: <FeedbackBoardPage /> }');
    expect(app).toContain('{ path: "/feedback/:id", element: <FeedbackPostPage /> }');
    expect(app).toContain('{ path: "/admin/feedback", element: <FeedbackPage /> }');
  });
  it('what the instance sends home is said once, where it is born, and can be refused from the environment', () => {
    expect(read('src/components/admin/InstanceReadinessChecklist.tsx')).toMatch(/FEEDBACK_SHARE_USAGE=false/);
    expect(read('supabase/functions/agent-execute/index.ts')).toMatch(/Deno\.env\.get\('FEEDBACK_SHARE_USAGE'\)/);
    expect(read('README.md')).toMatch(/### Telemetry — one daily ping, one switch/);
    expect(read('docs/operators/telemetry.md')).toMatch(/## Switching it off/);
    expect(read('docs/operators/README.md')).toMatch(/telemetry\.md/);
    expect(read('src/pages/FeedbackBoardPage.tsx')).toMatch(/t\('feedback\.privacy'/);
  });
  it('the public board writes through content-api with the anon key, never functions.invoke', () => {
    const hook = read('src/hooks/useFeedbackBoard.ts');
    expect(hook).toMatch(/functions\/v1\/content-api\/feedback/);
    expect(hook).toMatch(/Authorization: `Bearer \$\{import\.meta\.env\.VITE_SUPABASE_PUBLISHABLE_KEY\}`/);
    // the admin goes through the module's skills — one code path with an agent
    expect(hook).toMatch(/supabase\.functions\.invoke\('agent-execute'/);
  });
});
