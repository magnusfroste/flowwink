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

The host sees **Lock**, **Waiting room** and **End for everyone** inside the
call. Locked rooms admit nobody new until unlocked. The host is the signed-in
user who created the room, an admin, or — for a room with no named host, such
as the room a video booking makes — anyone who may use WebMeet in the admin.

## Starting a call from where the team is

- **River**: the composer has **Start video call**. It makes a room (named after
  what you typed, or "Anna's call"), posts "Anna started a video call about …
  Join: <link>" to the feed and opens the room for you in a new tab. Every post
  or reply that carries a `/meet/` link — this one, an unanswered ring from
  "Here now", a link an agent pasted — shows a **Join video call** button.
- **FlowWork**: the camera icon in the header starts a room named after the
  chat you are in, copies the link and opens the room in a new tab; paste the
  link to whoever you want in.
- **Here now** (sidebar): tap a colleague's avatar to ring them directly.

All three are the same room as `/admin/webmeet` → Start meeting; they only
save the walk. They are hidden when the WebMeet module is off.

## The waiting room: one at a time

A clinic sends the next patient a link. They open it on time and must wait
until the doctor is done with the one before, not walk into that call. Switch
**Waiting room** on when the room is made (More options), inside the call, or
with `p_waiting_room: true` from the agent.

What the guest sees: the same pre-join screen, the button says **Ask to join**,
and after it they wait with their camera still on. The card says whether the
host has arrived ("Waiting for the host to let you in" / "The host has not
arrived yet") and they can leave the queue. Nothing else to do; they are let
in automatically.

What the host sees: a strip above the stage, "Anna wants to join" with **Let
in** and **Not now**, and one soft note when someone new arrives. No modal:
the host finishes the current consultation first. "Not now" tells the guest
"The host could not let you in right now."

How it holds: the door writes a *knock* (`webmeet_knocks`) and answers "wait"
with its id. The host's answer goes into that row through
`answer_webmeet_knock`; the door hands out ICE servers only for a knock the
host admitted (within fifteen minutes). The lobby channel
(`webmeet-lobby:<slug>`) is the doorbell — who is waiting, whether the host is
there, "ask again now" — never the lock: the guest's browser asks the door
again on the host's answer and every eight seconds regardless, so a missed
broadcast costs seconds, not the appointment. Nobody but the door and the
function can read or write the knock table. Knocks older than a day are swept
when the next one arrives.

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

- **The signalling channel is open to anyone with the link.** The door gates
  the relay and the admission; the Realtime channel the call rides on is a
  public channel named after the slug, as it was with the password. A guest
  with developer tools and the know-how could join the mesh on STUN alone. The
  hardening is private Realtime channels with a per-guest token from the door —
  a later step, worth taking before a clinic depends on it.
- **Peer-to-peer mesh**: every browser sends one stream per other participant.
  Good to about 5 people; `max_participants` is enforced at join (2–16).
  Larger rooms need an SFU — the planned next step is Cloudflare Realtime SFU
  behind the same link.
- No recording, no in-call chat yet.
- Signaling rides Supabase Realtime (`webmeet:<slug>` broadcast + presence); no
  media touches the database.

## Skills

`create_webmeet_room` (name, password, cap, expiry, waiting room),
`end_webmeet_room`, `list_webmeet_rooms`. The URL returned is relative (`/meet/<slug>`); prefix the
site origin when sending it.
