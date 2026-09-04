/**
 * Branded email shell — one visual frame for every outbound mail.
 *
 * Branding lives in site_settings, so the operator's logo and colour reach the
 * inbox without anyone editing HTML. The shell is applied by `email-send`, the
 * single router every rail already passes through, rather than by each caller.
 *
 * SELF-DETECTING BY DESIGN. Twelve callers (invoice_email, order_confirmation,
 * quote_email, contract-sign, …) already build complete HTML documents with
 * their own headers. Wrapping those would give the recipient two logos and two
 * footers. So the shell wraps FRAGMENTS only: anything that already declares
 * <html>/<body>/<!doctype> is passed through untouched. A caller that wants to
 * opt out explicitly can send `skip_branding: true`.
 *
 * Email clients are not browsers: no CSS variables, no external stylesheets,
 * inline styles only, tables for layout, and hex colours — hsl() is unreliable
 * and our design tokens are HSL triplets, so they get converted here.
 */

export interface EmailShell {
  organizationName: string;
  /** Email-safe logo URL (PNG/JPG), or null when only an SVG exists. */
  logoUrl: string | null;
  /** Brand colour as #rrggbb — used for the header rule and link colour. */
  primaryHex: string;
  siteUrl: string;
  tagline: string | null;
}

/**
 * Design tokens are stored as HSL triplets ("195 85% 48%") because that is what
 * Tailwind consumes. Mail clients need hex.
 */
export function hslTripletToHex(triplet: string | undefined | null): string | null {
  if (!triplet) return null;
  const m = String(triplet).trim().match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)%\s+(\d+(?:\.\d+)?)%$/);
  if (!m) {
    // Already hex? Accept it — operators do paste hex into these fields.
    const hex = String(triplet).trim();
    return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : null;
  }
  const h = parseFloat(m[1]) / 360;
  const s = parseFloat(m[2]) / 100;
  const l = parseFloat(m[3]) / 100;

  const hue2rgb = (p: number, q: number, t: number): number => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const toHex = (v: number) => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Gmail and Outlook block or mangle SVG in mail bodies. A broken image icon
 * looks worse than no logo, so an SVG-only brand renders as styled text.
 */
function emailSafeLogo(branding: Record<string, unknown>): string | null {
  const explicit = branding.logoEmail as string | undefined;
  if (explicit && explicit.trim()) return explicit.trim();
  const logo = (branding.logo as string | undefined)?.trim();
  if (!logo) return null;
  const path = logo.split("?")[0].toLowerCase();
  if (path.endsWith(".svg")) return null; // caller falls back to the wordmark
  return logo;
}

const DEFAULT_PRIMARY = "#1f6feb";

export async function loadEmailShell(
  // deno-lint-ignore no-explicit-any
  supabase: any,
): Promise<EmailShell> {
  const { data: rows } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", ["branding", "general", "company_profile"]);

  const byKey: Record<string, Record<string, unknown>> = {};
  for (const row of (rows ?? []) as Array<{ key: string; value: unknown }>) {
    byKey[row.key] = (row.value ?? {}) as Record<string, unknown>;
  }
  const branding = byKey.branding ?? {};
  const general = byKey.general ?? {};
  const profile = byKey.company_profile ?? {};
  // The footer names the company's public address. Business Identity's
  // website is that address; general.siteUrl is where THIS FlowWink site
  // lives, which on a fork or a not-yet-launched instance is a Vercel host —
  // "flowwink-sigma.vercel.app" under every mail Resta sent (2026-09-04).
  const publicUrl = ((profile.website as string) || (general.siteUrl as string) || "").trim();

  return {
    organizationName:
      (branding.organizationName as string) || (branding.adminName as string) || "",
    logoUrl: emailSafeLogo(branding),
    primaryHex: hslTripletToHex(branding.primaryColor as string) ?? DEFAULT_PRIMARY,
    siteUrl: (/^https?:\/\//i.test(publicUrl) ? publicUrl : publicUrl ? `https://${publicUrl}` : "").replace(/\/+$/, ""),
    tagline: (branding.brandTagline as string) || null,
  };
}

/**
 * A complete document brings its own frame — wrapping it would duplicate the
 * header and footer the caller already composed.
 */
export function isFullDocument(html: string): boolean {
  return /<!doctype|<html[\s>]|<body[\s>]/i.test(html ?? "");
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Wrap a content fragment in the branded frame. Table-based and fully inlined:
 * Outlook ignores <div> max-width and every client strips <style> blocks
 * unevenly.
 */
export function wrapInShell(contentHtml: string, shell: EmailShell): string {
  const org = escapeHtml(shell.organizationName);
  const headerInner = shell.logoUrl
    ? `<img src="${escapeHtml(shell.logoUrl)}" alt="${org}" height="36" style="display:block;border:0;outline:none;text-decoration:none;height:36px;max-height:36px;width:auto;" />`
    : org
      ? `<span style="font-size:18px;font-weight:700;color:#111111;letter-spacing:-0.01em;">${org}</span>`
      : "";

  const header = headerInner
    ? `<tr><td style="padding:24px 32px 16px 32px;border-bottom:3px solid ${shell.primaryHex};">${
        shell.siteUrl
          ? `<a href="${escapeHtml(shell.siteUrl)}" style="text-decoration:none;color:#111111;">${headerInner}</a>`
          : headerInner
      }</td></tr>`
    : "";

  const footerBits: string[] = [];
  if (org) footerBits.push(org);
  if (shell.siteUrl) {
    const label = shell.siteUrl.replace(/^https?:\/\//, "");
    footerBits.push(
      `<a href="${escapeHtml(shell.siteUrl)}" style="color:#888888;text-decoration:underline;">${escapeHtml(label)}</a>`,
    );
  }
  const footer = footerBits.length
    ? `<tr><td style="padding:16px 32px 28px 32px;border-top:1px solid #eeeeee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#888888;">${footerBits.join(
        " &nbsp;·&nbsp; ",
      )}</td></tr>`
    : "";

  return `<!doctype html>
<html lang="sv">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${org}</title>
</head>
<body style="margin:0;padding:0;background-color:#f5f6f8;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f6f8;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;">
${header}
<tr><td style="padding:28px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:24px;color:#222222;">
${contentHtml}
</td></tr>
${footer}
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * Convenience: apply the shell only where it belongs.
 */
export function applyShell(
  html: string,
  shell: EmailShell,
  opts?: { skipBranding?: boolean },
): string {
  if (opts?.skipBranding) return html;
  if (isFullDocument(html)) return html;
  return wrapInShell(html, shell);
}
