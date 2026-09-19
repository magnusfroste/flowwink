-- Utskicket väntar på en människa.
--
-- execute_newsletter_send har alltid SAGT "Requires approval … NEVER call without
-- explicit admin approval", men föddes med trust_level 'notify' (seedens default),
-- så en agent mejlade hela listan utan människa emellan (processbatteriet
-- 2026-09-19, content-to-conversion). Ett utskick till alla prenumeranter går
-- inte att ta tillbaka.
--
-- Seeden bär nu 'approve', men bootstrap skriver bara trust_level vid INSERT —
-- befintliga instanser behåller sin rad. Därför lyfts den här: ENDAST från
-- födelsevärdet 'notify'. En operatör som medvetet vridit ratten till 'auto'
-- har gjort ett val, och det står kvar (dials, not gates).
--
-- Admin-UI:ts "Send" anropar edge-funktionen direkt; klicket ÄR godkännandet.
-- Idempotent: andra körningen hittar ingen 'notify'-rad.
UPDATE public.agent_skills
   SET trust_level = 'approve'
 WHERE name = 'execute_newsletter_send' AND trust_level = 'notify';
