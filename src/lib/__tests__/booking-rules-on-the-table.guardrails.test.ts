import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Book-to-meet, process battery 2026-09-19. Opening hours, blocked days and the
 * past were honoured by the QUESTION (check_availability) and not by the WRITE:
 * 03:00, a blocked day and the year 2020 were all bookable; the overlap test had
 * no lock; the legacy skill and the public block inserted past every check; any
 * status could be written over any other; and availability compared zone-less
 * opening hours with UTC minutes. The rule now lives on the table.
 */

const root = join(__dirname, '../../..');
const migrations = readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()
  .map((f) => readFileSync(join(root, 'supabase/migrations', f), 'utf8')).join('\n');
const agentExecute = readFileSync(join(root, 'supabase/functions/agent-execute/index.ts'), 'utf8');
const block = readFileSync(join(root, 'src/components/public/blocks/SmartBookingBlock.tsx'), 'utf8');

function latestFunctionBody(fnName: string): string {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fnName}\\(`, 'g');
  let start = -1; let m: RegExpExecArray | null;
  while ((m = re.exec(migrations))) start = m.index;
  expect(start, `no migration defines ${fnName}`).toBeGreaterThan(-1);
  return migrations.slice(start, migrations.indexOf('$fn$;', start));
}

describe('the booking rules are on the table', () => {
  const rules = latestFunctionBody('booking_rules');

  it('every writer passes the trigger, on insert and on update', () => {
    expect(migrations).toMatch(/CREATE TRIGGER booking_rules_trg\s+BEFORE INSERT OR UPDATE ON public\.bookings/);
  });

  it('the overlap test runs under a lock, and staff cannot override it', () => {
    const lock = rules.indexOf('pg_advisory_xact_lock(');
    const overlap = rules.indexOf('overlaps an existing booking');
    expect(lock).toBeGreaterThan(-1);
    expect(overlap).toBeGreaterThan(lock);
    // the overlap block is the one rule with no `NOT v_staff` in front of it
    const overlapBlock = rules.slice(rules.lastIndexOf('IF EXISTS (', overlap), overlap);
    expect(overlapBlock).not.toMatch(/v_staff/);
  });

  it('hours, blocked days and the past are read in the platform timezone', () => {
    expect(rules).toMatch(/v_tz := public\.platform_timezone\(\);/);
    expect(rules).toMatch(/NEW\.start_time AT TIME ZONE v_tz/);
    expect(rules).toMatch(/is in the past/);
    expect(rules).toMatch(/is blocked/);
    expect(rules).toMatch(/is outside opening hours/);
    expect(latestFunctionBody('platform_timezone')).toMatch(/default_timezone/); // the key the client reads
  });

  it('cancelled, completed and no_show are terminal', () => {
    expect(rules).toMatch(/OLD\.status = 'pending'\s+AND NEW\.status IN/);
    expect(rules).toMatch(/OLD\.status = 'confirmed' AND NEW\.status IN/);
    expect(rules).not.toMatch(/OLD\.status = 'cancelled'/);
    expect(rules).not.toMatch(/OLD\.status = 'completed'/);
  });
});

describe('the writers go through it', () => {
  it('the public block books through request_booking — no direct insert, no read-back as anon', () => {
    expect(block).toMatch(/rpcCall\('request_booking', \{/);
    expect(block).not.toMatch(/from\('bookings'\)\.insert\(/);
    expect(block).not.toMatch(/awaiting_payment'\s*:/); // the status the table never allowed
  });

  it('a visitor chooses service, time and contact details — never status or staff', () => {
    const rpc = latestFunctionBody('request_booking');
    expect(rpc).toMatch(/'pending',/);
    expect(rpc).not.toMatch(/p_status|p_assigned/);
    expect(migrations).toMatch(/GRANT EXECUTE ON FUNCTION public\.request_booking\([^)]*\) TO anon, authenticated, service_role;/);
  });

  it('availability is computed in the platform timezone and for the same service the trigger checks', () => {
    const i = agentExecute.indexOf("if (skillName === 'check_availability') {");
    const b = agentExecute.slice(i, i + 4200);
    expect(b).toMatch(/const tz = await platformTimezone\(supabase\);/);
    expect(b).toMatch(/zonedParts\(new Date\(b\.start_time\), tz\)/);
    expect(b).not.toMatch(/getUTCHours\(\)/);
  });

  it('set_hours replaces, and the legacy skill reads wall-clock time in the platform timezone', () => {
    expect(agentExecute).toMatch(/rpc\('set_booking_hours', \{/);
    expect(latestFunctionBody('set_booking_hours')).toMatch(/DELETE FROM booking_availability/);
    expect(agentExecute).toMatch(/zonedTimeToUtc\(String\(date\), String\(time\), await platformTimezone\(supabase\)\)/);
  });
});
