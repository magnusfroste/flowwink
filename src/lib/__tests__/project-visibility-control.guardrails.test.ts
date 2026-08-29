/**
 * Exakt en synlighetsväljare per dialog — och båda dialogerna har en.
 *
 * Fyndet (Magnus 2026-08-30): "när jag skapar ett nytt projekt så har jag två
 * visibility-val — tror en är dubblett". Det var den. Och samma klipp-och-
 * klistra hade motsatt utfall i redigeringsdialogen, som LÄSTE och SPARADE
 * visibility utan att ha någon kontroll: ett projekt kunde alltså aldrig göras
 * privat i efterhand. Två gånger i den ena, noll i den andra.
 *
 * Grinden räknar, för det är räkningen ögat missar i en lång formulärfil.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'src/pages/admin/ProjectsPage.tsx'), 'utf-8');

const dialogBody = (name: string) => {
  const start = src.indexOf(`function ${name}`);
  expect(start).toBeGreaterThan(-1);
  const next = src.indexOf('\nfunction ', start + 1);
  return src.slice(start, next === -1 ? undefined : next);
};

describe('en väljare per dialog', () => {
  for (const dialog of ['NewProjectDialog', 'EditProjectDialog']) {
    it(`${dialog} har exakt en`, () => {
      const body = dialogBody(dialog);
      const count = (body.match(/<Label>Visibility<\/Label>/g) ?? []).length;
      expect(count).toBe(1);
    });
  }

  it('och båda skriver till samma fält', () => {
    for (const dialog of ['NewProjectDialog', 'EditProjectDialog']) {
      expect(dialogBody(dialog)).toMatch(/visibility: v as "shared" \| "private"/);
    }
  });
});
