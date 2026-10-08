-- Agentens PDF läggs i kön.
--
-- upload_document (MCP, binärläge) märkte varje PDF 'unsupported' — "No
-- server-side parser for mime_type=application/pdf" — medan samma PDF uppladdad
-- i admin blev 'pending' och lästes av extraktionssvepet (knowledge-indexer,
-- var 5:e minut) inom fem minuter. Svepet plockar bara 'pending', så agentens
-- PDF lästes aldrig: Hermes mall för produktspecifikation på optic (2026-10-07)
-- låg kvar som 0 tecken, osökbar.
--
-- Koden köar nu agentens PDF:er som 'pending' (en definition, isExtractablePdf,
-- som både uppladdningen och svepet läser). Den här migrationen köar om de som
-- redan fastnat: bara agentuppladdningar, bara PDF, bara med det gamla
-- felmeddelandet — inget som en människa eller extraktorn själv har bedömt.
--
-- Idempotent: en omkörning hittar inga rader med det gamla meddelandet.

UPDATE public.documents
   SET extraction_status = 'pending',
       extraction_error = NULL
 WHERE extraction_status = 'unsupported'
   AND source LIKE 'agent-upload%'
   AND (file_type ILIKE '%pdf%' OR file_name ILIKE '%.pdf')
   AND extraction_error LIKE 'No server-side parser for mime_type=%';
