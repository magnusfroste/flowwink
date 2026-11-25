import { describe, expect, it } from 'vitest';
import { daysBehind, migrationHeadTime } from '@/lib/fleet-behind';

describe('which instances run old code', () => {
  const now = new Date('2026-11-25T20:00:00Z');
  const seen = '2026-11-25T02:00:00Z';
  it('reads a schema head as a time', () => {
    expect(migrationHeadTime('20261110120000')).toBe(Date.UTC(2026, 10, 10, 12, 0, 0));
    expect(migrationHeadTime('nope')).toBeNull();
    expect(migrationHeadTime(null)).toBeNull();
  });
  it('flags an instance more than two days behind the newest active one (synclair, 2026-11-25)', () => {
    const rows = [
      { instance_id: 'www', migration_head: '20261125010000', last_seen_at: seen },
      { instance_id: 'synclair', migration_head: '20261110120000', last_seen_at: seen },
      { instance_id: 'liteit', migration_head: '20261124100000', last_seen_at: seen },
    ];
    const b = daysBehind(rows, now);
    expect(b.get('synclair')).toBe(14);
    expect(b.has('liteit')).toBe(false);
    expect(b.has('www')).toBe(false);
  });
  it('an instance not seen this week does not set the bar', () => {
    const rows = [
      { instance_id: 'gone', migration_head: '20261201000000', last_seen_at: '2026-11-01T00:00:00Z' },
      { instance_id: 'a', migration_head: '20261124000000', last_seen_at: seen },
    ];
    expect(daysBehind(rows, now).size).toBe(0);
  });
});
