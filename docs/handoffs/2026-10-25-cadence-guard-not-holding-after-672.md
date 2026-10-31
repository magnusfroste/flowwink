# Kadensvakten håller inte efter #672 (Clawable-sessionen, 2026-10-25)

**Symptom.** liteit-objectivet `f362a3ec…` har `cadence {max: 1, per: 'week', counts: 'write_blog_post'}`
men publicerade fem inlägg på sju dagar: 18, 19, 22, 23 och 24 okt. Alla kom från heartbeat-körningar
med `agent = flowpilot`:

| Datum | Trace |
|---|---|
| 2026-10-18 06:00 | hb_mvdf1thf_cgwtbw |
| 2026-10-19 06:00 | hb_mveuhof8_qmpe44 |
| 2026-10-22 06:00 | hb_mvj4t824_pfglyh |
| 2026-10-23 06:00 | hb_mvkk92hi_6inudd |
| 2026-10-24 06:00 | hb_mvlzoxrt_03g60v |

**Före #672** spärrade vakten för mycket (MCP-prov räknades som FlowPilots leverans).
**Efter #672** (`.eq('agent', 'flowpilot')` i `_shared/pilot/reason.ts`) verkar den spärra ingenting.

**Trolig orsak.** `write_blog_post`-raden i `agent_activity` stämplas med ett annat `agent`-värde än
`'flowpilot'` när heartbeaten kör skillen via agent-execute (`effectiveAgent` / `agent_type`,
runt rad 771–780 i `agent-execute/index.ts`). Då matchar filtret noll rader och kvoten ser alltid
orörd ut. Värt att läsa vilket `agent`-värde de fem raderna faktiskt har.

**Åtgärd hittills.** Objectivet är PAUSAT via `manage_objective pause` (notering i `operator_log`),
så liteit inte får ett inlägg om dagen. När vakten är verifierad: `manage_objective resume`.

`search_web` fungerar nu (SearXNG). Tack för den delen.
