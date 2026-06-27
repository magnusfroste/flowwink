# Backlog (TBD)

## Live Support

### Claimed ticket ownership policy
**Status:** TBD
**Context:** Idag släpper `support_agent_offline_release`-triggern alla `with_agent`-chattar tillbaka till `waiting_agent` så snart agenten går offline. Det är bra för att inte tappa kunder om någon stänger laptopen, men irriterande vid korta avbrott (reload, kort paus).

**Alternativ att utvärdera:**
- **A. Sticky ownership** — claim ligger kvar tills ärendet stängs eller annan agent re-claimar. Offline-ärenden visas i separat "unattended"-lista.
- **B. Grace period** — släpp tillbaka till Waiting först efter t.ex. 5 min offline (cron istället för trigger).
- **C. Behåll nuvarande** — pragmatiskt: om agent är borta ska kunden inte vänta på en specifik person.

**Beslut:** Avvakta. Det finns en poäng att ärenden återgår till Waiting om de inte är stängda — säkrar att ingen kund glöms bort.
