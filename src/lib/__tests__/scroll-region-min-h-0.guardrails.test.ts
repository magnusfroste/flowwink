/**
 * Ett scrollområde i en flexkolumn måste få krympa.
 *
 * Fyndet (Magnus 2026-08-29, /admin/chat?tab=sessions): "det ser ut som om jag
 * inte kan scrolla ned till det sista chatmeddelandet". Dialogen är
 * `max-h-[80vh] flex flex-col` och transkriptet `<ScrollArea className="flex-1">`
 * — men ett flexbarn har `min-height: auto`, alltså en innehållsbaserad
 * minimihöjd. Barnet växer med texten i stället för att bli scrollbart, och
 * dialogens maxhöjd klipper resten. Det sista meddelandet finns, men går inte
 * att nå.
 *
 * `min-h-0` upphäver den minimihöjden. Där ingen krympning behövs är den en
 * no-op, vilket är varför regeln kan gälla utan undantag: ett flex-1-
 * scrollområde ska ALLTID kunna krympa under sitt innehåll — det är hela
 * poängen med att det scrollar.
 *
 * Huset kunde redan mönstret (ChatConversation bär till och med en kommentar om
 * det); tio ytor hade bara missat det.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

describe('flex-1 på ett scrollområde följs alltid av min-h-0', () => {
  const files = execSync(
    "grep -rl 'ScrollArea className=\"flex-1' src/components src/pages || true",
    { encoding: 'utf-8' },
  ).split('\n').filter(Boolean);

  it('svepet hittar faktiskt filer — annars mäter grinden ingenting', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const f of files) {
    it(`${f}`, () => {
      const src = readFileSync(f, 'utf-8');
      const offenders = src
        .split('\n')
        .filter((l) => l.includes('ScrollArea className="flex-1') && !l.includes('min-h-0'));
      expect(offenders).toEqual([]);
    });
  }
});
