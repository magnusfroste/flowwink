/**
 * A miss names what was probably meant (2026-11-21).
 *
 * On www FlowPilot sent the slug "the-workflow-reliability-layer-for-ai-automation"
 * fifteen times in a week; the post is
 * "the-workflow-reliability-layer-how-small-teams-prevent-silent-automation-drift".
 * "No blog post with slug …" gave the next run nothing but another try. On
 * Nordbrygg an agent asked the party register for lens "supplier" and the
 * communications log for status "received", and was refused both times.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { didYouMeanSlugs, nearestSlugs, slugNearness } from '../../../supabase/functions/_shared/skills/nearest-slug';

const ROOT = join(__dirname, '../../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf-8');

const posts = [
  { slug: 'the-workflow-reliability-layer-how-small-teams-prevent-silent-automation-drift', title: 'The Workflow Reliability Layer', id: '1' },
  { slug: 'why-agents-need-approvals', title: 'Why agents need approvals', id: '2' },
  { slug: 'the-year-in-review', title: 'The year in review', id: '3' },
];

describe('nearest slug', () => {
  it('the slug FlowPilot kept sending finds the post it meant', () => {
    const near = nearestSlugs('the-workflow-reliability-layer-for-ai-automation', posts);
    expect(near.map((n) => n.id)).toEqual(['1']);
    expect(didYouMeanSlugs(near)).toContain('Did you mean "the-workflow-reliability-layer-how');
  });

  it('one shared word is a coincidence, not a suggestion', () => {
    expect(slugNearness('the-pricing-page', 'the-year-in-review')).toBe(0);
    expect(nearestSlugs('something-else-entirely', posts)).toEqual([]);
    expect(didYouMeanSlugs([])).toBe('');
  });

  it('a title in other words is found too', () => {
    expect(nearestSlugs('agents-need-approvals', posts).map((n) => n.id)).toEqual(['2']);
  });
});

describe('the skills use it', () => {
  const core = read('supabase/functions/_shared/execute/core.ts');

  it('a blog slug that names nothing answers did_you_mean, and never acts on it', () => {
    expect(core).toMatch(/nothing was changed\.\$\{didYouMeanSlugs\(near\)\}/);
    expect(core).toMatch(/did_you_mean: near/);
  });

  it('"received" is inbound, not an unknown status', () => {
    expect(core).toMatch(/status === 'received' \|\| status === 'inbound'/);
    expect(read('src/lib/modules/email-module.ts')).toMatch(/direction: \{[\s\S]{0,120}enum: \['outbound', 'inbound'\]/);
  });

  it('the party register reads supplier as vendors', () => {
    const file = readdirSync(join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
      .filter((f) => read(`supabase/migrations/${f}`).includes('FUNCTION public.search_partners(')).pop()!;
    expect(read(`supabase/migrations/${file}`)).toMatch(/WHEN 'supplier' THEN 'vendors'/);
  });
});
