// What a board listing answers (2026-11-27). manage_feedback `list` and
// `instances` carried every instance's whole modules_enabled list — ~67 names
// per post and per instance — and an agent on www read 11 000–20 000
// characters per call, eight calls in a row, for titles and versions. A
// listing now names the instance and its versions and counts the modules;
// `full: true` (or `get` for one post) carries the list.

type Row = Record<string, unknown>;

/** A post's origin, without the module list. */
export function leanOrigin(origin: unknown): unknown {
  if (!origin || typeof origin !== 'object' || Array.isArray(origin)) return origin;
  const { modules_enabled, ...rest } = origin as Row;
  return Array.isArray(modules_enabled) && rest.module_count == null
    ? { ...rest, module_count: modules_enabled.length }
    : rest;
}

export function leanBoardPosts<T extends Row>(posts: T[], full: boolean): T[] {
  if (full) return posts;
  return posts.map((p) => ('origin' in p ? { ...p, origin: leanOrigin(p.origin) } : p));
}

export function leanInstances<T extends Row>(rows: T[], full: boolean): T[] {
  if (full) return rows;
  return rows.map((r) => {
    const { modules_enabled, ...rest } = r;
    return (Array.isArray(modules_enabled) && rest.module_count == null
      ? { ...rest, module_count: modules_enabled.length }
      : rest) as T;
  });
}

export const LEAN_BOARD_NOTE = 'Module lists are left out (module_count says how many); full: true carries them, and get answers one post whole.';
