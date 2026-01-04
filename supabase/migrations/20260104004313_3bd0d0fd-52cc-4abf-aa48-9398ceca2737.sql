-- Fix existing KB articles that have ContentBlock array format instead of Tiptap document
UPDATE kb_articles 
SET answer_json = (answer_json->0->'data'->'content')
WHERE answer_json IS NOT NULL 
  AND jsonb_typeof(answer_json) = 'array'
  AND jsonb_array_length(answer_json) > 0
  AND answer_json->0->'data'->'content' IS NOT NULL;