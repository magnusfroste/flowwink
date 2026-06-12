-- Maintenance module smoke. Self-cleaning (rolled-back tx). Expect: all PASS.
\set QUIET on
\pset pager off
BEGIN;
SELECT set_config('request.jwt.claims','{"role":"service_role"}', false);
SELECT (manage_equipment('create',null,'SMOKE-M Press','SN-1','machine','Hall A')->>'equipment_id') AS eq \gset
SELECT CASE WHEN :'eq' IS NOT NULL THEN 'PASS M.1 equipment created' ELSE 'FAIL M.1' END;
SELECT (manage_maintenance_request('create',null,:'eq','Broken belt',null,'corrective','critical')->>'request_id') AS rq \gset
SELECT CASE WHEN status='under_maintenance' THEN 'PASS M.2 critical → under_maintenance' ELSE 'FAIL M.2' END FROM equipment WHERE id=:'eq';
SELECT (manage_maintenance_request('update',:'rq',null,null,null,null,null,'done')->>'success');
SELECT CASE WHEN status='operational' THEN 'PASS M.3 done → operational' ELSE 'FAIL M.3' END FROM equipment WHERE id=:'eq';
INSERT INTO maintenance_schedules (equipment_id,title,interval_days,next_due,instructions) VALUES (:'eq','Oil change',30,CURRENT_DATE,'5W30');
SELECT CASE WHEN (run_preventive_maintenance()->>'created')::int = 1 THEN 'PASS M.4 preventive created' ELSE 'FAIL M.4' END;
SELECT CASE WHEN next_due = CURRENT_DATE + 30 THEN 'PASS M.5 next_due rolled' ELSE 'FAIL M.5' END FROM maintenance_schedules WHERE title='Oil change';
SELECT CASE WHEN (run_preventive_maintenance()->>'created')::int = 0 THEN 'PASS M.6 sweep idempotent' ELSE 'FAIL M.6' END;
ROLLBACK;
SELECT 'SMOKE maintenance done (rolled back)';
