// newsletter send — sends a newsletter to all confirmed subscribers via the
// provider-agnostic `email-send` router. Provider selection (SMTP / Resend)
// lives in `email-send` — this handler only handles list expansion,
// per-recipient tracking pixel rewriting, link click rewriting, and status.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getServiceClient } from '../_shared/supabase-clients.ts';
import { readAllRows } from '../_shared/read-all-rows.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-chat-session, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SendNewsletterRequest {
  newsletter_id: string;
}

interface NewsletterTrackingConfig {
  enableOpenTracking: boolean;
  enableClickTracking: boolean;
}

/**
 * Core send routine — reusable from both the interactive `send` route (admin JWT)
 * and the cron-triggered `dispatch-scheduled` route (service/anon bearer).
 * No auth checks here; the caller is responsible for gating access.
 */
export interface SendNewsletterOutcome {
  ok: true;
  /** Deliveries the provider accepted for this newsletter, all runs combined. */
  sent_count: number;
  total_subscribers: number;
  /** Accepted by the provider in THIS run. */
  delivered_now: number;
  /** Already claimed by an earlier run — deliberately not mailed again. */
  skipped_already_claimed: number;
  /** Rejected by the provider in this run; safe to retry. */
  failed_now: number;
  /** 'sent' only when nothing is outstanding. Otherwise 'partial'. */
  status: 'sent' | 'partial';
  /** Set when the subscriber list itself could not be read to the end. */
  recipients_truncated: boolean;
  /** Claimed by some run that never recorded an outcome. Never auto-retried. */
  unknown_outcome: number;
}

