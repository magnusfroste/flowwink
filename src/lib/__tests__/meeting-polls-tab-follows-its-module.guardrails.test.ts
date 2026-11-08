/**
 * Meeting Polls is its own module (off by default) whose desk is a tab under
 * Bookings. Until 2026-11-08 the tab rendered the full panel with the module
 * off: /poll/<token> answered 404, every poll skill was refused, and the
 * feature looked present yet failed — or was never found, since nothing in the
 * sidebar named it. The tab now says "switched off" with a door to Modules,
 * and the sidebar carries the desk under its own module, so the route gate
 * (moduleOffForRoute) and the sidebar agree with the tab.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { findNavMatch, moduleOffForRoute } from '@/lib/admin-route-access';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');

describe('the Meeting polls tab follows its module', () => {
  it('the bookings page gates the panel on the module, with the off state', () => {
    const page = read('src/pages/admin/BookingsPage.tsx');
    expect(page).toMatch(/pollsOff\s*=\s*!!modules && Object\.keys\(modules\)\.length > 0 && !modules\.meetingPolls\?\.enabled/);
    expect(page).toMatch(/\{pollsOff \? <MeetingPollsOff isAdmin=\{isAdmin\} \/> : <MeetingPollsPanel \/>\}/);
  });

  it('the off state names the module and opens it under Modules', () => {
    const off = read('src/components/admin/booking/MeetingPollsOff.tsx');
    expect(off).toContain('/admin/modules?module=meetingPolls');
  });

  it('the sidebar names the desk under its own module, so the route gate agrees', () => {
    expect(findNavMatch('/admin/bookings/polls')?.item.moduleId).toBe('meetingPolls');
    expect(findNavMatch('/admin/bookings')?.item.moduleId).toBe('bookings');
    expect(moduleOffForRoute('/admin/bookings/polls', { bookings: { enabled: true }, meetingPolls: { enabled: false } })).toBe('meetingPolls');
    expect(moduleOffForRoute('/admin/bookings/polls', { bookings: { enabled: true }, meetingPolls: { enabled: true } })).toBeNull();
    expect(moduleOffForRoute('/admin/bookings', { bookings: { enabled: true }, meetingPolls: { enabled: false } })).toBeNull();
  });
});
