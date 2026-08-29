/**
 * En etikettkarta för aktiviteter — och manuella typer är substantiv.
 *
 * Fyndet (Magnus 2026-08-29): loggen visade "Note Added" medan knappen som
 * skapar posten säger "Note". Orsaken var inte ordvalet utan att det fanns TVÅ
 * kartor: getActivityTypeInfo (useActivities) sa "Note", "Call", "Email" och
 * användes av ActivityTimeline; getActivityTitle (useUnifiedTimeline) bar en
 * andra, drivande kopia som sa "Note added", "Phone call", "Email sent" — det
 * sista dessutom fel, eftersom en människa loggar mejl i BÅDA riktningarna.
 *
 * Namnregeln som följer av liggaren: varje rad ÄR en tillagd post, så "added"
 * är brus på exakt en typ. Manuellt loggade typer är substantiv och ska eka
 * knappen som skapade dem. Systemobservationer behåller sitt verb, för där ÄR
 * verbet innehållet — ett mejl som ÖPPNAS är hela händelsen.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getActivityTypeInfo } from '@/hooks/useActivities';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf-8');
const timeline = read('src/hooks/useUnifiedTimeline.ts');
const panel = read('src/components/admin/crm/RecordDiscussPanel.tsx');

describe('manuellt loggade typer är substantiv', () => {
  for (const [type, label] of [['note', 'Note'], ['call', 'Call'], ['email', 'Email'], ['meeting', 'Meeting']] as const) {
    it(`${type} → "${label}"`, () => {
      expect(getActivityTypeInfo(type).label).toBe(label);
    });
  }

  it('och etiketten ekar knappen som skapar posten', () => {
    for (const label of ['Note', 'Call', 'Email', 'Meeting']) {
      expect(panel).toMatch(new RegExp(`label: '${label}'`));
    }
  });

  it('systemobservationer behåller sitt verb — där är verbet innehållet', () => {
    expect(getActivityTypeInfo('email_open').label).toBe('Email opened');
    expect(getActivityTypeInfo('link_click').label).toBe('Link clicked');
  });
});

describe('en karta, inte två', () => {
  it('tidslinjen hämtar etikett, ikon och färg ur den delade kartan', () => {
    expect(timeline).toMatch(/import \{ getActivityTypeInfo \}/);
    expect(timeline).toMatch(/return getActivityTypeInfo\(type\)\.label;/);
    expect(timeline).toMatch(/return getActivityTypeInfo\(type\)\.icon;/);
    expect(timeline).toMatch(/return getActivityTypeInfo\(type\)\.color;/);
  });

  it('och bär ingen egen kopia av de enkla etiketterna längre', () => {
    expect(timeline).not.toMatch(/note: 'Note added'/);
    expect(timeline).not.toMatch(/email: 'Email sent'/);
    expect(timeline).not.toMatch(/const icons: Record<string, string>/);
    expect(timeline).not.toMatch(/const colors: Record<string, string>/);
  });

  it('men behåller de kontextuella titlarna — metadatan bor där', () => {
    expect(timeline).toMatch(/Task done: \$\{meta\.task_title\}/);
    expect(timeline).toMatch(/Form: \$\{meta\?\.form_name/);
    expect(timeline).toMatch(/Status: \$\{meta\?\.from\} → \$\{meta\?\.to\}/);
  });

  it('varje typ tidslinjen kan möta har en etikett i kartan', () => {
    // Fallbacken returnerar råa typnamnet; det är en degradering, inte en design.
    for (const t of ['note', 'call', 'email', 'meeting', 'form_submit', 'email_open',
                     'link_click', 'status_change', 'deal_closed_won', 'deal_closed_lost',
                     'webinar_register', 'task_completed']) {
      expect(getActivityTypeInfo(t).label).not.toBe(t);
    }
  });
});
