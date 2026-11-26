/**
 * Which knowledge a person's agent may search (2026-11-26).
 *
 * search_knowledge runs on the service client, so the database's own rules
 * (RLS per module) never see who asked: before this, every hit from every
 * source came back to whoever was allowed to call the skill. That is why the
 * skill stayed admin-only for a colleague's agent — and why Svante's Claude
 * (owner: sales + marketing) was refused it on optic while it wrote nine KB
 * articles it could not search afterwards.
 *
 * Now the skill is open to every staff agent (owner module `wiki`, which every
 * role holds) and each SOURCE is judged by the module that owns it, with the
 * same question the gateway asks of a skill: `can_access_module(owner,
 * module)`. A source the person may not open in the admin is not searched, and
 * the answer names it in `left_out`. An admin passes every module; no caller
 * (the heartbeat, a scheduled tick) searches everything, as before.
 *
 * The keys are the handler's SEARCHABLE_KNOWLEDGE_SOURCES — one list, compared
 * by a guard.
 */
export const KNOWLEDGE_SOURCE_MODULE: Readonly<Record<string, string>> = Object.freeze({
  pages: 'pages',
  kb_articles: 'knowledgeBase',
  wiki_pages: 'wiki',
  handbook_chapters: 'handbook',
  documents: 'documents',
});

/** The sources the person may read, and the ones left out. An unmapped source is left out. */
export function narrowKnowledgeSources(
  candidates: readonly string[],
  mayOpen: (moduleId: string) => boolean,
): { sources: string[]; left_out: string[] } {
  const sources: string[] = [];
  const left_out: string[] = [];
  for (const s of candidates) {
    const mod = KNOWLEDGE_SOURCE_MODULE[s];
    if (mod && mayOpen(mod)) sources.push(s);
    else left_out.push(s);
  }
  return { sources, left_out };
}
