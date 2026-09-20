import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parity round 2026-09-20, analytics. Odoo's website analytics has GOALS: you
 * say what counts as a conversion and measure how many visitors reach it.
 * FlowWink had every part except that question — and except the answer to its
 * most FlowWink-native form: which PAGE gave the lead.
 */

const root = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => read(`supabase/migrations/${f}`)).join('\n');

function latestFunctionBody(fn: string): string {
  const start = migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`);
  expect(start, `${fn} is defined in a migration`).toBeGreaterThan(-1);
  return migrations.slice(start, migrations.indexOf('$function$;', start));
}

describe('a conversion has one definition', () => {
  it('both reports read the same completion set', () => {
    const completions = latestFunctionBody('conversion_completions');
    for (const kind of ['lead', 'booking', 'order', 'quote_accepted', 'subscription', 'page_reached']) {
      expect(completions, `${kind} is defined`).toContain(`p_kind = '${kind}'`);
    }
    // A page reached is one visitor, not one reload.
    expect(completions).toMatch(/GROUP BY pv\.visitor_id;/);
    expect(latestFunctionBody('conversion_report')).toMatch(/public\.conversion_completions\(g\.kind, g\.page_slug, v_from\)/);
  });

  it('two goals cannot count the same thing twice', () => {
    expect(migrations).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS conversion_goals_one_per_definition\s+ON public\.conversion_goals \(kind, COALESCE\(page_slug, ''\)\) WHERE is_active/);
    expect(latestFunctionBody('manage_conversion_goal')).toMatch(/would count the same thing twice/);
  });
});

describe('the report never dresses a guess as revenue', () => {
  it('an assumed value says that it is assumed', () => {
    const b = latestFunctionBody('conversion_report');
    expect(b).toMatch(/'assumed from the goal value'/);
    expect(b).toMatch(/WHEN v_actual THEN 'actual'/);
    expect(read('src/components/admin/analytics/ConversionsTab.tsx')).toMatch(/assumed<\/Badge>/);
  });

  it('with no traffic the rate is absent, not zero', () => {
    const b = latestFunctionBody('conversion_report');
    expect(b).toMatch(/CASE WHEN v_visitors > 0 THEN round\(100\.0 \* v_completions \/ v_visitors, 2\) END/);
    expect(b).toMatch(/conversion rates are absent, not zero/);
    expect(latestFunctionBody('analytics_dashboard')).toMatch(/rather than zero conversion/);
  });

  it('the page report says a lead credited to several pages does not sum', () => {
    const b = latestFunctionBody('page_conversion_report');
    expect(b).toMatch(/does not sum to total revenue/);
    expect(b).toMatch(/lower\(o\.customer_email\) IN/); // an order carries an e-mail, not a lead id
  });
});

describe('a lead born in the chat gets its attribution', () => {
  it('stitching stamps first and last touch from the visitor\'s own page views', () => {
    const b = latestFunctionBody('stitch_visitor_to_lead');
    expect(b).toMatch(/attribution-stamp 20260920080000/);
    expect(b).toMatch(/WHERE visitor_id = p_visitor_id AND utm_source IS NOT NULL\s+ORDER BY created_at LIMIT 1/);
    expect(b).toMatch(/first_utm_source = COALESCE\(first_utm_source, v_first\.utm_source\)/);
    // What the form already captured is never overwritten: it was there when it happened.
    expect(b).toMatch(/AND \(first_utm_source IS NULL OR last_utm_source IS NULL\)/);
    // The behaviour it already had must survive.
    expect(b).toMatch(/UPDATE public\.page_views\s+SET lead_id = p_lead_id/);
    expect(b).toMatch(/INSERT INTO public\.visitor_identities/);
  });
});

describe('both surfaces', () => {
  it('the skills are seeded with the parameter names the functions take', () => {
    type Seed = { name: string; handler: string; tool_definition: { function: { parameters: { properties: Record<string, unknown> } } } };
    const artifact = JSON.parse(read('supabase/seed/module-skills.json')) as { modules: Array<{ skills: Seed[] }> };
    const skills = artifact.modules.flatMap((m) => m.skills);
    for (const name of ['manage_conversion_goal', 'conversion_report', 'page_conversion_report', 'analytics_dashboard']) {
      const skill = skills.find((s) => s.name === name);
      expect(skill?.handler, name).toBe(`rpc:${name}`);
      const head = migrations.slice(migrations.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`));
      const signature = head.slice(0, head.indexOf('RETURNS'));
      for (const param of Object.keys(skill!.tool_definition.function.parameters.properties)) {
        expect(signature, `${name} takes ${param}`).toContain(param);
      }
    }
  });

  it('the goals are closed to anonymous visitors and follow the matrix', () => {
    expect(migrations).toMatch(/ALTER TABLE public\.conversion_goals ENABLE ROW LEVEL SECURITY/);
    expect(migrations).toMatch(/REVOKE ALL ON public\.conversion_goals FROM anon/);
    expect(migrations).toMatch(/USING \(can_access_module\(auth\.uid\(\), 'analytics'\)\)/);
  });

  it('the dashboard tab is mounted', () => {
    const page = read('src/pages/admin/AnalyticsDashboardPage.tsx');
    expect(page).toMatch(/<TabsTrigger value="conversions">Conversions<\/TabsTrigger>/);
    expect(page).toMatch(/<ConversionsTab days=\{period\} \/>/);
  });
});
