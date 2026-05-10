// Public contract signing endpoint.
// Atomically: records signature, updates contract status, sends confirmation emails.
// Bypasses JWT verification — auth is by accept_token + status check.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { getServiceClient } from '../_shared/supabase-clients.ts';

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
  comment?: string;
  user_agent?: string;
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

    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null;

    // Record signature
    const { error: sigErr } = await supabase.from('contract_signatures').insert({
      contract_id: contract.id,
      action: body.action,
      signer_name: body.signer_name,
      signer_email: body.signer_email,
      signature_data: body.signature_data ?? body.signer_name,
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
      snapshot: { ...contract, ...updates } as never,
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

    return new Response(JSON.stringify({ success: true, action: body.action }), {
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
