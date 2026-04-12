# Slash Commands — FlowPilot

Slash commands are shortcuts that pre-fill a user message to FlowPilot. They are **not** server-side endpoints — each command is sent as a regular chat message (e.g., `/help`) and processed by the AI reasoning engine via `chat-completion`.

---

## Admin Commands

| Command | Description | Expected Behavior |
|---------|-------------|-------------------|
| `/help` | Show available commands | Lists all slash commands and registered skills |
| `/status` | Quick site health overview | Returns lead count, unread chats, recent activity, heartbeat state |
| `/objectives` | View active goals | Lists objectives from `agent_objectives` with status |
| `/activity` | Recent agent activity | Shows last 5–10 entries from `agent_activity` |
| `/briefing` | Daily summary & action items | Fetches or generates a briefing from `flowpilot_briefings` |
| `/leads` | Recent leads & pipeline | Shows recent leads and deal pipeline summary |
| `/skills` | List active capabilities | Lists enabled skills from `agent_skills` |

## Visitor Commands

| Command | Description |
|---------|-------------|
| `/help` | Show available commands |

---

## How Commands Work

1. User types `/` in chat input → `CommandPalette` opens with autocomplete
2. Selecting a command inserts `/{command}` into the input
3. User sends the message → `chat-completion` processes it as natural language
4. FlowPilot's reasoning engine selects appropriate skills to fulfill the request

Commands are defined in:
- **UI**: `src/components/chat/CommandPalette.tsx` (`BUILTIN_COMMANDS` and `VISITOR_BUILTINS`)
- **Tests**: Layer 7 in `supabase/functions/run-autonomy-tests/index.ts`

---

## Adding a New Command

1. Add entry to `BUILTIN_COMMANDS` in `CommandPalette.tsx`
2. Ensure FlowPilot has a skill (or combination of skills) that can handle the intent
3. Add a Layer 7 test case in `run-autonomy-tests`
4. Update this document
