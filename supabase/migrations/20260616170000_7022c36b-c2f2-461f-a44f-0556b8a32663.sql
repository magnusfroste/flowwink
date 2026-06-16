-- Contact Center — Fas 0 foundation: omnichannel dimension on the existing conversation hub,
-- a voicemail store, and the routing function that the chat handoff has been POSTing to a
-- non-existent `support-router` function (404) since it was written.
--
-- This is additive and idempotent. It does NOT enable any module — it only lays the schema +
-- routing contract that the (already-merged) Unified Inbox UI is hardcoded against:
--   chat_conversations.channel / .channel_thread_id / .contact_phone / .contact_id
--   support_agents.supported_channels
--   voicemail_messages (VoicemailPanel does select('*'))
--   route_conversation_to_agent() — presence-aware assignment, queue, or escalation fallback.
-- Callbacks ride on the existing bookings table (metadata.kind='callback'), so no new table here.

-- ── 1. Omnichannel dimension on conversations ────────────────────────────────
ALTER TABLE "public"."chat_conversations"
  ADD COLUMN IF NOT EXISTS "channel" "text" NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS "channel_thread_id" "text",
  ADD COLUMN IF NOT EXISTS "contact_phone" "text",
  ADD COLUMN IF NOT EXISTS "contact_id" "uuid";

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'chat_conversations_contact_id_fkey'
                   AND table_name = 'chat_conversations') THEN
    ALTER TABLE "public"."chat_conversations" ADD CONSTRAINT "chat_conversations_contact_id_fkey"
      FOREIGN KEY ("contact_id") REFERENCES "public"."leads"("id") ON DELETE SET NULL;
  END IF;
END $$;

-- Upsert key for channel adapters: one open thread per (channel, external thread id).
CREATE INDEX IF NOT EXISTS "chat_conversations_channel_thread_idx"
  ON "public"."chat_conversations" ("channel", "channel_thread_id")
  WHERE "channel_thread_id" IS NOT NULL;

-- ── 2. Per-channel agent competence ──────────────────────────────────────────
ALTER TABLE "public"."support_agents"
  ADD COLUMN IF NOT EXISTS "supported_channels" "text"[] NOT NULL DEFAULT '{web}'::text[];

-- ── 3. Voicemail store (transcription + FlowPilot analysis land here in Fas 2) ─
CREATE TABLE IF NOT EXISTS "public"."voicemail_messages" (
  "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
  "conversation_id" "uuid",
  "contact_phone" "text",
  "audio_url" "text",
  "duration_seconds" integer,
  "transcript_text" "text",
  "transcript_status" "text" NOT NULL DEFAULT 'pending',
  "intent" "text",
  "sentiment" "text",
  "summary" "text",
  "callback_requested" boolean NOT NULL DEFAULT false,
  "ai_model_used" "text",
  "transcribed_at" timestamp with time zone,
  "analyzed_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT "now"(),
  CONSTRAINT "voicemail_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "voicemail_messages_transcript_status_check"
    CHECK (("transcript_status" = ANY (ARRAY['pending'::text, 'success'::text, 'failed'::text])))
);

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                 WHERE constraint_name = 'voicemail_messages_conversation_id_fkey'
                   AND table_name = 'voicemail_messages') THEN
    ALTER TABLE "public"."voicemail_messages" ADD CONSTRAINT "voicemail_messages_conversation_id_fkey"
      FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "voicemail_messages_created_idx"
  ON "public"."voicemail_messages" ("created_at" DESC);

ALTER TABLE "public"."voicemail_messages" OWNER TO "postgres";
ALTER TABLE "public"."voicemail_messages" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'voicemail_messages' AND policyname = 'voicemail_service_all') THEN
    CREATE POLICY "voicemail_service_all" ON "public"."voicemail_messages"
      FOR ALL TO "service_role" USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE tablename = 'voicemail_messages' AND policyname = 'voicemail_admin_read') THEN
    CREATE POLICY "voicemail_admin_read" ON "public"."voicemail_messages"
      FOR SELECT TO "authenticated" USING (true);
  END IF;
END $$;

-- ── 4. The router: presence-aware assignment → queue → escalation fallback ────
-- Single source of truth for "get this conversation to a human". Both the chat handoff
-- (via the support-router edge function) and future channel adapters call this — no
-- channel-specific routing branches (Law 1). Channel is read from the conversation row.
CREATE OR REPLACE FUNCTION "public"."route_conversation_to_agent"(
  "p_conversation_id" "uuid",
  "p_reason" "text" DEFAULT NULL,
  "p_urgency" "text" DEFAULT 'normal'
) RETURNS "jsonb"
LANGUAGE "plpgsql" SECURITY DEFINER SET "search_path" TO 'public' AS $$
DECLARE
  v_channel text;
  v_urgency text := CASE WHEN p_urgency IN ('low','normal','high','urgent') THEN p_urgency ELSE 'normal' END;
  v_agent uuid;
  v_existing uuid;
  v_status text;
BEGIN
  SELECT COALESCE(channel, 'web'), assigned_agent_id, conversation_status
    INTO v_channel, v_existing, v_status
  FROM chat_conversations WHERE id = p_conversation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('action', 'error', 'message', 'Conversation not found');
  END IF;

  -- Idempotent: already handed to an agent → don't re-assign or double-count
  -- (the chat handoff tool can fire more than once in a single ReAct loop).
  IF v_status = 'with_agent' AND v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'action', 'handoff_to_agent', 'agent_id', v_existing, 'status', 'with_agent',
      'message', 'Already connected to an agent.');
  END IF;

  -- Least-loaded online/away agent with free capacity that handles this channel.
  SELECT id INTO v_agent
  FROM support_agents
  WHERE status IN ('online', 'away')
    AND current_conversations < max_conversations
    AND supported_channels @> ARRAY[v_channel]
  ORDER BY current_conversations ASC, last_seen_at DESC
  LIMIT 1;

  IF v_agent IS NOT NULL THEN
    UPDATE chat_conversations SET
      assigned_agent_id = v_agent,
      conversation_status = 'with_agent',
      priority = v_urgency,
      escalation_reason = p_reason,
      escalated_at = now(),
      updated_at = now()
    WHERE id = p_conversation_id;

    UPDATE support_agents SET current_conversations = current_conversations + 1, updated_at = now()
    WHERE id = v_agent;

    RETURN jsonb_build_object(
      'action', 'handoff_to_agent', 'agent_id', v_agent, 'status', 'with_agent',
      'message', 'Connected you to an available agent.');
  END IF;

  -- No agent free: queue the conversation and record an escalation for follow-up.
  UPDATE chat_conversations SET
    conversation_status = 'waiting_agent',
    assigned_agent_id = NULL,
    priority = v_urgency,
    escalation_reason = p_reason,
    escalated_at = now(),
    updated_at = now()
  WHERE id = p_conversation_id;

  INSERT INTO support_escalations (conversation_id, reason, priority)
  VALUES (p_conversation_id, COALESCE(p_reason, 'Human handoff requested'), v_urgency);

  RETURN jsonb_build_object(
    'action', 'create_escalation', 'status', 'waiting_agent',
    'message', 'No agent is available right now — your request is queued and the team will follow up.');
END $$;
ALTER FUNCTION "public"."route_conversation_to_agent"("uuid", "text", "text") OWNER TO "postgres";
GRANT ALL ON FUNCTION "public"."route_conversation_to_agent"("uuid", "text", "text")
  TO "anon", "authenticated", "service_role";
