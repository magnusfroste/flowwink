/**
 * Dunning email templates — inline HTML, brand-neutral.
 *
 * Three steps mapped onto the 5-stage dunning timeline:
 *   reminder → Day 0 + Day 3 (gentle nudge)
 *   urgent   → Day 7 + Day 10 (firm, manual task escalation triggered separately)
 *   final    → Day 14 (cancellation notice)
 *
 * Inputs are escaped via the `esc()` helper. Templates render to a single
 * HTML string ready for `email-send`. Used by `dunning-processor` and the
 * admin DunningPreview component.
 */

export type DunningTemplateKey = 'reminder' | 'urgent' | 'final';

export interface DunningTemplateData {
  customerName?: string | null;
  productName?: string | null;
  amountCents: number;
  currency: string;
  failureReason?: string | null;
  attemptCount?: number;
  updatePaymentUrl?: string;
  brandName?: string;
  supportEmail?: string;
}

const esc = (s: unknown): string =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const fmt = (cents: number, currency: string): string => {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: (currency || 'USD').toUpperCase(),
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
};

interface RenderOpts {
  title: string;
  preheader: string;
  intro: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footer: string;
  brandName: string;
}

const shell = (o: RenderOpts): string => `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(o.title)}</title></head>
<body style="margin:0;padding:0;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1d1d1f;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${esc(o.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f7;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.04);">
      <tr><td style="padding:32px 40px 8px;">
        <div style="font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:#86868b;">${esc(o.brandName)}</div>
      </td></tr>
      <tr><td style="padding:8px 40px 0;">
        <h1 style="margin:0;font-size:24px;line-height:1.25;font-weight:600;color:#1d1d1f;">${esc(o.title)}</h1>
      </td></tr>
      <tr><td style="padding:16px 40px 0;font-size:15px;line-height:1.55;color:#1d1d1f;">${o.intro}</td></tr>
      <tr><td style="padding:16px 40px 0;font-size:15px;line-height:1.55;color:#3a3a3c;">${o.body}</td></tr>
      ${
        o.ctaLabel && o.ctaUrl
          ? `<tr><td style="padding:28px 40px 0;" align="left">
              <a href="${esc(o.ctaUrl)}" style="display:inline-block;background:#0071e3;color:#ffffff;text-decoration:none;font-weight:500;font-size:15px;padding:12px 22px;border-radius:980px;">${esc(o.ctaLabel)}</a>
            </td></tr>`
          : ''
      }
      <tr><td style="padding:32px 40px;font-size:13px;line-height:1.5;color:#86868b;border-top:1px solid #f2f2f4;margin-top:32px;">${o.footer}</td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;

const commonFooter = (d: DunningTemplateData): string => {
  const support = d.supportEmail
    ? `Questions? Reply to this email or contact <a href="mailto:${esc(d.supportEmail)}" style="color:#0071e3;text-decoration:none;">${esc(d.supportEmail)}</a>.`
    : 'Questions? Just reply to this email.';
  return `${support}<br><br>Sent by ${esc(d.brandName ?? 'FlowWink')}.`;
};

export function renderDunningEmail(
  key: DunningTemplateKey,
  data: DunningTemplateData,
): { subject: string; html: string } {
  const brandName = data.brandName ?? 'FlowWink';
  const product = esc(data.productName ?? 'your subscription');
  const amount = fmt(data.amountCents, data.currency);
  const greeting = data.customerName
    ? `Hi ${esc(data.customerName)},`
    : 'Hi there,';
  const cta =
    data.updatePaymentUrl
      ? { ctaLabel: 'Update payment method', ctaUrl: data.updatePaymentUrl }
      : {};
  const reason = data.failureReason
    ? `<br><br><span style="color:#86868b;font-size:13px;">Reason from your bank: ${esc(data.failureReason)}</span>`
    : '';

  if (key === 'reminder') {
    return {
      subject: `Quick heads-up about your ${data.productName ?? 'subscription'} payment`,
      html: shell({
        brandName,
        title: 'We had trouble with your payment',
        preheader: `${amount} for ${data.productName ?? 'your subscription'} couldn't be charged.`,
        intro: `<p style="margin:0;">${greeting}</p>`,
        body: `<p style="margin:0;">We just tried to renew <strong>${product}</strong> for <strong>${amount}</strong> but the payment didn't go through. No action is critical yet — most of the time this is a temporary issue and the next attempt succeeds automatically.${reason}</p><p style="margin:16px 0 0;">If you'd like to fix it now, you can update your payment method below.</p>`,
        ...cta,
        footer: commonFooter(data),
      }),
    };
  }

  if (key === 'urgent') {
    return {
      subject: `Action needed: payment for ${data.productName ?? 'your subscription'}`,
      html: shell({
        brandName,
        title: 'Your subscription needs attention',
        preheader: `Several attempts to charge ${amount} have failed.`,
        intro: `<p style="margin:0;">${greeting}</p>`,
        body: `<p style="margin:0;">We've now tried ${data.attemptCount ?? 'several'} times to charge <strong>${amount}</strong> for <strong>${product}</strong> without success. To keep your access active, please update your payment method.${reason}</p><p style="margin:16px 0 0;">If we can't process payment in the next few days your subscription will be suspended.</p>`,
        ...cta,
        footer: commonFooter(data),
      }),
    };
  }

  // final
  return {
    subject: `Your ${data.productName ?? 'subscription'} has been cancelled`,
    html: shell({
      brandName,
      title: 'Your subscription has been cancelled',
      preheader: `We were unable to collect payment for ${product}.`,
      intro: `<p style="margin:0;">${greeting}</p>`,
      body: `<p style="margin:0;">After multiple attempts we weren't able to collect <strong>${amount}</strong> for <strong>${product}</strong>, so we've cancelled your subscription.${reason}</p><p style="margin:16px 0 0;">You're always welcome back — just resubscribe whenever the timing's right and we'll pick up where you left off.</p>`,
      ...cta,
      footer: commonFooter(data),
    }),
  };
}

export const DUNNING_TEMPLATES: Array<{
  key: DunningTemplateKey;
  label: string;
  description: string;
  steps: string;
}> = [
  {
    key: 'reminder',
    label: 'Reminder',
    description: 'Friendly first nudge — sent on Day 0 and Day 3 of the sequence.',
    steps: 'Steps 1 & 2',
  },
  {
    key: 'urgent',
    label: 'Urgent',
    description:
      'Firm reminder before suspension — sent on Day 7 and Day 10. Day 10 also creates a manual follow-up task for high-value accounts.',
    steps: 'Steps 3 & 4',
  },
  {
    key: 'final',
    label: 'Final / Cancellation',
    description: 'Sent on Day 14 alongside the actual subscription cancellation.',
    steps: 'Step 5',
  },
];
