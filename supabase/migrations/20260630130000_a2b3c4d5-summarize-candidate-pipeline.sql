-- Make summarize_candidate_pipeline actually summarize.
--
-- The skill was wired to db:applications (generic CRUD list), so it returned a
-- raw {items:[]} instead of the documented summary (per-job stage counts,
-- stuck applications, top unreviewed). Same dead-handler class as
-- research_content / generate_content_proposal. This RPC computes the real
-- aggregation; the skill handler is flipped to rpc:summarize_candidate_pipeline.
-- Read-only (STABLE). Idempotent + forward-dated.

DROP FUNCTION IF EXISTS "public"."summarize_candidate_pipeline"(int);

CREATE OR REPLACE FUNCTION "public"."summarize_candidate_pipeline"(
  "p_job_id" "uuid" DEFAULT NULL,
  "p_stuck_threshold_days" int DEFAULT 7
) RETURNS "jsonb"
LANGUAGE "plpgsql" STABLE SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_by_stage jsonb; v_stuck jsonb; v_top jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_by_stage FROM (
    SELECT jp.title AS job, a.stage::text AS stage, count(*) AS n
    FROM applications a LEFT JOIN job_postings jp ON jp.id = a.job_posting_id
    WHERE (p_job_id IS NULL OR a.job_posting_id = p_job_id)
    GROUP BY jp.title, a.stage ORDER BY jp.title, a.stage) x;
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_stuck FROM (
    SELECT a.id, a.candidate_name, a.stage::text AS stage,
           EXTRACT(DAY FROM now() - a.updated_at)::int AS days_in_stage
    FROM applications a
    WHERE (p_job_id IS NULL OR a.job_posting_id = p_job_id)
      AND a.hired_at IS NULL AND a.rejected_reason IS NULL
      AND a.updated_at < now() - make_interval(days => GREATEST(p_stuck_threshold_days, 1))
    ORDER BY a.updated_at ASC LIMIT 50) x;
  SELECT COALESCE(jsonb_agg(x), '[]'::jsonb) INTO v_top FROM (
    SELECT a.id, a.candidate_name, a.ai_score, a.stage::text AS stage
    FROM applications a
    WHERE (p_job_id IS NULL OR a.job_posting_id = p_job_id)
      AND a.ai_score IS NOT NULL AND a.hired_at IS NULL AND a.rejected_reason IS NULL
    ORDER BY a.ai_score DESC LIMIT 10) x;
  RETURN jsonb_build_object('success', true, 'stuck_threshold_days', p_stuck_threshold_days,
    'totals_by_stage', v_by_stage, 'stuck_applications', v_stuck, 'top_unreviewed', v_top);
END $$;

GRANT EXECUTE ON FUNCTION "public"."summarize_candidate_pipeline"("uuid", int)
  TO "anon", "authenticated", "service_role";
NOTIFY pgrst, 'reload schema';
