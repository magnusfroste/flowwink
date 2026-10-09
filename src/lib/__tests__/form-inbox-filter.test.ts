import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { filterInbox, isHandled } from '../form-inbox-filter';

const rows = [
  { id: 'a', form_name: 'Demo', data: { Name: 'Ada' }, lead_id: 'L1', handled_at: null },
  { id: 'b', form_name: 'Demo', data: { Name: 'Bo' }, lead_id: null, handled_at: null },
  { id: 'c', form_name: 'Contact', data: { Name: 'Cy' }, lead_id: null, handled_at: '2026-10-01T00:00:00Z' },
];
const ids = (r: typeof rows) => r.map((x) => x.id);

describe('the form inbox filter', () => {
  it('All forms + All shows every submission; the handled filter applies without picking a form', () => {
    expect(ids(filterInbox(rows, { formName: 'all', handled: 'all', search: '' }))).toEqual(['a', 'b', 'c']);
    expect(ids(filterInbox(rows, { formName: 'all', handled: 'unhandled', search: '' }))).toEqual(['b']);
    expect(ids(filterInbox(rows, { formName: 'all', handled: 'handled', search: '' }))).toEqual(['a', 'c']);
  });

  it('form, handled and search compose', () => {
    expect(ids(filterInbox(rows, { formName: 'Demo', handled: 'all', search: '' }))).toEqual(['a', 'b']);
    expect(ids(filterInbox(rows, { formName: 'Demo', handled: 'handled', search: '' }))).toEqual(['a']);
    expect(ids(filterInbox(rows, { formName: 'all', handled: 'all', search: 'cy' }))).toEqual(['c']);
    expect(isHandled({ lead_id: null, handled_at: null })).toBe(false);
  });

  it('the page recomputes on every filter — the handled filter is in the memo dependencies', () => {
    // synclair 2026-10-09: the memo left filterHandled out, so "All" changed nothing
    // until a specific form was picked.
    const page = readFileSync(join(__dirname, '../../pages/admin/FormSubmissionsPage.tsx'), 'utf8');
    const memo = page.slice(page.indexOf('const filteredSubmissions = useMemo('));
    const deps = memo.match(/\[([^\]]*)\],?\s*\);/)?.[1] ?? '';
    for (const dep of ['submissions', 'filterFormName', 'filterHandled', 'searchQuery']) expect(deps).toContain(dep);
  });
});