export async function sendNewsletterCore(
  supabase: ReturnType<typeof createClient>,
  newsletter_id: string,
): Promise<SendNewsletterOutcome | { ok: false; status: number; error: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  const { data: integrationSettings } = await supabase
    .from("site_settings").select("value").eq("key", "integrations").maybeSingle();
  const resendSettings = (integrationSettings?.value as any)?.resend;
  const trackingConfig: NewsletterTrackingConfig =
    resendSettings?.config?.newsletterTracking || {
      enableOpenTracking: false,
      enableClickTracking: false,
    };

  const { data: newsletter, error: newsletterError } = await supabase
    .from("newsletters").select("*").eq("id", newsletter_id).single();
  if (newsletterError || !newsletter) {
    return { ok: false, status: 404, error: "Newsletter not found" };
  }
  if (newsletter.status === "sent") {
    return { ok: false, status: 400, error: "Newsletter already sent" };
  }

  await supabase.from("newsletters").update({ status: "sending" }).eq("id", newsletter_id);

  // Recipients, paginated. Here the WHOLE population genuinely is the question —
  // "everyone confirmed" has no smaller form — so this is the third cure, not
  // the first one reached for. The old `.select(...).eq('status','confirmed')`
  // stopped at PostgREST's silent 1000-row cap: subscriber 1001 onward simply
  // did not exist as far as this function was concerned, and the run still
  // stamped the newsletter `sent`.
  //
  // `email` is the order key because it is the table's unique column — an
  // unstable sort makes rows slip between pages, which in a mailing means
  // someone is skipped and someone else is claimed twice.
  const {
    rows: subscribers,
    error: subError,
    truncated: recipientsTruncated,
  } = await readAllRows<{ email: string; name: string | null }>(
    supabase,
    "newsletter_subscribers",
    {
      columns: "email, name",
      orderBy: "email",
      filter: (q: any) => q.eq("status", "confirmed"),
      // 200k confirmed subscribers is far past what this edge function's
      // wall-clock budget can mail in one pass anyway; the ceiling exists so a
      // runaway table cannot spin, and `truncated` makes it audible.
      pageSize: 1000,
      maxPages: 200,
    },
  );
  if (subError) {
    await supabase.from("newsletters").update({ status: "failed" }).eq("id", newsletter_id);
    return { ok: false, status: 500, error: `Failed to fetch subscribers: ${subError}` };
  }
  if (subscribers.length === 0) {
    await supabase.from("newsletters").update({ status: "draft" }).eq("id", newsletter_id);
    return { ok: false, status: 400, error: "No subscribers to send to" };
  }

  // Re-open the recipients a previous run tried and the provider rejected.
  // Server-side, so no read of the ledger can be truncated. Rows left in
  // 'pending' are NOT reopened: their outcome is unknown, and an unknown
  // outcome must resolve toward not mailing the person a second time.
  const { error: reopenError } = await supabase
    .from("newsletter_deliveries")
    .delete()
    .eq("newsletter_id", newsletter_id)
    .eq("status", "failed");
  if (reopenError) {
    console.warn(
      `[newsletter-send] could not reopen failed deliveries for ${newsletter_id}: ${reopenError.message} — ` +
      `previously failed recipients stay claimed and will be skipped this run`,
    );
  }

  // siteUrl lives INSIDE the `general` settings row — there has never been a
  // row keyed 'siteUrl'. The old lookup silently returned nothing, so every
  // unsubscribe link fell through to the raw functions URL on supabase.co
  // instead of the operator's own domain. Same column-vs-row shape as the
  // `.select('modules')` bug: the query succeeds, the value is just absent.
  const { data: generalSetting } = await supabase
    .from("site_settings").select("value").eq("key", "general").maybeSingle();
  const siteUrl = (((generalSetting?.value as any)?.siteUrl as string) || "").replace(/\/+$/, "");
  const trackingBaseUrl = `${supabaseUrl}/functions/v1/newsletter/track`;
  const linkTrackingBaseUrl = `${supabaseUrl}/functions/v1/newsletter/link`;

  const rewriteLinksForTracking = async (
    html: string, newsletterId: string, recipientEmail: string,
  ): Promise<string> => {
    if (!trackingConfig.enableClickTracking) return html;
    const linkRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
    const matches = [...html.matchAll(linkRegex)];
    let processedHtml = html;
    for (const match of matches) {
      const originalUrl = match[1];
      if (originalUrl.includes("newsletter/subscribe") || originalUrl.includes("newsletter/manage")) continue;
      const { data: linkRecord, error: linkError } = await supabase
        .from("newsletter_link_clicks")
        .insert({ newsletter_id: newsletterId, recipient_email: recipientEmail, original_url: originalUrl })
        .select("link_id").single();
      if (linkError || !linkRecord) continue;
      const trackingUrl = `${linkTrackingBaseUrl}?l=${linkRecord.link_id}`;
      processedHtml = processedHtml.replaceAll(`href="${originalUrl}"`, `href="${trackingUrl}"`);
      processedHtml = processedHtml.replaceAll(`href='${originalUrl}'`, `href='${trackingUrl}'`);
    }
    return processedHtml;
  };

  let deliveredNow = 0;
  let failedNow = 0;
  let skippedAlreadyClaimed = 0;
  for (const subscriber of subscribers as any[]) {
    // Claim the address BEFORE composing or sending. The unique index decides:
    // an empty result means another run (or an earlier pass of this one) already
    // owns this recipient for this newsletter, so it is not mailed again. This
    // is the whole reason a half-finished send is now safe to re-run.
    const { data: claim, error: claimError } = await supabase
      .from("newsletter_deliveries")
      .upsert(
        { newsletter_id, recipient_email: subscriber.email, status: "pending" },
        { onConflict: "newsletter_id,recipient_email", ignoreDuplicates: true },
      )
      .select("id");
    if (claimError) {
      // Could not establish the claim ⇒ cannot promise we would not double-send
      // on the retry. Skip rather than risk it, and let the run end 'partial'.
      console.error(`[newsletter-send] claim failed for ${subscriber.email}:`, claimError.message);
      failedNow++;
      continue;
    }
    const deliveryId = (claim as any[])?.[0]?.id;
    if (!deliveryId) {
      skippedAlreadyClaimed++;
      continue;
    }

    const markDelivery = async (status: "sent" | "failed", errorMessage?: string) => {
      const { error } = await supabase
        .from("newsletter_deliveries")
        .update({
          status,
          error_message: errorMessage ?? null,
          sent_at: status === "sent" ? new Date().toISOString() : null,
        })
        .eq("id", deliveryId);
      // A send we cannot write down is worse than one we can: the row stays
      // 'pending', which means "never retried" — the safe side of the ambiguity.
      if (error) console.error(`[newsletter-send] could not record ${status} for ${subscriber.email}:`, error.message);
    };

    // Everything before the handover is composition — nothing has left the
    // building yet, so a throw there is a plain failure and safe to retry. Once
    // the request is in flight we can no longer tell a delivered mail from an
    // undelivered one, and the row must stay ambiguous instead.
    let handedToProvider = false;
    try {
      let trackingPixel = "";
      if (trackingConfig.enableOpenTracking) {
        const { data: trackingRecord, error: trackErr } = await supabase
          .from("newsletter_email_opens")
          .insert({ newsletter_id, recipient_email: subscriber.email })
          .select("tracking_id").single();
        // Öppningsspårning är inte utskicket: logga och skicka ändå. Ett
        // medvetet beslut som SYNS är inte ett svalt fel.
        if (trackErr) console.error(`[newsletter] open tracking insert failed: ${trackErr.message}`);
        if (trackingRecord) {
          trackingPixel = `<img src="${trackingBaseUrl}?t=${trackingRecord.tracking_id}" width="1" height="1" alt="" style="display:none;" />`;
        }
      }
      const personalUnsubscribe = siteUrl
        ? `${siteUrl}/newsletter/manage?action=unsubscribe&email=${encodeURIComponent(subscriber.email)}`
        : `${supabaseUrl}/functions/v1/newsletter/subscribe?action=unsubscribe&email=${encodeURIComponent(subscriber.email)}`;

      const contentHtml = (newsletter as any).content_html || "<p>No content</p>";
      const processedContent = await rewriteLinksForTracking(contentHtml, newsletter_id, subscriber.email);

      // Deliberately a FRAGMENT, not a document: `email-send` wraps it in the
      // operator's branded shell (logo, brand colour, site footer) — the same
      // frame every other transactional mail gets. Emitting <html> here would
      // opt the newsletter out of that shell and leave it the only unbranded
      // mail the platform sends.
      const html = `
        ${processedContent}
        <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #eeeeee;font-size:12px;line-height:18px;color:#888888;">
          <a href="${personalUnsubscribe}" style="color:#888888;">Unsubscribe</a>
        </p>
        ${trackingPixel}
      `;

      handedToProvider = true;
      const { data: sendData, error: sendErr } = await supabase.functions.invoke("email-send", {
        body: {
          to: subscriber.email,
          subject: (newsletter as any).subject,
          html,
          tags: { source: "newsletter-send", newsletter_id },
        },
      });
      if (sendErr || !(sendData as any)?.success) {
        const reason = String((sendErr as any)?.message ?? (sendData as any)?.error ?? "unknown provider error");
        console.error(`[newsletter-send] failed for ${subscriber.email}:`, reason);
        await markDelivery("failed", reason);
        failedNow++;
        continue;
      }
      await markDelivery("sent");
      deliveredNow++;
    } catch (emailError) {
      console.error(`[newsletter-send] Failed to send to ${subscriber.email}:`, emailError);
      if (handedToProvider) {
        // Unknown outcome. The row stays 'pending' — claimed, never auto-retried
        // — and it is deliberately NOT counted as failed: calling it failed would
        // put the newsletter in 'partial' with a Resume button that skips this
        // very recipient, which is a dead end dressed up as an action.
        continue;
      }
      await markDelivery("failed", String((emailError as any)?.message ?? emailError));
      failedNow++;
    }
  }

  // sent_count is recounted from the ledger, not from this run's tally — a
  // resumed send must report everyone who has the mail, not just the ones this
  // pass added. `head: true` counts server-side, so no row cap applies.
  const { count: ledgerSent, error: countError } = await supabase
    .from("newsletter_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("newsletter_id", newsletter_id)
    .eq("status", "sent");
  const sentCount = countError ? deliveredNow : (ledgerSent ?? deliveredNow);

  // Recipients claimed by some run that never came back to say what happened —
  // a worker killed between the provider call and the write. They are counted
  // and reported, but they do NOT hold the newsletter in 'partial': nothing an
  // operator can press would resolve them (re-sending is exactly what we refuse
  // to do on an unknown outcome), and a status nobody can clear is a badge, not
  // information. The ledger is where they are answerable.
  const { count: unknownOutcome } = await supabase
    .from("newsletter_deliveries")
    .select("id", { count: "exact", head: true })
    .eq("newsletter_id", newsletter_id)
    .eq("status", "pending");
  if ((unknownOutcome ?? 0) > 0) {
    console.warn(
      `[newsletter-send] ${newsletter_id}: ${unknownOutcome} recipient(s) claimed with no ` +
      `recorded outcome — see newsletter_deliveries. They are not re-sent automatically.`,
    );
  }

  // The honest stamp. `sent` is a claim that the list was reached, and it is
  // only made when something can still be DONE about the rest: no provider
  // failures, and a subscriber list we could read to the end. Anything else is
  // `partial`, which is re-runnable precisely because the ledger exists.
  // Unknown outcomes are reported separately, above — they are outstanding but
  // not actionable, so they do not drive this stamp.
  const outstanding = failedNow > 0 || recipientsTruncated;
  const finalStatus: "sent" | "partial" = outstanding ? "partial" : "sent";

  await supabase.from("newsletters").update({
    status: finalStatus,
    sent_at: new Date().toISOString(),
    sent_count: sentCount,
    scheduled_at: null,
    unique_opens: 0, open_count: 0, unique_clicks: 0, click_count: 0,
  }).eq("id", newsletter_id);

  if (recipientsTruncated) {
    console.error(
      `[newsletter-send] ${newsletter_id}: the confirmed-subscriber list hit the page ceiling — ` +
      `there are recipients this run never saw. Marked 'partial'; re-run to continue.`,
    );
  }

  return {
    ok: true,
    sent_count: sentCount,
    total_subscribers: subscribers.length,
    delivered_now: deliveredNow,
    skipped_already_claimed: skippedAlreadyClaimed,
    failed_now: failedNow,
    status: finalStatus,
    recipients_truncated: recipientsTruncated,
    unknown_outcome: unknownOutcome ?? 0,
  };
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = getServiceClient();

    // Auth: admin only. This function is deployed --no-verify-jwt, so the
    // admin check MUST be enforced here.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const bearer = authHeader.replace("Bearer ", "").trim();
    // service_role escape: the FlowWink gateway / agent-execute invokes edge: skills
    // with `Bearer ${SERVICE_ROLE_KEY}` (no end-user JWT), so execute_newsletter_send
    // over the operator surface must accept the service key or it 401s ("Unauthorized").
    // The service key is already an admin-equivalent trust boundary.
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!(serviceKey && bearer === serviceKey)) {
      const { data: userData, error: authError } = await supabase.auth.getUser(bearer);
      if (authError || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: hasAdmin } = await supabase.rpc("can_access_module", {
        _user_id: userData.user.id, _module_id: "newsletter",
      });
      if (!hasAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden — requires the \"newsletter\" module (Users → Role Permissions)" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { newsletter_id }: SendNewsletterRequest = await req.json();
    const result = await sendNewsletterCore(supabase as any, newsletter_id);
    if (!result.ok) {
      return new Response(JSON.stringify({ error: result.error }), {
        status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    // The caller is told the same thing the row now says. "success: true" alone
    // used to be indistinguishable between "all 1400 got it" and "1000 got it
    // and the rest were never seen".
    return new Response(
      JSON.stringify({
        success: true,
        status: result.status,
        sent_count: result.sent_count,
        total_subscribers: result.total_subscribers,
        delivered_now: result.delivered_now,
        skipped_already_claimed: result.skipped_already_claimed,
        failed_now: result.failed_now,
        recipients_truncated: result.recipients_truncated,
        unknown_outcome: result.unknown_outcome,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: any) {
    console.error("[newsletter-send] Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

