// Skannern bakom förbudet mot svalda fel.
//
// supabase-js kastar inte. `const { data } = await supabase.from(...)` med ett
// fel ger `data: null` — vilket ser exakt ut som "inga rader". Det är därför 31
// obefintliga kolumnnamn kunde leva i selects i månader: varje anrop svarade
// artigt "inga träffar" i stället för "den kolumnen finns inte".
//
// En skrivning är värre än en läsning: där betyder samma tystnad "sparat" om
// ingenting sparades. Skrivningar är därför förbjudna att svälja — läsningar
// spärras på en baslinje som bara får krympa.
//
// Ett fel räknas som HANTERAT när det både bundits till ett namn OCH namnet
// används igen. Att destrukturera `error` och sedan aldrig läsa det är samma
// svalg, bara mer välklätt.

import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const DESTRUCTURE = /const \{([^}]*)\} *= *await /;
const WRITE_VERB = /\.(insert|update|upsert|delete)\(/;

// Grindens egna negativtest ÄR svalda skrivningar — det är hela poängen med
// dem. Utan det här undantaget rapporterar grinden sig själv. (Fjärde gången
// den klassen bet under sessionen 2026-08-30/31: spökkolumn-grinden,
// gallringsgrindens kommentar, dialogsvepets egen lista, och nu den här.)
const SELF = 'src/lib/__tests__/no-swallowed-errors.guardrails.test.ts';

export function listCandidateFiles(roots = ['src', 'supabase/functions']) {
  const cmd = `grep -rlE "const \\{[^}]*\\} *= *await " --include="*.ts" --include="*.tsx" ${roots.join(' ')}`;
  try {
    return execSync(cmd, { maxBuffer: 64 * 1024 * 1024 })
      .toString().trim().split('\n').filter(Boolean)
      .filter((f) => f !== SELF);
  } catch { return []; }
}

/** Alla svalda supabase-anrop i en fil, klassade som 'write' | 'read'. */
export function scanFile(file, source) {
  const src = source ?? readFileSync(file, 'utf-8');
  const lines = src.split('\n');
  const found = [];

  for (let i = 0; i < lines.length; i++) {
    const m = DESTRUCTURE.exec(lines[i]);
    if (!m) continue;
    const bound = m[1];
    // Hitta satsens SLUT genom att balansera parenteser. Ett fast radfönster
    // ljuger: långa insert-payloads sträcker sig 40 rader och felet som
    // hanteras strax efter såg då ohanterat ut. (Fem falsklarm, 2026-08-31.)
    // Satsens slut: djup noll OCH nästa rad fortsätter inte kedjan. Två
    // enklare regler visade sig ljuga — första parentesjämvikten kapade
    // satsen före `.insert(` (felklassad som läsning), och att leta semikolon
    // spillde över i nästa sats i filer utan semikolon. (2026-08-31.)
    let depth = 0, endLine = i;
    for (let j = i; j < Math.min(lines.length, i + 200); j++) {
      const text = j === i ? lines[j].slice(lines[j].indexOf('await ')) : lines[j];
      for (const ch of text) {
        if ('([{'.includes(ch)) depth++;
        else if (')]}'.includes(ch)) depth--;
      }
      endLine = j;
      if (depth > 0) continue;
      if (/;\s*$/.test(lines[j])) break;
      const next = lines.slice(j + 1).find((l) => l.trim().length > 0) ?? '';
      if (!/^[.)\]]/.test(next.trim())) break;
    }
    const expr = lines.slice(i, endLine + 1).join(' ');
    if (!/\.from\(|\.rpc\(/.test(expr)) continue;
    if (!/supabase|supabaseClient|\bsb\b|serviceClient|admin(Client|Supabase)/i.test(expr)) continue;

    const errName = /error\s*:\s*(\w+)/.exec(bound)?.[1] ?? (/\berror\b/.test(bound) ? 'error' : null);
    if (errName) {
      // Bundet — men används det? Leta efter namnet EFTER satsen.
      const after = lines.slice(endLine, endLine + 20).join('\n');
      const used = new RegExp(`\\b${errName}\\b`).test(after.replace(/error\s*:\s*\w+/g, ''));
      if (used) continue;
    }
    found.push({
      file, line: i + 1,
      kind: WRITE_VERB.test(expr) ? 'write' : 'read',
      snippet: lines[i].trim().slice(0, 120),
    });
  }
  return found;
}

export function scanRepo(roots) {
  return listCandidateFiles(roots).flatMap((f) => scanFile(f));
}
