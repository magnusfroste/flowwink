/**
 * Handler Args Linter — static scan for the agent-execute "rest-spread" anti-pattern.
 *
 * Background: agent-execute injects `_caller_api_key_id`, `_caller_user_id`,
 * `_approved_operation_id`, `_seeded_session_id`, etc. into every skill's `args`
 * object before dispatching to the handler. If a handler then does
 *     .update({ ...rest })   or   .insert({ ...args })
 * those `_`-prefixed fields go straight to PostgREST, which rejects them with
 *     "Could not find the '_caller_api_key_id' column of '<table>' in the schema cache"
 *
 * Same class of bug took out KB update silently (returned success at MCP layer,
 * crashed at DB layer). This linter catches the pattern statically before deploy.
 *
 * Usage:
 *   bun run scripts/handler-args-lint.ts          # scan and report
 *   bun run scripts/handler-args-lint.ts --json   # machine-readable
 *
 * Exits with code 1 if any violations are found.
 */
import fs from 'node:fs';
import path from 'node:path';

interface Finding {
  file: string;
  line: number;
  snippet: string;
  rule: string;
  message: string;
}

const ROOT = path.resolve(import.meta.dir, '..');
const FUNCTIONS_DIR = path.join(ROOT, 'supabase/functions');

// Identifiers commonly used to hold the raw, agent-supplied argument bag.
// Spreading any of these into a PostgREST write leaks _-prefixed fields.
// Identifiers that are almost always the RAW agent-supplied arg bag.
// `.update(args)` is a bug ~100% of the time when args came from a tool call.
const RAW_ARG_IDENTS = new Set([
  'args', 'rest', 'body', 'payload', 'input', 'params',
]);

// Identifiers used both for raw args AND for safe locally-built objects.
// Only flag these if their declaration is actually tainted (spreads RAW idents).
const BUILDER_IDENTS = new Set([
  'data', 'fields', 'patch', 'updates', 'record', 'row',
]);

// Union — used when scanning spread expressions (we want to catch any leak).
const RISKY_IDENTS = new Set([...RAW_ARG_IDENTS, ...BUILDER_IDENTS]);

// Files / directories to skip entirely.
const SKIP_PATTERNS = [
  /\/_shared\//,
  /\/node_modules\//,
  /_test\.ts$/,
  /\.test\.ts$/,
  /\/tests?\//,
];

function* walk(dir: string): Generator<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      yield full;
    }
  }
}

/**
 * Heuristic: does the enclosing block (≤80 lines upward from the violation)
 * contain an obvious strip of `_`-prefixed fields? If yes, the developer is
 * already defensive — don't flag.
 */
