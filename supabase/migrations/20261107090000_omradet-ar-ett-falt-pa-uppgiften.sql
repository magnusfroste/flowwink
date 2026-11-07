-- Området är ett fält på uppgiften.
--
-- Peters backlogg (optic, 2026-11-05): projektvyn ska gruppera uppgifterna i
-- expanderbara områdessektioner — en nivå, härledd, inget underhåll, ingen
-- epic-post att skapa. Österrunda 1.0 bär redan konventionen i titlarna:
-- "Entreprenad – Besiktning", "DDC 1.0 – Kyla och brandskydd", "Stokab – …".
--
-- Så: ett fritextfält `area` på project_tasks. Satt är det sanningen; tomt
-- läser vyn och skillen prefixet före " – " i titeln (src/lib/task-area.ts
-- är den enda läsaren av regeln). Inget skrivs tillbaka vid härledning —
-- "grupperingen är alltid härledd och kräver inget underhåll". Uppgifter
-- utan område hamnar under "Other"; en deluppgift följer sin förälder.
--
-- manage_project_task bär `area` som parameter (db:-handlern skriver den
-- rakt in) och `list` svarar med kolumnen som den är.

ALTER TABLE public.project_tasks ADD COLUMN IF NOT EXISTS area text;

COMMENT ON COLUMN public.project_tasks.area IS
  'The task''s area (one level of grouping in the project view). Set, it is the truth; empty, the view and the skill read the title''s prefix before " – " as the area. Never a required field, never written back from the title.';
