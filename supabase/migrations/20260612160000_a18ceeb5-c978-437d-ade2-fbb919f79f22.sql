-- Agent ergonomics: FlowPilot's voice in Cowork Chat (workspace-chat.agent_post).
-- Cowork Chat was read-only RAG with no persistence; this adds cowork_messages so
-- agents (and humans) can post durable messages — heartbeat insights, daily
-- summaries, "I created 3 leads" notices — surfaced by the chat UI. Mirrors the
-- post_to_river pattern. Idempotent.

CREATE TABLE IF NOT EXISTS "public"."cowork_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_type" "text" DEFAULT 'agent' NOT NULL,
    "author_name" "text" DEFAULT 'FlowPilot' NOT NULL,
    "content" "text" NOT NULL,
    "metadata" "jsonb" DEFAULT '{}'::jsonb,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cowork_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cowork_messages_author_type_check"
      CHECK ("author_type" IN ('agent','user','system')),
    CONSTRAINT "cowork_messages_content_not_empty" CHECK (length(trim("content")) > 0)
);
CREATE INDEX IF NOT EXISTS "cowork_messages_created_idx" ON "public"."cowork_messages" ("created_at" DESC);

ALTER TABLE "public"."cowork_messages" OWNER TO "postgres";
ALTER TABLE "public"."cowork_messages" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage cowork_messages" ON "public"."cowork_messages";
CREATE POLICY "Admins manage cowork_messages" ON "public"."cowork_messages"
  USING ("public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role"));
DROP POLICY IF EXISTS "Staff view cowork_messages" ON "public"."cowork_messages";
CREATE POLICY "Staff view cowork_messages" ON "public"."cowork_messages"
  FOR SELECT USING (
    "public"."has_role"("auth"."uid"(), 'admin'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'approver'::"public"."app_role")
    OR "public"."has_role"("auth"."uid"(), 'writer'::"public"."app_role"));
GRANT ALL ON TABLE "public"."cowork_messages" TO "anon";
GRANT ALL ON TABLE "public"."cowork_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."cowork_messages" TO "service_role";

CREATE OR REPLACE FUNCTION "public"."post_to_cowork_chat"(
  "p_content" "text",
  "p_author_name" "text" DEFAULT 'FlowPilot',
  "p_metadata" "jsonb" DEFAULT '{}'::jsonb
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE v_id uuid; v_type text;
BEGIN
  IF NOT (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin')
          OR has_role(auth.uid(), 'approver') OR has_role(auth.uid(), 'writer')) THEN
    RAISE EXCEPTION 'Not authorized to post to cowork chat';
  END IF;
  IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
    RAISE EXCEPTION 'content is required';
  END IF;
  v_type := CASE WHEN auth.role() = 'service_role' THEN 'agent' ELSE 'user' END;
  INSERT INTO cowork_messages (author_type, author_name, content, metadata, created_by)
  VALUES (v_type, COALESCE(NULLIF(trim(p_author_name),''),'FlowPilot'), p_content,
          COALESCE(p_metadata,'{}'::jsonb), auth.uid())
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'message_id', v_id);
END $$;
ALTER FUNCTION "public"."post_to_cowork_chat"("text","text","jsonb") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."post_to_cowork_chat"("text","text","jsonb") TO "anon", "authenticated", "service_role";
