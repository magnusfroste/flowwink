---
name: Anthropic MCP best practices applied
description: Mappning av Anthropic's "Writing effective tools for agents" (Sept 2025) mot FlowWinks MCP-implementation. Vad vi följer, vad vi gör annorlunda, vad vi medvetet skjuter på.
type: reference
---

# Anthropic MCP Best Practices — applied

Källa: https://www.anthropic.com/engineering/writing-tools-for-agents (Sept 2025)
plus Nov 2025 advanced tool-use update.

## ✅ Följer

| Princip | Vår implementation |
|---|---|
| Few high-impact tools, not API mirrors | Composite-skills (`hire_application`, `place_order`, `record_pos_sale_v2`). Generic CRUD blockerad via `DEDICATED_SKILL_TABLES` på domänbordens. |
| Namespace tools | Prefix per verb (`manage_*`, `list_*`, `book_*`) + kategori-prefix i MCP-descriptionen `[crm] ...`. |
| Self-describing tools | 187/187 exposed skills har `Use when:` + `NOT for:` markörer. Enforced av skill-linter. |
| Meaningful context, not UUIDs | Skills returnerar `title`/`status`/`total` framför `id` när det går. Felmeddelanden bär `hint`. |
| Token-efficient responses | `flowwink://briefing` konsoliderar ~10 calls. List-skills har defaults 50–100 rader. |
| Strict input validation | `x-action-required` + handler-NOT NULL i `agent-execute`. Skill-linter pre-release. |
| Tool minimalism | Tool-bloat-strategi: `?groups=` filtrering så klienten håller sig under 128-toolsgränsen. |

## 🟡 Gaps (medvetna, framtida arbete)

1. **`response_format: "concise"|"detailed"` enum** — Anthropic rekommenderar
   det för list-skills så agenten kan välja sin token-budget. Vi har inte
   det än; lägg till på alla `list_*`-skills när vi gör nästa skills-revamp.
2. **Per-tool token-budget i MCP-activity** — vi loggar duration men inte
   token-cost. Lägg till `tokens_in/tokens_out` i `agent_actions`.
3. **Tool-evaluation harness** — vi har `mcp-regression.ts` men ingen
   automatiserad eval-loop som Anthropic beskriver. Bygg när skill-katalogen
   stabiliseras.
4. **Dynamic tool discovery (Nov 2025 beta)** — Anthropics nya "discover,
   learn, execute" pattern. Vår `?groups=` är ett enklare sätt att lösa
   samma problem; bevaka om det blir standard.

## ❌ Avviker medvetet

- **Conditional schemas** (`if/then/else`, `allOf` på top-level) — Anthropic
  tillåter dem, men OpenAI gpt-4.1 strict-mode gör inte det. Vi använder
  `x-action-required` extension istället. Båda klienterna får samma
  kontrakt.
- **Suffix-namespacing** — Anthropic säger "vi har sett non-trivial effects"
  mellan prefix vs suffix. Vi kör prefix (action-verb först) eftersom det
  matchar hur våra skill-aliasers (`list_pending` etc.) fungerar i
  `agent-execute`.

## Praktiska konsekvenser för nya skills

1. Skriv beskrivning så här:
   `<verb> <object>. Use when: <konkret trigger>. NOT for: <vanlig miss>.`
2. Kör `bun run lint:skill <namn>` innan release.
3. Använd `x-action-required` om olika actions kräver olika fält.
4. Om skill returnerar listor: lägg till `limit` (default ≤50) och planera
   för framtida `response_format`-enum.
5. Lägg till `hint`-fält i felmeddelanden som föreslår konkret fix.
