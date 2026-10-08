# Video meetings (WebMeet)

One link, no account. A salesperson creates a room and sends `/meet/<slug>`;
the customer clicks, sees their own camera, types a name and is in. A video
booking service creates the room by itself and puts the link in the
confirmation (see [`../processes/book-to-meet.md`](../processes/book-to-meet.md)).

## How a join works

1. The page reads the room (name, cap, locked) — a guest sees only those columns.
2. The guest sees their camera preview, can pick camera and microphone, and turns
   either off before joining.
3. **The door** (`webmeet-ice`) is asked once: is the room live, is it locked (the
   host still gets in), does it want a password (checked against a sha256 hash —
   the password is never at rest in clear text), and which relays carry the call.
4. The browser joins the Realtime channel; if the room already holds
   `max_participants`, it leaves again with "This meeting is full".
5. Peer-to-peer WebRTC between everyone in the room. Screen sharing replaces the
   camera track.

The host (the signed-in user who created the room) sees **Lock** and **End for
everyone** inside the call. Locked rooms admit nobody new until unlocked.

## TURN: optional, and the difference between "works at home" and "works at the customer's office"

STUN alone fails behind symmetric NAT and most corporate firewalls — the single
most common "video does not connect" in a sales call. **Cloudflare Calls** gives
TURN with short-lived credentials and a 1 TB/month free tier.

- Cloudflare dashboard → **Calls → TURN Service → Create**. You get a *TURN Key
  ID* and an *API Token* for that key.
- Per instance:

  ```bash
  supabase secrets set CLOUDFLARE_TURN_KEY_ID=<key id> CLOUDFLARE_TURN_API_TOKEN=<token> --project-ref <ref>
  ```

- Integrations shows **Cloudflare Calls (TURN)** as configured; the shield icon in
  the meeting header means the relay is on for that call.

Without the key the door answers `provider: 'stun'` and the call still works on
open networks. `/admin/webmeet` shows a banner until the key is there. The
integration is optional by design (fail forward, don't gate) — but for a
business that sends links to customers, treat it as the first thing to set up.

## Limits

- **Peer-to-peer mesh**: every browser sends one stream per other participant.
  Good to about 5 people; `max_participants` is enforced at join (2–16).
  Larger rooms need an SFU — the planned next step is Cloudflare Realtime SFU
  behind the same link.
- No recording, no in-call chat yet.
- Signaling rides Supabase Realtime (`webmeet:<slug>` broadcast + presence); no
  media touches the database.

## Skills

`create_webmeet_room` (name, password, cap, expiry), `end_webmeet_room`,
`list_webmeet_rooms`. The URL returned is relative (`/meet/<slug>`); prefix the
site origin when sending it.
