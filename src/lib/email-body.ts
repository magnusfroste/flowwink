/**
 * Plain-text email → readable HTML, without pretending to be a mail client.
 *
 * An inbound message from Composio/Gmail is stored as text: CRLF line ends,
 * the quoted reply below "On … wrote:" / "Den … skrev:", a "-- " signature,
 * bare URLs. Rendered raw into innerHTML (as the Email page did until
 * 2026-09-02) that collapses into one grey brick — and, worse, executes
 * whatever HTML a stranger put in the body. This does four cheap things:
 * escape, paragraphs, links, and fold the quoted tail and the signature
 * away from the part someone actually wrote.
 */

export interface FormattedEmail {
  /** The part the sender wrote, as HTML (escaped, linkified, paragraphs). */
  main: string;
  /** The quoted earlier conversation, as HTML — collapsed by the UI. */
  quoted: string | null;
  /** The "-- " signature, as HTML — dimmed by the UI. */
  signature: string | null;
}

const QUOTE_HEADER = [
  /^On .{3,200}? wrote:\s*$/i,                       // Gmail (en)
  /^Den .{3,200}? skrev\b.*:\s*$/i,                  // Gmail (sv): "Den tis 2 sep. 2026 kl 10:00 skrev Anna <…>:"
  /^Am .{3,200}? schrieb .*:\s*$/i,                  // Gmail (de)
  /^Le .{3,200}? a écrit\s*:\s*$/i,                  // Gmail (fr)
  /^-{2,}\s*(Original Message|Ursprungligt meddelande|Vidarebefordrat meddelande|Forwarded message)\s*-{2,}\s*$/i,
  /^_{10,}\s*$/,                                     // Outlook divider
  /^(From|Från|Von|De):\s.+$/,                       // Outlook header block
];

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?]/g;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;

/**
 * What a link reads as. The href keeps the whole URL; the label drops the
 * scheme, www., query and fragment, and folds a long path in the middle —
 * "github.com/magnusfroste/flowwink/pull/458", not the 90-character tracking
 * string a plain-text mail prints. A mail client, not a terminal.
 */
export function linkLabel(url: string, max = 56): string {
  let s = url.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  s = s.replace(/[?#].*$/, '').replace(/\/$/, '');
  if (s.length <= max) return s;
  const slash = s.indexOf('/');
  const host = slash > 0 ? s.slice(0, slash) : s;
  const tail = s.slice(-Math.max(12, max - host.length - 2));
  return `${host}/…${tail.replace(/^[^/]*\//, '/')}`;
}

/** Escape first, then link — so a URL in the text can never carry markup. */
export function linkify(escaped: string): string {
  return escaped
    .replace(URL_RE, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer" title="${u}">${linkLabel(u.replace(/&amp;/g, '&')).replace(/&/g, '&amp;')}</a>`)
    .replace(EMAIL_RE, (m) => (m.includes('href=') ? m : `<a href="mailto:${m}">${m}</a>`));
}

function paragraphs(lines: string[]): string {
  const out: string[] = [];
  let buf: string[] = [];
  const flush = () => {
    if (buf.length) out.push(`<p>${buf.map((l) => linkify(escapeHtml(l))).join('<br>')}</p>`);
    buf = [];
  };
  for (const line of lines) {
    if (line.trim() === '') flush();
    else buf.push(line);
  }
  flush();
  return out.join('\n');
}

export function formatPlainEmail(text: string | null | undefined): FormattedEmail {
  const lines = (text ?? '').replace(/\r\n?/g, '\n').split('\n');

  // 1. Quoted tail: from the first header line, or the first run of "> " lines
  //    that continues to the end, everything below is the earlier thread.
  let quoteAt = -1;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    if (QUOTE_HEADER.some((re) => re.test(l))) { quoteAt = i; break; }
    if (l.startsWith('>') && lines.slice(i).every((x) => x.trim() === '' || x.trim().startsWith('>'))) { quoteAt = i; break; }
  }
  const own = quoteAt >= 0 ? lines.slice(0, quoteAt) : lines;
  const quoted = quoteAt >= 0 ? lines.slice(quoteAt) : [];

  // 2. Signature: the RFC 3676 "-- " line, only in the part the sender wrote.
  let sigAt = -1;
  for (let i = 0; i < own.length; i++) {
    if (/^-- ?$/.test(own[i])) { sigAt = i; break; }
  }
  const body = sigAt >= 0 ? own.slice(0, sigAt) : own;
  const signature = sigAt >= 0 ? own.slice(sigAt + 1) : [];

  const trimEdges = (ls: string[]) => {
    let a = 0, b = ls.length;
    while (a < b && ls[a].trim() === '') a++;
    while (b > a && ls[b - 1].trim() === '') b--;
    return ls.slice(a, b);
  };

  return {
    main: paragraphs(trimEdges(body)),
    quoted: quoted.length ? paragraphs(trimEdges(quoted.map((l) => l.replace(/^\s*>+\s?/, '')))) : null,
    signature: signature.length ? paragraphs(trimEdges(signature)) : null,
  };
}
