/**
 * A lesson keeps the pattern, never the instance (Nordbrygg, Sep–Oct 2026):
 * the reflection wrote a miscopied task id into 30 daily lessons and the
 * heartbeat re-sent it from memory 129 times.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lessonText } from '../../../supabase/functions/_shared/pilot/lesson-text.ts';

describe('lessons carry no ids', () => {
  it('masks every uuid', () => {
    expect(lessonText('no task a498a636-8f75-4687-92f1-e5c14a3e218c — did you mean a498a636-8f75-4682-92f1-e5c14a3e218c?'))
      .toBe('no task <id> — did you mean <id>?');
  });
  it('both lesson writers go through it', () => {
    expect(readFileSync('supabase/functions/_shared/pilot/handlers.ts', 'utf8')).toMatch(/fails frequently: \$\{lessonText\(s\.last_error\)\}/);
    expect(readFileSync('supabase/functions/_shared/pilot/reason.ts', 'utf8')).toMatch(/latest: "\$\{lessonText\(errorMsg\)/);
  });
});
