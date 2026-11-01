/**
 * Is there a newer FlowWink than this build — and what does "update" mean HERE?
 *
 * Releases are rare (v4.0.0) while every instance deploys from main, so a
 * release tag says little about a fork synced last night. What matters:
 *
 *   vercel   a fork on Vercel + Supabase: compare the build's commit with
 *            upstream main; the update is GitHub's "Sync fork" on the fork,
 *            after which Vercel and the Supabase pairing deploy themselves.
 *            There is no button here: the instance cannot push to its fork.
 *   docker   the prebuilt frontend image (Easypanel / a VPS): images follow
 *            RELEASE tags, so compare the release; the update is a pull.
 *   source   built from a checkout: compare commits; the update is pulling
 *            main and the four layers (migrations, functions, frontend).
 *
 * Quiet by design: a fork the nightly sync keeps current is at most a day
 * behind, so commits are only an update when upstream main has moved on for
 * more than two days past this build. Upstream itself never shows a notice.
 */

export const UPSTREAM_REPO = 'magnusfroste/flowwink';
export const STALE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

export type DeployKind = 'vercel' | 'docker' | 'source';

export interface UpdateInput {
  kind: string;
  sourceRepo: string;
  currentVersion: string;
  buildCommitDate: string | null;
  /** From GitHub compare upstream/{buildSha}...main — null when the sha is not upstream's. */
  behindBy: number | null;
  upstreamHeadDate: string | null;
  latestRelease: string | null;
}

export interface UpdateState {
  show: boolean;
  kind: DeployKind;
  behindBy: number | null;
  latestRelease: string | null;
}

function parse(v: string): number[] {
  return v.replace(/^v/, '').split('-')[0].split('.').map((n) => Number(n) || 0);
}

export function isNewerRelease(latest: string, current: string): boolean {
  const [a, b] = [parse(latest), parse(current)];
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

export function decideUpdate(input: UpdateInput): UpdateState {
  const kind: DeployKind = input.kind === 'docker' || input.kind === 'vercel' ? input.kind : 'source';
  const base: UpdateState = { show: false, kind, behindBy: input.behindBy, latestRelease: input.latestRelease };
  if (input.sourceRepo.toLowerCase() === UPSTREAM_REPO) return base;

  if (kind === 'docker') {
    return { ...base, show: !!input.latestRelease && isNewerRelease(input.latestRelease, input.currentVersion) };
  }

  if (input.behindBy === 0) return base;
  const head = input.upstreamHeadDate ? Date.parse(input.upstreamHeadDate) : NaN;
  const built = input.buildCommitDate ? Date.parse(input.buildCommitDate) : NaN;
  if (Number.isNaN(head) || Number.isNaN(built)) return base;
  return { ...base, show: head - built > STALE_AFTER_MS };
}
