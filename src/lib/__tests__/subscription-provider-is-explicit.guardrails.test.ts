// Ett abonnemang måste namnge sin provider.
//
// subscriptions.provider har DEFAULT 'stripe'. En skrivare som glömmer
// kolumnen föder ett avtalsabonnemang som är provider-backat, och
// generate_subscription_invoice vägrar det: "only applies to manual
// subscriptions". Abonnemanget blir TYST OFAKTURERBART — ingen felar, ingen
// larmar, pengarna kommer bara aldrig.
//
// Regressionskedjan gick rakt in i fällan första gången den kördes, och det var
// mitt eget test som skrev raden. Databasen har nu en trigger som vägrar
// kombinationen provider ≠ manual utan provider_subscription_id; den här
// grinden fångar samma sak en gång tidigare, medan någon skriver koden.
//
// Att flippa defaulten till 'manual' övervägdes och förkastades: då fakturerar
// VI något Stripe också fakturerar, och kunden dubbeldebiteras. Defaulten
// faller redan åt det mindre farliga hållet — problemet är att det
// inkonsekventa tillståndet går att skriva alls.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const SELF = 'src/lib/__tests__/subscription-provider-is-explicit.guardrails.test.ts';

/** Varje INSERT mot subscriptions, med sitt kolumnblock. */
function insertSites(): Array<{ file: string; line: number; names: boolean }> {
  const files = execSync(
    'grep -rlE "(INSERT INTO (public\\.)?subscriptions|from\\(.subscriptions.\\))" ' +
      '--include="*.ts" --include="*.tsx" --include="*.sql" src supabase || true',
    { maxBuffer: 64 * 1024 * 1024 },
  ).toString().trim().split('\n').filter(Boolean).filter((f) => f !== SELF);

  const out: Array<{ file: string; line: number; names: boolean }> = [];
  for (const file of files) {
    const lines = readFileSync(file, 'utf-8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const sqlInsert = /INSERT INTO (public\.)?subscriptions\b/i.test(lines[i]);
      const tsInsert =
        /\.from\(['"]subscriptions['"]\)/.test(lines[i]) &&
        /\.insert\(/.test(lines.slice(i, i + 3).join(' '));
      if (!sqlInsert && !tsInsert) continue;
      // Kolumnlistan sträcker sig över flera rader i båda formerna.
      const window = lines.slice(i, i + 30).join('\n');
      out.push({ file, line: i + 1, names: /\bprovider\b/.test(window) });
    }
  }
  return out;
}

describe('abonnemanget namnger sin provider', () => {
  it('varje INSERT mot subscriptions sätter provider uttryckligen', () => {
    const silent = insertSites().filter((s) => !s.names);
    expect(
      silent.map((s) => `${s.file}:${s.line}`),
      'Kolumnen defaultar till \'stripe\'. Utelämnas den föds ett avtalsabonnemang\n' +
        'provider-backat och blir TYST OFAKTURERBART — vår motor vägrar det och\n' +
        'Stripe vet inget om det. Sätt provider: \'manual\' för det vi fakturerar\n' +
        'själva, eller providerns namn OCH dess id för det providern fakturerar.',
    ).toEqual([]);
  });

  // Negativtest: en grind som inte känner igen formen är alltid grön.
  it('känner igen ett INSERT utan provider', () => {
    const sqlish = 'INSERT INTO subscriptions (customer_email, status)\nVALUES (\'a@b.c\', \'active\');';
    expect(/INSERT INTO (public\.)?subscriptions\b/i.test(sqlish.split('\n')[0])).toBe(true);
    expect(/\bprovider\b/.test(sqlish)).toBe(false);
  });

  it('godtar ett INSERT som sätter den', () => {
    const ok = "INSERT INTO subscriptions (customer_email, provider, status)\nVALUES ('a@b.c', 'manual', 'active');";
    expect(/\bprovider\b/.test(ok)).toBe(true);
  });
});
