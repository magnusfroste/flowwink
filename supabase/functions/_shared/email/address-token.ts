// The key that proves a link about an e-mail address came out of a mail we
// sent to it (2026-11-23).
//
// HMAC-SHA256(lower(email), service key), first 32 hex characters — the same
// figure email-send stamps into List-Unsubscribe and email-webhook checks. It
// is derived, never stored: nothing in the database to leak, nothing to null
// out, and it holds for an address as long as the instance's key does.
//
// Three things were open to anyone who knew an address before this: leaving a
// newsletter on someone's behalf (the link in the mail carried the address and
// nothing else), and reading or deleting a subscriber's data (the "request
// access" answer handed the secret back to the browser instead of mailing it).

async function hmacHex(text: string): Promise<string> {
  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function addressToken(email: string): Promise<string> {
  return (await hmacHex(email.trim().toLowerCase())).slice(0, 32);
}

/** Constant-time: the comparison never says how much of a guess was right. */
export async function addressTokenMatches(email: string | null | undefined, token: string | null | undefined): Promise<boolean> {
  if (!email || !token) return false;
  const expected = await addressToken(email);
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}