function hasNearbyStrip(lines: string[], violationIdx: number): boolean {
  const start = Math.max(0, violationIdx - 80);
  const window = lines.slice(start, violationIdx + 1).join('\n');
  // Patterns that indicate explicit defense:
  //   - `if (k.startsWith('_')) continue;`
  //   - `.filter(([k]) => !k.startsWith('_'))`
  //   - explicit destructure pulling out `_caller_api_key_id` etc.
  //   - whitelist build: const updates: ... = {}; for (const [k,v] ...) { ... updates[k]=v }
  if (/startsWith\(\s*['"]_['"]\s*\)/.test(window)) return true;
  if (/_caller_api_key_id|_caller_user_id|_approved_operation_id|_seeded_session_id/.test(window)) return true;
  // Common whitelist builder pattern
  if (/for\s*\(\s*const\s*\[\s*k\s*,/.test(window) && /Object\.entries/.test(window)) return true;
  return false;
}

/**
 * Find write-call violations in a single file.
 * Targets: .insert(<expr>), .update(<expr>), .upsert(<expr>)
 * Flags when <expr> spreads or directly passes a risky identifier.
 */
/**
 * Build the set of "tainted" variable names: variables whose initial value
 * spreads one of the risky identifiers, e.g.
 *   const updates = { ...rest, updated_at: now };
 * Variables built explicitly (empty `{}` then populated key-by-key) are NOT
 * tainted and won't be flagged — that's the safe pattern.
 */
function collectTaintedVars(src: string): Set<string> {
  const tainted = new Set<string>();
  const declRe = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)(?:\s*:\s*[^=]+)?\s*=\s*\{([\s\S]{0,400}?)\}/g;
  let m: RegExpExecArray | null;
  while ((m = declRe.exec(src)) !== null) {
    const name = m[1];
    const body = m[2];
    const spreadRe = /\.\.\.\s*([A-Za-z_$][\w$]*)/g;
    let sm: RegExpExecArray | null;
    while ((sm = spreadRe.exec(body)) !== null) {
      if (RISKY_IDENTS.has(sm[1])) {
        tainted.add(name);
        break;
      }
    }
  }
  return tainted;
}

function lintFile(file: string): Finding[] {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const findings: Finding[] = [];
  const relFile = path.relative(ROOT, file);
  const tainted = collectTaintedVars(src);

  // Regex catches both `.update(rest)` and `.update({ ...rest, foo: 1 })`
  // and the multi-line form `.update({\n  ...rest,\n  updated_at: ...\n})`.
  // We scan line by line and, when we see `.update(` / `.insert(` / `.upsert(`,
  // capture up to the matching `)`.
  const writeCallRe = /\.(insert|update|upsert)\s*\(/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    writeCallRe.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = writeCallRe.exec(line)) !== null) {
      const method = m[1];
      // Extract the argument expression (best-effort, balanced parens, up to ~6 lines).
      const startIdx = m.index + m[0].length - 1; // position of '('
      let depth = 0;
      let argText = '';
      let scanned = 0;
      let lineCursor = i;
      let colCursor = startIdx;
      outer: while (lineCursor < lines.length && scanned < 600) {
        const ln = lines[lineCursor];
        for (let c = colCursor; c < ln.length; c++) {
          const ch = ln[c];
          if (ch === '(') depth++;
          else if (ch === ')') {
            depth--;
            if (depth === 0) {
              argText += ln.slice(colCursor + 1, c);
              break outer;
            }
          }
          scanned++;
        }
        argText += ln.slice(colCursor, ln.length) + '\n';
        lineCursor++;
        colCursor = 0;
      }

      const arg = argText.trim();
      if (!arg) continue;

      // Pattern 1: bare identifier — flag if risky raw OR tainted variable.
      const bareMatch = arg.match(/^([A-Za-z_$][\w$]*)$/);
      if (bareMatch) {
        const ident = bareMatch[1];
        const isRiskyRaw = RISKY_IDENTS.has(ident);
        const isTainted = tainted.has(ident);
        if ((isRiskyRaw || isTainted) && !hasNearbyStrip(lines, i)) {
          findings.push({
            file: relFile,
            line: i + 1,
            snippet: line.trim(),
            rule: isTainted ? 'tainted-var-into-write' : 'no-bare-args-spread',
            message: isTainted
              ? `.${method}(${ident}) — '${ident}' was built by spreading raw agent args; it carries _-prefixed fields straight to PostgREST.`
              : `.${method}(${ident}) passes the raw agent-supplied object straight to PostgREST. Strip _-prefixed fields first.`,
          });
        }
        continue;
      }

      // Pattern 2: object literal spreading a risky/tainted identifier
      const spreadRe = /\.\.\.\s*([A-Za-z_$][\w$]*)/g;
      let sm: RegExpExecArray | null;
      while ((sm = spreadRe.exec(arg)) !== null) {
        const ident = sm[1];
        const isRiskyRaw = RISKY_IDENTS.has(ident);
        const isTainted = tainted.has(ident);
        if (!isRiskyRaw && !isTainted) continue;
        if (hasNearbyStrip(lines, i)) continue;
        findings.push({
          file: relFile,
          line: i + 1,
          snippet: line.trim(),
          rule: 'no-args-spread-into-write',
          message: `.${method}({ ...${ident} }) leaks _-prefixed agent fields to PostgREST.`,
        });
        break;
      }
    }
  }

  return findings;
}

function main() {
  const json = process.argv.includes('--json');
  const findings: Finding[] = [];

  if (!fs.existsSync(FUNCTIONS_DIR)) {
    console.error(`Functions directory not found: ${FUNCTIONS_DIR}`);
    process.exit(2);
  }

  let scannedFiles = 0;
  for (const file of walk(FUNCTIONS_DIR)) {
    if (SKIP_PATTERNS.some((p) => p.test(file))) continue;
    scannedFiles++;
    findings.push(...lintFile(file));
  }

  if (json) {
    console.log(JSON.stringify({ scanned_files: scannedFiles, findings }, null, 2));
  } else {
    console.log(`\n🔎 Handler Args Linter — scanned ${scannedFiles} edge function files`);
    console.log(`   Rule: any .insert/.update/.upsert that spreads raw agent args leaks _-prefixed fields.\n`);
    if (findings.length === 0) {
      console.log('✅ No violations found.\n');
    } else {
      const byFile = new Map<string, Finding[]>();
      for (const f of findings) {
        if (!byFile.has(f.file)) byFile.set(f.file, []);
        byFile.get(f.file)!.push(f);
      }
      for (const [file, group] of byFile) {
        console.log(`📄 ${file}`);
        for (const f of group) {
          console.log(`   L${f.line}  [${f.rule}]`);
          console.log(`     ${f.snippet}`);
          console.log(`     → ${f.message}`);
        }
        console.log();
      }
      console.log(`❌ ${findings.length} violation(s) across ${byFile.size} file(s).\n`);
    }
  }

  process.exit(findings.length > 0 ? 1 : 0);
}

main();
