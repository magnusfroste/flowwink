-- KB-svaret har EN skrivare: answer_json följer answer_text
--
-- Magnus (2026-09-02, labs1100): "seedade KBs syns inte i right side panel
-- - men om jag gör edit först sen syns de när jag sparat". Panelen (och den
-- publika KB-sidan) renderar answer_json; demoseeden seed_demo_kb, äldre
-- importer och en del agentskrivningar skriver bara answer_text. Redigeraren
-- skriver answer_json vid spara — därav "syns efter edit". Två kolumner, en
-- sanning: texten. Här får databasen själv härleda dokumentet när det
-- saknas, så att ingen skrivare kan lämna en artikel blank igen.
--
-- Dokumentet är samma minimala Tiptap-form som agent-execute:s
-- tplDocFromText bygger: stycken delade på tomrad, radbrytningar inom ett
-- stycke som hardBreak. Ett redan satt answer_json rörs aldrig.

CREATE OR REPLACE FUNCTION public.kb_doc_from_text(p_text text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'type', 'doc',
    'content', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'type', 'paragraph',
            'content', (
              SELECT jsonb_agg(node ORDER BY ord)
              FROM (
                SELECT ord * 2 AS ord, jsonb_build_object('type', 'text', 'text', line) AS node
                FROM unnest(string_to_array(para, E'\n')) WITH ORDINALITY AS l(line, ord)
                WHERE btrim(line) <> ''
                UNION ALL
                SELECT ord * 2 + 1, jsonb_build_object('type', 'hardBreak')
                FROM unnest(string_to_array(para, E'\n')) WITH ORDINALITY AS l(line, ord)
                WHERE btrim(line) <> ''
                  AND ord < array_length(string_to_array(para, E'\n'), 1)
              ) nodes
            )
          )
          ORDER BY pord
        )
        FROM unnest(regexp_split_to_array(COALESCE(p_text, ''), E'\n[[:space:]]*\n')) WITH ORDINALITY AS p(para, pord)
        WHERE btrim(para) <> ''
      ),
      '[]'::jsonb
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.kb_articles_fill_answer_json()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (NEW.answer_json IS NULL
      OR NEW.answer_json = '{}'::jsonb
      OR COALESCE(jsonb_array_length(NEW.answer_json -> 'content'), 0) = 0)
     AND COALESCE(btrim(NEW.answer_text), '') <> '' THEN
    NEW.answer_json := public.kb_doc_from_text(NEW.answer_text);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_kb_articles_fill_answer_json ON public.kb_articles;
CREATE TRIGGER trg_kb_articles_fill_answer_json
  BEFORE INSERT OR UPDATE OF answer_text, answer_json ON public.kb_articles
  FOR EACH ROW EXECUTE FUNCTION public.kb_articles_fill_answer_json();

-- Backfill: artiklarna som redan står blanka i panelen.
UPDATE public.kb_articles
   SET answer_json = public.kb_doc_from_text(answer_text)
 WHERE COALESCE(btrim(answer_text), '') <> ''
   AND (answer_json IS NULL
        OR answer_json = '{}'::jsonb
        OR COALESCE(jsonb_array_length(answer_json -> 'content'), 0) = 0);
