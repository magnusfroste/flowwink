/**
 * The report dialect lives with the edge (supabase/functions/_shared/reports/
 * blocks.ts) so publish_report checks a live block with the same parser the
 * reader draws it with. One rule, two readers.
 */
export * from '../../supabase/functions/_shared/reports/blocks';
