-- =============================================================================
-- Agent Document Upload — Skill for federated peers (e.g. Jan Bergman MCP)
-- =============================================================================
-- Pattern: mem://architecture/document-shadow-markdown-pattern
--          mem://federation/directional-connections-model
-- =============================================================================

-- 1) SECURITY DEFINER: create an agent-uploaded document
CREATE OR REPLACE FUNCTION public.create_agent_document(
  p_uploaded_by uuid,
  p_peer_name text,
  p_title text,
  p_file_name text,
  p_file_url text DEFAULT NULL,
  p_file_type text DEFAULT NULL,
  p_file_size_bytes bigint DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_category text DEFAULT 'agent-upload',
  p_tags text[] DEFAULT '{}'::text[],
  p_content_md text DEFAULT NULL,
  p_extraction_status text DEFAULT 'pending',
  p_extraction_error text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_source text;
  v_peer text := COALESCE(NULLIF(trim(p_peer_name), ''), 'unknown');
BEGIN
  IF p_uploaded_by IS NULL THEN
    RAISE EXCEPTION 'uploaded_by required';
  END IF;

  IF NOT (
    public.has_role(p_uploaded_by, 'admin'::app_role)
    OR public.has_role(p_uploaded_by, 'employee'::app_role)
    OR public.has_role(p_uploaded_by, 'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'caller user lacks role for agent upload';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'title required';
  END IF;
  IF p_file_name IS NULL OR length(trim(p_file_name)) = 0 THEN
    RAISE EXCEPTION 'file_name required';
  END IF;

  IF p_extraction_status NOT IN ('pending', 'success', 'failed', 'unsupported', 'not_applicable') THEN
    RAISE EXCEPTION 'invalid extraction_status: %', p_extraction_status;
  END IF;

  v_peer := lower(regexp_replace(v_peer, '[^a-z0-9_-]+', '-', 'gi'));
  v_source := 'agent-upload:' || v_peer;

  INSERT INTO public.documents (
    title, file_name, file_url, file_type, file_size_bytes,
    description, category, tags,
    uploaded_by, source,
    content_md, extraction_status, extraction_error,
    content_extracted_at
  )
  VALUES (
    p_title, p_file_name, COALESCE(p_file_url, ''), p_file_type, p_file_size_bytes,
    p_description, COALESCE(p_category, 'agent-upload'), COALESCE(p_tags, '{}'::text[]),
    p_uploaded_by, v_source,
    p_content_md, p_extraction_status, p_extraction_error,
    CASE WHEN p_extraction_status = 'success' THEN now() ELSE NULL END
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_agent_document(uuid, text, text, text, text, text, bigint, text, text, text[], text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_agent_document(uuid, text, text, text, text, text, bigint, text, text, text[], text, text, text) TO service_role;

-- 2) Register the upload_document skill (MCP-exposed)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.agent_skills WHERE name = 'upload_document') THEN
    INSERT INTO public.agent_skills (
      name, description, handler, category, scope,
      trust_level, enabled, mcp_exposed,
      instructions, tool_definition
    )
    VALUES (
      'upload_document',
      'Upload a file to the workspace knowledge base. Stores a permanent, searchable document with extracted markdown so future workspace-chat queries can cite it. Use when: the agent has produced or received a file (PDF/text/markdown/notes/report) that should be archived and made searchable for humans and future agent sessions. NOT for: temporary scratch text used only inside the current conversation (use chat memory instead) or for binary blobs you want to share without making them searchable.',
      'internal:upload_document',
      'content'::agent_skill_category,
      'internal'::agent_scope,
      'auto'::skill_trust_level,
      true,
      true,
      E'# upload_document\n\nPersist a file as a searchable document in the workspace.\n\n## Two input modes\n\n### Mode A — already extracted text (preferred)\nProvide `content_text` (string, markdown or plain text). The text is stored directly in `content_md` and becomes searchable immediately. No binary upload needed.\n\nExample: { "title": "Q1 retrospective", "content_text": "# Retrospective\\n\\n…" }\n\n### Mode B — binary file\nProvide `content_base64` + `mime_type` + `file_name`. The binary is stored and (where possible) parsed to markdown server-side. If the type is not parseable, the document is saved with status `unsupported` — still useful as an archive entry, but not full-text searchable until someone re-extracts it.\n\nExample: { "title": "Customer brief", "file_name": "brief.pdf", "mime_type": "application/pdf", "content_base64": "JVBERi0…" }\n\n## Returned\n{ document_id, source, extraction_status, searchable }\n- `searchable=true` means workspace-chat will find this in future queries.\n- `source` is `agent-upload:<your-peer-name>` so admins can trace origin.\n\n## Limits\n- `content_text` ≤ 500 000 chars\n- `content_base64` ≤ 10 MB raw (≈ 13.4 MB base64)\n- `title` required; `file_name` required for binary mode (auto-generated from title for text mode)',
      jsonb_build_object(
        'type', 'function',
        'function', jsonb_build_object(
          'name', 'upload_document',
          'description', 'Upload a file or text to the workspace knowledge base. Returns a document_id; the content is searchable in workspace chat immediately if extraction succeeds.',
          'parameters', jsonb_build_object(
            'type', 'object',
            'properties', jsonb_build_object(
              'title', jsonb_build_object('type', 'string', 'description', 'Human-readable title for the document.'),
              'file_name', jsonb_build_object('type', 'string', 'description', 'File name including extension (e.g. "brief.pdf"). Required for binary mode; auto-generated from title for text mode if omitted.'),
              'description', jsonb_build_object('type', 'string', 'description', 'Optional short description / summary.'),
              'category', jsonb_build_object('type', 'string', 'description', 'Optional category tag (defaults to "agent-upload").'),
              'tags', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'), 'description', 'Optional tags.'),
              'content_text', jsonb_build_object('type', 'string', 'description', 'Markdown or plain text. Use this when you already have the textual content. Mutually exclusive with content_base64.'),
              'content_base64', jsonb_build_object('type', 'string', 'description', 'Base64-encoded binary file. Use with mime_type. Mutually exclusive with content_text.'),
              'mime_type', jsonb_build_object('type', 'string', 'description', 'IANA mime type for binary mode (e.g. application/pdf, text/plain).')
            ),
            'required', jsonb_build_array('title')
          )
        )
      )
    );
  END IF;
END $$;