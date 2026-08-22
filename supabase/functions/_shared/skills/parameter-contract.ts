/**
 * The skill-parameter contract bounce, in one place.
 *
 * A guard that names a mistake without naming the fix is a dead end, and a
 * model in a loop answers a dead end by looking for another door. Verified in
 * agent_activity on a live instance (2026-08-22):
 *
 *   19:40:44  manage_page           failed  → "[preflight-bounce] unknown parameter(s) is_published"
 *   19:41:21  landing_page_compose  success → a page of four bare text blocks
 *
 * The model had guessed `is_published` (a reasonable guess — manage_docs_page
 * and manage_kb_article really do take it). The preflight was RIGHT to bounce:
 * manage_page's schema has no such parameter and its handler never reads one;
 * publication there is `action: "publish"`. But the message only said the name
 * was unknown. Thirty-seven seconds later the model had abandoned the good
 * skill for a weaker one and built a worse page.
 *
 * So the bounce carries its own remedy: the unknown name, the nearest valid
 * one (computed, never a hardcoded pair — Law 1), the full valid list, and a
 * pointer to the skill's instructions when it has any. Same voice as the block
 * field guard, which already works this way.
 */
import { suggestClosestNames, suggestEnumValueFix } from '../suggest-names.ts';

export interface ParameterBounce {
  /** Short line for the agent_activity trail. */
  summary: string;
  /** Tool-result body handed back to the model. */
  body: {
    error: string;
    did_you_mean: Record<string, string[]>;
    valid_parameters: string[];
    hint: string;
  };
}

export interface UnknownParameterBounceInput {
  skillName: string;
  /** The argument keys the schema does not declare. */
  unknown: string[];
  /** What the caller actually sent — the VALUE decides some suggestions. */
  args: Record<string, unknown>;
  /** JSON-schema `properties` of the skill's declared parameters. */
  properties: Record<string, unknown>;
  /** Whether agent_skills.instructions is non-empty for this skill. */
  hasInstructions: boolean;
}

/**
 * Build the self-correcting bounce for argument keys a skill does not declare.
 */
export function buildUnknownParameterBounce(
  input: UnknownParameterBounceInput,
): ParameterBounce {
  const { skillName, unknown, args, properties, hasInstructions } = input;
  const validNames = Object.keys(properties ?? {});

  const didYouMean: Record<string, string[]> = {};
  const clauses: string[] = [];

  for (const key of unknown) {
    // The enum pass first: it names a COMPLETE fix (parameter + value), and it
    // is what rescues `is_published` — no valid parameter name of manage_page
    // is textually near it, but `action`'s enum carries "publish", the stem of
    // the word the caller used. Reference keys are excluded: `list_id` names an
    // entity, and "did you mean action: list?" would be a confident wrong turn.
    const isRefKey = key === 'id' || key.endsWith('_id');
    const enumHits = isRefKey ? [] : suggestEnumValueFix(key, properties, args?.[key]);
    if (enumHits.length) {
      const hit = enumHits[0];
      didYouMean[key] = [`${hit.parameter}: "${hit.value}"`];
      clauses.push(
        `${key} → this skill expresses that as ${hit.parameter}: "${hit.value}" `
        + `(a declared value of "${hit.parameter}"), not as a parameter of its own`,
      );
      continue;
    }
    const near = suggestClosestNames(key, validNames, { limit: 2 });
    if (near.length) {
      didYouMean[key] = near;
      clauses.push(`${key} → did you mean ${near.map((n) => `"${n}"`).join(' or ')}?`);
      continue;
    }
    clauses.push(`${key} → no declared parameter of "${skillName}" is close to it`);
  }

  const error =
    `Not staged: unknown parameter(s) ${unknown.join(', ')} for skill "${skillName}" — `
    + `nothing reads them, so the call would not do what you intend. `
    + `${clauses.join('; ')}. `
    + `Valid parameters for "${skillName}": ${validNames.join(', ')}.`;

  const hint =
    `Fix the named argument(s) and call this skill again — a bounce is a correction, not a dead end, `
    + `and switching to a different skill because of it produces a worse result than the one you were asked for.`
    + (hasInstructions
      ? ` This skill has instructions: call read_skill({ name: "${skillName}" }) for the full contract before you retry.`
      : '')
    + ` Only if the valid parameters genuinely cannot express what you are trying to do is this the wrong skill — `
    + `then call search_skills for the module that owns the entity (e.g. manage_ticket for tickets).`;

  const suggested = Object.entries(didYouMean)
    .map(([k, v]) => `${k}→${v.join('|')}`)
    .join(', ');

  return {
    summary: `unknown parameter(s) ${unknown.join(', ')}${suggested ? ` (suggested ${suggested})` : ''}`,
    body: { error, did_you_mean: didYouMean, valid_parameters: validNames, hint },
  };
}
