-- Mötesomröstningen följer bokningen (2026-11-08).
--
-- Meeting Polls' desk is a tab under Bookings, and its route
-- (/admin/bookings/polls) now carries its own module in the sidebar, so the
-- route gate and the sidebar ask for `meetingPolls`. Before, the tab rode on
-- the bookings grant: a sales user reached it through Bookings without any
-- grant for the module that owns it. Without this, the same user would lose
-- the desk the moment the module is switched on.
--
-- The rule: a role that may use Bookings may use the meeting polls of
-- Bookings. Defaults gain (sales, meetingPolls); the live table gains
-- meetingPolls for every role that holds bookings there today. Insert-if-
-- absent everywhere — an operator's grants survive, and a role without
-- bookings gains nothing. The module itself stays off until someone switches
-- it on: this is who may use it, not whether it runs.
INSERT INTO public.role_module_access_defaults (role, module_id)
SELECT d.role, 'meetingPolls'
  FROM public.role_module_access_defaults d
 WHERE d.module_id = 'bookings'
   AND NOT EXISTS (SELECT 1 FROM public.role_module_access_defaults x
                    WHERE x.role = d.role AND x.module_id = 'meetingPolls');

INSERT INTO public.role_module_access (role, module_id)
SELECT a.role, 'meetingPolls'
  FROM public.role_module_access a
 WHERE a.module_id = 'bookings'
   AND NOT EXISTS (SELECT 1 FROM public.role_module_access x
                    WHERE x.role = a.role AND x.module_id = 'meetingPolls');
