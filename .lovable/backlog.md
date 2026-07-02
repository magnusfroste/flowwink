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

## Architecture

### Migrate channels to ChannelAdapter contract
**Status:** TBD
**Context:** Vi har en formaliserad target-arkitektur i `docs/architecture/channel-adapter-contract.md` (inspirerad av OpenClaws ChannelPlugin). Voice följer redan mönstret via `VoiceProvider`. Telegram, SMS och web saknar adapter och har outbound hardcoded i `useSupportConversations` / edge functions.

**Faser:**
- **Fas 2:** Skapa `src/lib/channels/types.ts` + `registry.ts`. Wrappa `voice` som referens-impl. Migrera `telegram` (flytta outbound till adapter).
- **Fas 3:** 46elks `messaging` sub-adapter för SMS. `web` adapter formaliserar broadcast-fallback. Drop hardcoded channel-checks i Live Support UI.
- **Fas 4:** Nya kanaler (WhatsApp, Slack, email) byggs adapter-first. Heartbeat-dashboard i `/admin/integrations`.

**Beslut:** Inte refaktorera idag — kontraktet är dokumenterat så vi inte uppfinner nya one-off-kanaler. Plockas upp när vi lägger till WhatsApp/Slack eller behöver heartbeat-vy.

## Accounting

### Restrict journal entry deletion to last entry only
**Status:** TBD (relevant när accounting går i produktion)
**Context:** Just nu tillåter `manage_journal_entry action=delete` att vilken `draft`-entry som helst raderas (posted kräver `void`). För en riktig bokförare/redovisningsbyrå är detta för öppet — audit-trail och verifikationsnummer-sekvenser förutsätter att man bara kan ångra den *senaste* posten.

**Regel att införa:**
- Delete tillåts endast om entry_id = senaste `journal_entries` (per journal/serie, sorterat på `reference_number` eller `created_at`).
- Alternativt: delete endast tillåten inom X minuter efter create (undo-fönster).
- Posted entries: fortsatt bara `void` (reversal), aldrig delete.
- UI: "Delete" knapp visas bara på sista raden; äldre entries visar bara "Void".

**Beslut:** Avvakta tills accounting används skarpt av en kund. Under utveckling/demo är fri delete praktiskt för städning.
