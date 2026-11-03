/**
 * FlowWink inbound mail — Cloudflare Email Routing Worker.
 *
 * No dependencies: paste this file into a new "Hello World" Worker in the
 * Cloudflare dashboard (Workers & Pages → Create → Start with Hello World →
 * Edit code), then set two values under the Worker's Settings → Variables and
 * Secrets:
 *
 *   FLOWWINK_INBOUND_URL     (text)    https://<project-ref>.supabase.co/functions/v1/email-webhook/inbound
 *   FLOWWINK_INBOUND_SECRET  (secret)  the same value as EMAIL_INBOUND_SECRET in Supabase
 *   FORWARD_TO               (text, optional) a verified address that also gets a copy
 *
 * Then route the address to it: the domain → Email → Email Routing → Routing
 * rules → Send to a Worker.
 *
 * The Worker hands the raw message to FlowWink's email router, which parses it
 * and files it on the customer it belongs to — the same path a Gmail message
 * takes. When the router refuses or is unreachable, the mail is rejected so the
 * sender gets a bounce instead of a silent loss.
 */
export default {
  // Opening the Worker's URL in a browser is not an error: it receives mail only.
  async fetch() {
    return new Response('FlowWink inbound mail Worker: receives mail through Email Routing, not web requests.\n', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },

  async email(message, env) {
    const raw = await new Response(message.raw).arrayBuffer();

    let res;
    try {
      res = await fetch(env.FLOWWINK_INBOUND_URL, {
        method: 'POST',
        headers: {
          'content-type': 'message/rfc822',
          'x-webhook-secret': env.FLOWWINK_INBOUND_SECRET,
          'x-inbound-provider': 'cloudflare',
          'x-envelope-from': message.from,
          'x-envelope-to': message.to,
        },
        body: raw,
      });
    } catch (err) {
      message.setReject(`Temporary failure delivering to FlowWink: ${String(err)}`);
      return;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.log(`FlowWink refused (${res.status}): ${body.slice(0, 300)}`);
      message.setReject(`FlowWink could not accept this message (${res.status})`);
      return;
    }

    if (env.FORWARD_TO) {
      try {
        await message.forward(env.FORWARD_TO);
      } catch (err) {
        console.log('forward failed:', String(err));
      }
    }
  },
};
