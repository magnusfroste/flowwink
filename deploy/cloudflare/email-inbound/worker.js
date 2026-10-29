/**
 * FlowWink inbound mail — Cloudflare Email Routing Worker.
 *
 * Email Routing hands every mail for the routed addresses to `email()`. This
 * Worker parses the MIME message (postal-mime, the parser Cloudflare's own
 * docs use) and posts the fields to the instance's email router:
 *
 *   POST <FLOWWINK_INBOUND_URL>          (…/functions/v1/email-webhook/inbound)
 *   x-webhook-secret: <FLOWWINK_INBOUND_SECRET>   (= EMAIL_INBOUND_SECRET in Supabase)
 *
 * The router files it on the customer it belongs to, exactly like a Gmail
 * message through Composio (_shared/email/ingest-message.ts). If the router
 * refuses or is down, the Worker rejects the mail so the sender gets a bounce
 * instead of a silent loss; FORWARD_TO, when set, also keeps a copy in a
 * verified mailbox.
 *
 * One Worker per instance: the URL and the secret are per Supabase project.
 */
import PostalMime from 'postal-mime';

export default {
  async email(message, env) {
    const raw = await new Response(message.raw).arrayBuffer();
    const mail = await PostalMime.parse(raw);

    const payload = {
      from: message.from,
      to: message.to,
      subject: mail.subject || '',
      text: mail.text || '',
      html: mail.html || '',
      message_id: mail.messageId || message.headers.get('message-id') || '',
      in_reply_to: mail.inReplyTo || message.headers.get('in-reply-to') || '',
      references: mail.references || message.headers.get('references') || '',
      headers: (mail.headers || []).map((h) => ({ key: h.key, value: h.value })),
    };

    if (env.FORWARD_TO) {
      try {
        await message.forward(env.FORWARD_TO);
      } catch (err) {
        console.log('forward failed:', String(err));
      }
    }

    let res;
    try {
      res = await fetch(env.FLOWWINK_INBOUND_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-webhook-secret': env.FLOWWINK_INBOUND_SECRET,
          'x-inbound-provider': 'cloudflare',
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      message.setReject(`Temporary failure delivering to FlowWink: ${String(err)}`);
      return;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.log(`FlowWink refused (${res.status}): ${body.slice(0, 300)}`);
      message.setReject(`FlowWink could not accept this message (${res.status})`);
    }
  },
};
