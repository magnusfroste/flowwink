-- Kontorsfilerna läses.
--
-- Extraktionssvepet läste bara PDF. Word-, PowerPoint- och Excelfiler märktes
-- 'unsupported' — arkiverade men olästa: varken sökningen, FlowPilot eller
-- workspace-chatten kunde använda dem. På optic gällde det Hermes roadmap-deck
-- och tre budgetarbetsböcker (2026-09-18). Sedan 2026-10-19 läser utdragaren
-- Office Open XML (docx, pptx, xlsx) direkt ur filens XML.
--
-- Den här migrationen köar om de som redan står som 'unsupported': bara
-- docx/pptx/xlsx (efter typ eller filnamn), och bara med en fil att läsa.
-- Gamla binärformat (.doc/.ppt/.xls) och allt annat lämnas orört.
--
-- Idempotent: efter svepet står raderna som 'success' eller 'failed'; en
-- omkörning hittar inga 'unsupported' kontorsfiler kvar.

UPDATE public.documents
   SET extraction_status = 'pending',
       extraction_error = NULL
 WHERE extraction_status = 'unsupported'
   AND file_url IS NOT NULL
   AND (
         file_type ~* '(wordprocessingml\.document|presentationml\.presentation|spreadsheetml\.sheet)'
      OR file_name ~* '\.(docx|pptx|xlsx)$'
       );
