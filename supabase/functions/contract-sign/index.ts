// Public contract signing endpoint.
// Atomically: records signature, updates contract status, sends confirmation emails.
// Bypasses JWT verification — auth is by accept_token + status check.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { sha256Hex } from '../_shared/agent-audit.ts';
import { provisionPortalAccount } from '../_shared/provision-portal-account.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface Body {
  accept_token: string;
  action: 'accept' | 'reject';
  signer_name: string;
  signer_email: string;
  signature_data?: string;
  /** Optional drawn signature — data:image/png base64 data-URL from the public sign page. */
  signature_image?: string;
  comment?: string;
  user_agent?: string;
}

/** Accept only reasonably-sized PNG/JPEG data-URLs; anything else is dropped (typed name still recorded). */
function sanitizeSignatureImage(img: string | undefined): string | null {
  if (!img) return null;
  if (img.length > 300_000) return null; // ~220KB binary — far above any real signature stroke
  if (!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(img)) return null;
  return img;
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body.accept_token || !body.action || !body.signer_name || !body.signer_email) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = getServiceClient();

    const { data: contract, error: cErr } = await supabase
      .from('contracts')
      .select('*')
      .eq('accept_token', body.accept_token)
      .maybeSingle();
    if (cErr || !contract) {
      return new Response(JSON.stringify({ error: 'Contract not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (contract.status !== 'pending_signature') {
      return new Response(JSON.stringify({ error: `Contract already ${contract.status}` }), {
        status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // NOTE: contracts have no signing-deadline field (end_date is the contract term,
    // not an offer expiry), so unlike quote-sign there is no expiry gate here.

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null;

    // The appendices are PART of what is being signed — the body says "enligt
    // Bilaga 1" and the signing page renders them in full. So the signature must
    // cover them too: if Bilaga 1 is edited afterwards, the hash below no longer
    // matches and the version snapshot still holds what the customer actually saw.
    const { data: signedAppendices } = await supabase
      .from('contract_documents')
      .select('id, label, title, kind, body_markdown, file_name, file_url, sort_order')
      .eq('contract_id', contract.id)
      .order('sort_order', { ascending: true });
    const appendices = signedAppendices ?? [];

    // Content hash: SHA-256 of the canonical agreement content at signing time —
    // durable tamper-evidence stored on the signature row and shown on the certificate.
    const contentHash = await sha256Hex(JSON.stringify({
      title: contract.title,
      counterparty_name: contract.counterparty_name,
      body_markdown: contract.body_markdown ?? null,
      value_cents: contract.value_cents ?? 0,
      currency: contract.currency,
      version: contract.version ?? 1,
      // Only the content-defining fields, in the order the customer read them.
      appendices: appendices.map((a) => ({
        label: a.label ?? null,
        title: a.title ?? null,
        kind: a.kind,
        body_markdown: a.body_markdown ?? null,
        file_url: a.file_url ?? null,
      })),
    }));

    // Record signature
    const { error: sigErr } = await supabase.from('contract_signatures').insert({
      contract_id: contract.id,
      action: body.action,
      signer_name: body.signer_name,
      signer_email: body.signer_email,
      signature_data: body.signature_data ?? body.signer_name,
      signature_image: sanitizeSignatureImage(body.signature_image),
      content_hash: contentHash,
      comment: body.comment ?? null,
      ip_address: ip,
      user_agent: body.user_agent ?? req.headers.get('user-agent') ?? null,
    });
    if (sigErr) throw sigErr;

    // Update contract status
    const nowIso = new Date().toISOString();
    const updates: Record<string, unknown> =
      body.action === 'accept'
        ? {
            status: 'active',
            signed_at: nowIso,
            signer_name: body.signer_name,
            signer_email: body.signer_email,
            signer_ip: ip,
          }
        : {
            status: 'terminated',
            terminated_at: nowIso,
          };

    const { error: updErr } = await supabase.from('contracts').update(updates).eq('id', contract.id);
    if (updErr) throw updErr;

    // A signed contract becomes an active service the customer sees in their
    // portal. Idempotent + one-per-contract in the DB, so a re-sign or a
    // double-fire cannot mint a second. Never blocks the signing — a service
    // that failed to appear is a follow-up, a signature that failed is a lost
    // deal.
    let serviceError: string | null = null;
    if (body.action === 'accept') {
      const { error: subErr } = await supabase.rpc('create_subscription_from_contract', {
        p_contract_id: contract.id,
      });
      // Loud, not swallowed: for three weeks this failed on EVERY signature (a trigger
      // refused provider "contract") while this line logged and the response said 200 —
      // zero contract-born services in the fleet, and nothing reported it. The signature
      // still stands (a lost signature is a lost deal); the missing service is recorded
      // where an operator reads it, with the skill that repairs it.
      if (subErr) {
        serviceError = subErr.message;
        console.error('[contract-sign] SERVICE NOT CREATED for signed contract', contract.id, subErr.message);
        await supabase.from('agent_activity').insert({
          agent: 'system', skill_name: 'create_service_from_contract', status: 'failed',
          input: { contract_id: contract.id }, output: {},
          error_message: `Signing succeeded but the service was not created: ${subErr.message}. Repair: create_service_from_contract.`,
        }).then(() => undefined, () => undefined);
      }

      // The customer signed anonymously via a token and has no login — the
      // service they now own is unreachable without one. Bridge it: invite
      // them into the portal to set a password. Best-effort; the signature is
      // done regardless.
      try {
        const { data: general } = await supabase
          .from('site_settings').select('value').eq('key', 'general').maybeSingle();
        const siteUrl = (general?.value as { siteUrl?: string } | null)?.siteUrl ?? '';
        const portal = await provisionPortalAccount(supabase, {
          email: contract.counterparty_email,
          name: contract.counterparty_name,
          siteUrl,
          subjectNoun: 'service',
        });
        if (portal.status !== 'invited' && portal.status !== 'existing') {
          console.error('[contract-sign] portal invite:', portal.status, portal.reason ?? '');
        }
      } catch (e) {
        console.error('[contract-sign] portal invite skipped:', (e as Error).message);
      }
    }

    // Snapshot final version
    const { data: existing } = await supabase
      .from('contract_versions')
      .select('version_number')
      .eq('contract_id', contract.id)
      .order('version_number', { ascending: false })
      .limit(1);
    const nextNum = ((existing?.[0]?.version_number as number | undefined) ?? 0) + 1;
    await supabase.from('contract_versions').insert({
      contract_id: contract.id,
      version_number: nextNum,
      // The snapshot must be the whole agreement as signed — body AND appendices.
      // Storing only the contracts row left "enligt Bilaga 1" pointing at a live,
      // editable record instead of the frozen one.
      snapshot: { ...contract, ...updates, appendices } as never,
      reason: body.action === 'accept' ? 'signed_by_counterparty' : 'rejected_by_counterparty',
    });

    await supabase.from('audit_logs').insert({
      action: `contract.${body.action}`,
      entity_type: 'contract',
      entity_id: contract.id,
      metadata: {
        title: contract.title,
        signer_name: body.signer_name,
        signer_email: body.signer_email,
        counterparty: contract.counterparty_name,
        content_hash: contentHash,
      },
    });

    // Best-effort confirmation email
    try {
      const { data: settings } = await supabase
        .from('site_settings')
        .select('value')
        .eq('key', 'general')
        .maybeSingle();
      const siteName = (settings?.value as { site_name?: string } | null)?.site_name || 'FlowWink';

      if (body.action === 'accept') {
        const html = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f6f7f9;margin:0;padding:24px;color:#111">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e6e8ec">
    <h1 style="margin:0 0 8px;font-size:20px">Contract signed — ${escapeHtml(contract.title)}</h1>
    <p style="margin:0 0 16px;color:#4b5563">Hi ${escapeHtml(body.signer_name)}, thank you for signing. A copy of the agreement is available via your unique link.</p>
    <hr style="border:none;border-top:1px solid #e6e8ec;margin:24px 0"/>
    <p style="margin:0;font-size:12px;color:#9ca3af">Sent by ${escapeHtml(siteName)}</p>
  </div>
</body></html>`;
        await supabase.functions.invoke('email-send', {
          body: { to: body.signer_email, subject: `Contract signed — ${contract.title}`, html },
        });
      }

      const adminHtml = `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px">
  <h2>Contract ${escapeHtml(contract.title)} ${body.action === 'accept' ? 'SIGNED ✅' : 'DECLINED ❌'}</h2>
  <p><strong>Counterparty:</strong> ${escapeHtml(contract.counterparty_name)}</p>
  <p><strong>Signer:</strong> ${escapeHtml(body.signer_name)} &lt;${escapeHtml(body.signer_email)}&gt;</p>
  ${body.comment ? `<p><strong>Comment:</strong><br/>${escapeHtml(body.comment)}</p>` : ''}
</body></html>`;
      const { data: admins } = await supabase
        .from('user_roles')
        .select('user_id, profiles:profiles!inner(email)')
        .eq('role', 'admin')
        .limit(5);
      const adminEmails = ((admins as unknown as Array<{ profiles?: { email?: string } }>) || [])
        .map((r) => r?.profiles?.email)
        .filter(Boolean) as string[];
      if (adminEmails.length) {
        await supabase.functions.invoke('email-send', {
          body: { to: adminEmails, subject: `Contract ${body.action === 'accept' ? 'signed' : 'declined'}: ${contract.title}`, html: adminHtml },
        });
      }
    } catch (emailErr) {
      console.error('Email notification failed (non-fatal):', emailErr);
    }

    return new Response(JSON.stringify({ success: true, action: body.action, ...(serviceError ? { service_created: false } : {}) }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('contract-sign error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
