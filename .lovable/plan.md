# Clawable Operator — end-to-end onboarding flow

Ja, exakt så ska det fungera. Vi har redan alla pusselbitar — vi behöver bara koppla ihop dem och göra flödet uppenbart i UI:t.

## Det fullständiga flödet (så här ska det vara)

```text
1. Admin → Federation → Agent Invites
   └─ Välj "Clawable Operator"-mall
   └─ Generera prompt (skapar MCP-nyckel + auto-registrerar peer)

2. Admin → klistrar in prompten i en tom OpenClaw-instans
   └─ OpenClawn använder MCP-nyckeln för att läsa briefing/skills/modules
   └─ Den dyker upp som "active" peer (auto-registrerad i steg 1)

3. Admin → Federation → klickar på peer-kortet
   └─ Lägger till URL + gateway_token för outbound
   └─ Lägger till en outbound channel (transport: openresponses) via PeerChannelsInline

4. Admin → Clawable Chat
   └─ Peer dyker upp i dropdown
   └─ "New session" + skicka uppdrag → clawable-chat edge function
   └─ Outbound POST till peer:s /v1/responses med previous_response_id-chaining
```

Idag finns alla delar — men flödet är inte synligt eller styrt. En admin förstår inte att Agent Invites + Federation peer-edit + Clawable Chat hör ihop som ett flöde.

## Det som behöver byggas

### 1. Ny mission-mall: "Clawable Operator" i `AgentInvites.tsx`

En ny `operator`-kategori-mall optimerad för OpenClaw-instanser som ska köras via `/v1/responses`:

- **id**: `clawable-operator`
- **name**: "Clawable Operator"
- **icon**: `Snowflake` (samma som ClawablePage använder)
- **description**: "Standalone OpenClaw — receives missions via Clawable Chat over /v1/responses"
- **instructions**: Kort, mission-driven prompt som förklarar:
  - Du är en standalone operator som tar emot uppdrag via `/v1/responses`
  - Använd MCP-nyckeln för att läsa platform-context (briefing/skills/modules)
  - Vänta på instruktioner via response-chaining (varje session = en thread)
  - Registrera dig själv genom att kalla briefing-resursen direkt vid uppstart
- **focusResources**: `flowwink://briefing`, `flowwink://skills`, `flowwink://modules`
- **focusTools**: minimal — bara observation-tools, eftersom instruktioner kommer via chat
- **requiredModules**: ingen (alltid tillgänglig)

### 2. Förbättra "Generated Prompt" för Clawable-mallar

Lägg till en tydlig "Next Steps"-sektion längst ner i den genererade prompten när `id === 'clawable-operator'`:

```text
## After this agent connects

1. It will appear as an active peer in Federation
2. Edit the peer to add: Base URL + gateway_token (Bearer token the peer expects on incoming /v1/responses calls)
3. Add an outbound channel (transport: openresponses)
4. Go to Clawable Chat → select this peer → start sending missions
```

### 3. Success-skärm efter "Generate" — visa nästa steg

Efter genererad prompt, visa ett litet "Next Steps"-kort med deep-links:

- ✅ MCP key created (visad)
- ✅ Peer auto-registered: `{agentName}` (länk: Federation)
- ⏳ Add URL + gateway_token to peer (knapp → `/admin/federation`)
- ⏳ Send first mission (knapp → `/admin/clawable`)

Detta gör att admin förstår exakt var den ska klicka härnäst — istället för att bara få en prompt och undra "vad nu?".

### 4. Liten justering i `ClawablePage.tsx` toolbar

När en peer är vald men saknar `gateway_token`, finns redan en röd varning. Lägg till en knapp "Open in Federation" intill den, så admin snabbt kan komma till peer-edit för att fylla i resten.

## Tekniska detaljer

**Filer som ändras:**
- `src/components/admin/federation/AgentInvites.tsx` — ny mall + Next Steps-kort
- `src/pages/admin/ClawablePage.tsx` — deep-link i missing-token-varningen

**Inga DB-ändringar.** Vi använder redan:
- `a2a_peers` (auto-upsert i `handleGenerate`)
- `api_keys` (skapas via `useCreateApiKey`)
- `clawable_sessions` + `clawable_messages` (för chatten)
- `federation_connections` (för outbound-kanalen, hanteras av `PeerChannelsInline`)

**Inga edge function-ändringar.** `clawable-chat`, `mcp-server`, `clawable-list-models` fungerar redan.

## Vad detta INTE löser (medvetet)

- **Auto-fyll URL/gateway_token vid invite**: Vi kan inte gissa peer-URL:en vid generate-tid (admin vet inte var OpenClawn kommer hostas). Det måste fyllas i efter att peer:n är uppe.
- **Auto-skapa outbound channel**: Samma anledning — kräver URL.

Detta är OK eftersom Next Steps-kortet gör det glasklart vad admin ska göra i vilken ordning.
