/**
 * The process map — `npm run docs:process-map`.
 *
 * Reads docs/processes/*.md (title, the problem, maturity, the modules table,
 * the mermaid flow) and the curated half in ./data.ts, and writes a printable
 * map to .qa-output/process-map/: process-map.html, and process-map.pdf when
 * Playwright's Chromium is present. Pages: how the processes hand off to each
 * other, one purchase traced from checkout to close, the module matrix, and a
 * page per process. Rebuild it whenever a process doc changes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { FAMILIES, HANDOFFS, LEDGER_MODULES, PURCHASE_CHAIN } from './data';
import { loadProcesses, type ProcessDoc } from './parse';

const ROOT = resolve(import.meta.dirname ?? __dirname, '../..');
const DOCS = join(ROOT, 'docs/processes');
const OUT = join(ROOT, '.qa-output/process-map');

const E = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function buildHtml(P: Map<string, ProcessDoc>, date: string): string {
  const famOf = new Map(FAMILIES.flatMap((f) => f.slugs.map((s) => [s, f] as const)));
  const order = FAMILIES.flatMap((f) => f.slugs);
  const short = (s: string) => P.get(s)!.title;
  const uses = new Map(order.map((s) => [s, P.get(s)!.modules]));
  const count = new Map<string, number>();
  for (const ms of uses.values()) for (const m of ms) count.set(m, (count.get(m) ?? 0) + 1);
  const mods = [...count.keys()].sort((a, b) => count.get(b)! - count.get(a)! || a.localeCompare(b));
  const ledger = order.filter((s) => s !== 'record-to-report' && uses.get(s)!.some((m) => LEDGER_MODULES.includes(m)));

  // ── the network ──
  const W = 1120, H = 580, colx = [112, 334, 556, 778, 1000];
  const pos = new Map<string, [number, number]>();
  FAMILIES.forEach((f, i) => {
    const gap = (H - 140) / Math.max(f.slugs.length, 1);
    f.slugs.forEach((s, j) => pos.set(s, [colx[i], 90 + gap * j + gap / 2]));
  });
  const edge = (a: string, b: string, cls: string, marker: string, both = false) => {
    let [x1, y1] = pos.get(a)!; let [x2, y2] = pos.get(b)!;
    const ms = both ? ` marker-start="url(#${marker})"` : '';
    if (x1 === x2) {
      const xo = x1 + 92;
      return `<path d="M${xo},${y1} C${xo + 40},${y1} ${xo + 40},${y2} ${xo},${y2}" class="${cls}"${ms} marker-end="url(#${marker})"/>`;
    }
    if (x2 < x1) [x1, x2, y1, y2] = [x2, x1, y2, y1];
    const xa = x1 + 92, xb = x2 - 92, mx = (xa + xb) / 2;
    return `<path d="M${xa},${y1} C${mx},${y1} ${mx},${y2} ${xb},${y2}" class="${cls}"${ms} marker-end="url(#${marker})"/>`;
  };
  const node = (s: string) => {
    const [x, y] = pos.get(s)!; const c = famOf.get(s)!.color;
    return `<g><rect x="${x - 92}" y="${y - 20}" width="184" height="40" rx="8" fill="var(--surface)" stroke="${c}" stroke-width="2"/><rect x="${x - 92}" y="${y - 20}" width="6" height="40" rx="3" fill="${c}"/><text x="${x + 3}" y="${y + 5}" text-anchor="middle" class="nt">${E(short(s))}</text></g>`;
  };
  const svg = [
    `<svg viewBox="0 0 ${W} ${H}" class="net" role="img" aria-label="Processerna och deras överlämningar">`,
    '<defs><marker id="ar" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#3d3c39"/></marker>',
    '<marker id="al" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c98500"/></marker></defs>',
    ...FAMILIES.map((f, i) => `<text x="${colx[i]}" y="40" text-anchor="middle" class="ft" fill="${f.color}">${E(f.name)}</text>`),
    ...ledger.map((a) => edge(a, 'record-to-report', 'e led', 'al')),
    ...HANDOFFS.map((h) => edge(h.from, h.to, 'e', 'ar', h.both)),
    ...order.map(node),
    '</svg>',
  ].join('\n');

  // ── the matrix ──
  const shared = mods.filter((m) => count.get(m)! >= 2);
  const single = mods.filter((m) => count.get(m) === 1);
  const matrix = [
    '<table class="mx"><thead><tr><th class="mh">Modul</th>',
    ...order.map((s) => `<th class="vh"><div><span style="border-left:4px solid ${famOf.get(s)!.color};padding-left:4px">${E(short(s))}</span></div></th>`),
    '<th class="cnt">Antal</th></tr></thead><tbody>',
    ...shared.map((m) => `<tr><td class="mn">${E(m)}</td>${order.map((s) => `<td>${uses.get(s)!.includes(m) ? `<span class="dot" style="background:${famOf.get(s)!.color}"></span>` : ''}</td>`).join('')}<td class="cnt">${count.get(m)}</td></tr>`),
    '</tbody></table>',
    `<p class="pgnote" style="margin-top:8px"><b>Används av en process:</b> ${E(single.sort().join(', '))}.</p>`,
  ].join('\n');

  // ── the purchase ──
  const chain = PURCHASE_CHAIN.map((c, i) =>
    `<div class="ch"><div class="num">${i + 1}</div><div><div class="cht">${E(c.title)}</div><div class="chm">${E(c.module)}</div><div class="chd">${E(c.text)}</div></div></div>`,
  ).join('<div class="arrow">↓</div>');

  // ── a page per process ──
  const pages = order.map((s) => {
    const p = P.get(s)!; const f = famOf.get(s)!;
    const out = [
      ...HANDOFFS.filter((h) => h.from === s).map((h) => short(h.to)),
      ...HANDOFFS.filter((h) => h.both && h.to === s).map((h) => short(h.from)),
      ...(ledger.includes(s) ? ['Record-to-Report (bokföring)'] : []),
    ];
    const inn = [
      ...HANDOFFS.filter((h) => h.to === s && !h.both).map((h) => short(h.from)),
      ...(s === 'record-to-report' ? ledger.map(short) : []),
    ];
    const conn = [
      inn.length ? `<b>Tar emot från:</b> ${E(inn.join(', '))}` : '',
      out.length ? `<b>Lämnar över till:</b> ${E(out.join(', '))}` : '',
    ].filter(Boolean).join('<br>') || '<span class="muted">Fristående</span>';
    const steps = p.steps.slice(0, 9).map((x, i) => `<li><span class="sn" style="background:${f.color}">${i + 1}</span>${E(x)}</li>`).join('');
    const chips = p.modules.map((m) => `<span class="chip">${E(m)}</span>`).join('') || '<span class="muted">—</span>';
    return `<section class="page"><div class="fam" style="color:${f.color}">${E(f.name)}</div><h2>${E(p.title)}</h2><p class="tag">${E(p.tagline)}</p>
<div class="cols"><div><h3>Problemet den löser</h3><p>${E(p.problem)}</p><h3>Mognad</h3><p><b>${E(p.maturity)}</b></p><h3>Moduler</h3><div class="chips">${chips}</div><h3>Kopplingar</h3><p>${conn}</p></div>
<div><h3>Flödet</h3><ol class="steps">${steps}</ol></div></div><div class="src">Källa: docs/processes/${s}.md</div></section>`;
  }).join('\n');

  const links = HANDOFFS.length + ledger.length;
  return `<!doctype html><html lang="sv"><head><meta charset="utf-8"><title>FlowWink processkarta</title><style>
:root{--ink:#0b0b0b;--ink2:#52514e;--muted:#8a8984;--line:#e4e3df;--surface:#fcfcfb;--panel:#f4f3f0}
@page{size:A4 landscape;margin:0}*{box-sizing:border-box}body{margin:0;font-family:Inter,"Helvetica Neue",Arial,sans-serif;color:var(--ink);background:var(--surface)}
.page{width:297mm;height:210mm;padding:14mm 16mm;page-break-after:always;position:relative;overflow:hidden}
h1{font-size:34px;margin:0 0 6px}h2{font-size:26px;margin:2px 0 4px}h3{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--ink2);margin:14px 0 6px}
p{font-size:13px;line-height:1.5;margin:0 0 6px}.muted{color:var(--muted)}.cover{display:flex;flex-direction:column;justify-content:center}.sub{font-size:16px;color:var(--ink2);max-width:190mm}
.legend{display:flex;gap:18px;margin-top:22px;flex-wrap:wrap}.legend span{font-size:13px;display:flex;align-items:center;gap:6px}.legend i{width:12px;height:12px;border-radius:3px;display:inline-block}
.kpis{display:flex;gap:28px;margin-top:26px}.kpi b{display:block;font-size:30px}.kpi span{font-size:12px;color:var(--ink2)}
.net{width:100%;height:auto}.nt{font-size:12.5px;font-weight:600;fill:var(--ink)}.ft{font-size:13px;font-weight:700}
.e{fill:none;stroke:#3d3c39;stroke-width:1.8}.led{stroke:#c98500;stroke-width:1.1;stroke-dasharray:4 3;opacity:.75}
.mx{border-collapse:collapse;font-size:10px;margin-top:4px}.mx td,.mx th{border-bottom:1px solid var(--line);padding:1px 3px;text-align:center}
.mx .vh{height:104px;vertical-align:bottom;white-space:nowrap;width:24px}.mx .vh div{transform:rotate(-55deg);transform-origin:left bottom;width:22px;margin-left:12px;font-weight:600}
.mx .mn{text-align:left;white-space:nowrap;font-weight:600;padding-right:10px}.mx .mh{text-align:left;vertical-align:bottom}.mx .cnt{color:var(--ink2);font-weight:600}
.dot{display:inline-block;width:10px;height:10px;border-radius:3px}.chain{max-width:200mm}
.ch{display:flex;gap:12px;align-items:flex-start;background:var(--panel);border-radius:8px;padding:7px 12px}
.num{width:24px;height:24px;border-radius:12px;background:#eb6834;color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;flex:none}
.cht{font-weight:700;font-size:13px}.chm{font-size:11px;color:var(--ink2);font-weight:600;text-transform:uppercase;letter-spacing:.05em}.chd{font-size:12px}
.arrow{padding-left:18px;color:var(--muted);font-size:12px;line-height:12px}.fam{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}.tag{font-size:15px;color:var(--ink2)}
.cols{display:grid;grid-template-columns:1fr 1.15fr;gap:22px;margin-top:6px}.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{font-size:11.5px;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:3px 9px}
.steps{list-style:none;padding:0;margin:0}.steps li{display:flex;gap:8px;align-items:flex-start;font-size:12px;line-height:1.35;padding:5px 0;border-bottom:1px solid var(--line)}
.sn{flex:none;width:20px;height:20px;border-radius:10px;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center}
.src{position:absolute;bottom:9mm;left:16mm;font-size:10px;color:var(--muted)}.pgnote{font-size:12px;color:var(--ink2);max-width:250mm}
</style></head><body>
<section class="page cover"><div class="fam" style="color:#2a78d6">FlowWink</div><h1>Processkartan</h1>
<p class="sub">De ${P.size} affärsprocesser plattformen bär från början till slut, vilka moduler var och en använder, och hur de lämnar över till varandra — så att ett köp i webbshoppen blir en order, ett plock, en faktura och en rad i bokslutet utan att någon flyttar data för hand.</p>
<div class="kpis"><div class="kpi"><b>${P.size}</b><span>processer, provade varje natt</span></div><div class="kpi"><b>${mods.length}</b><span>moduler som processerna använder</span></div><div class="kpi"><b>${links}</b><span>kopplingar mellan processerna</span></div></div>
<div class="legend">${FAMILIES.map((f) => `<span><i style="background:${f.color}"></i>${E(f.name)}</span>`).join('')}</div>
<div class="src">Byggd från docs/processes/*.md och scripts/process-map/data.ts, ${E(date)}. Varje process körs från noll i nattens process-batteri.</div></section>
<section class="page"><h2>Hur processerna hänger ihop</h2><p class="pgnote">En pil är en överlämning: det ena flödets resultat är nästa flödes början. Dubbelpilen går åt båda håll (en retur går tillbaka in i leveransflödet). De streckade gula linjerna är bokföringen: varje process som skapar en faktura, en utgift eller en bankrad landar i Record-to-Report — huvudboken är den gemensamma slutstationen.</p>${svg}</section>
<section class="page"><h2>Ett köp, från kassan till bokslutet</h2><p class="pgnote">Det kunden ser är ett köp; det som händer inuti är fyra moduler som tar vid efter varandra, styrda av händelsen <b>order.paid</b> och två automationer. Ingen person behöver flytta något.</p><div class="chain">${chain}</div></section>
<section class="page"><h2>Vilka moduler varje process använder</h2><p class="pgnote">Raderna överst är plattformens ryggrad — de moduler flest processer går igenom. En modul som är avstängd tar sina steg ur varje process den syns i.</p>${matrix}</section>
${pages}
</body></html>`;
}

{
  const P = loadProcesses(DOCS);
  const missing = FAMILIES.flatMap((f) => f.slugs).filter((s) => !P.has(s));
  if (missing.length) throw new Error(`data.ts names processes with no doc: ${missing.join(', ')}`);
  const html = buildHtml(P, new Date().toISOString().slice(0, 10));
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'process-map.html'), html);
  console.log(`process map: ${P.size} processes → ${join(OUT, 'process-map.html')}`);
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('file://' + join(OUT, 'process-map.html'));
    await page.pdf({ path: join(OUT, 'process-map.pdf'), format: 'A4', landscape: true, printBackground: true, preferCSSPageSize: true });
    await browser.close();
    console.log(`              → ${join(OUT, 'process-map.pdf')}`);
  } catch (e) {
    console.log(`(no PDF: Playwright's Chromium is not available here — open the HTML and print it. ${(e as Error).message.split('\n')[0]})`);
  }
}
