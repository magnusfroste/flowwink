-- For KB articles where answer_json is null/empty but answer_text exists,
-- convert the plain text to a basic Tiptap document structure
UPDATE kb_articles 
SET answer_json = jsonb_build_object(
  'type', 'doc',
  'content', jsonb_build_array(
    jsonb_build_object(
      'type', 'paragraph',
      'content', jsonb_build_array(
        jsonb_build_object(
          'type', 'text',
          'text', answer_text
        )
      )
    )
  )
)
WHERE (answer_json IS NULL OR answer_json = '[]'::jsonb OR answer_json = 'null'::jsonb)
  AND answer_text IS NOT NULL 
  AND answer_text != '';