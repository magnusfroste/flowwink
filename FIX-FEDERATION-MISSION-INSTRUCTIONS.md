# Fix: Federation Mission Instructions Not Discoverable

**Issue:** When Hermes (or other external agents) are invited via `/admin/federation/agents`, they receive a text prompt with mission instructions embedded. However, agents don't reliably parse mission text from the prompt — they skip directly to the connection details and start operating **without instructions**.

**Result:** Hermes had no mission definition, so it didn't follow the Federation page guidelines about operator behavior.

---

## Root Cause

The agent invite prompt includes mission instructions as markdown text (lines 357-359 in AgentInvites.tsx):

```typescript
## Your Mission: ${mission.name}

${instructions}
```

But agents typically only parse:
1. Base URL
2. Authentication token  
3. Quick Start (REST endpoints)

They don't reliably extract markdown instructions from the middle of a long prompt.

---

## Solution: Mission Instructions as a Resource

Create a new MCP resource that agents can query to get their mission:

### 1. Add Mission Storage

When an agent is invited, store the mission metadata in a new table:

```sql
CREATE TABLE federation_peer_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  peer_id UUID REFERENCES a2a_peers(id) ON DELETE CASCADE,
  mission_id TEXT NOT NULL,        -- 'full-operator', 'growth-operator', etc.
  mission_name TEXT NOT NULL,
  instructions TEXT NOT NULL,
  focus_resources TEXT[] DEFAULT '{}',
  focus_tools TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 2. Update federation-invite-peer Function

When creating a peer invite, also create the mission record:

```typescript
// In federation-invite-peer/index.ts, after creating newPeer:

const missionId = body.mission_id || 'custom';
const missionName = body.mission_name || 'Custom Mission';
const instructions = body.instructions || '';

await supabase.from('federation_peer_missions').insert({
  peer_id: newPeer.id,
  mission_id: missionId,
  mission_name: missionName,
  instructions: instructions,
  focus_resources: body.focus_resources || [],
  focus_tools: body.focus_tools || [],
});
```

### 3. Add MCP Resource: `flowwink://mission`

Create a new MCP endpoint that returns the peer's mission:

**REST:**
```
GET /rest/resources/mission
Authorization: Bearer <peer_token>

Response:
{
  "uri": "flowwink://mission",
  "mimeType": "application/json",
  "contents": {
    "id": "growth-operator",
    "name": "Growth Operator",
    "instructions": "You are the growth operator...",
    "focusResources": [...],
    "focusTools": [...]
  }
}
```

**Native MCP:**
```
resources/read {"uri": "flowwink://mission"}
```

### 4. Update Agent Onboarding Sequence

Change the bootstrap instructions in AgentInvites.tsx to make mission discovery EXPLICIT:

**BEFORE:**
```
1. Read `/rest/resources/briefing` FIRST
2. Read `/rest/resources/skills`
3. Read `/rest/resources/modules`
```

**AFTER:**
```
1. READ YOUR MISSION FIRST: GET /rest/resources/mission
   This tells you your role and responsibilities.
   
2. Then verify connection: GET /rest/resources/briefing
   (identity, health, modules, active objectives)
   
3. Then discover capabilities: GET /rest/resources/skills
   (all available tools for your mission)
   
4. Then understand context: GET /rest/resources/modules
   (which business modules are active)
```

### 5. Update Agent Invites Component

Update the generated prompt in AgentInvites.tsx:

```typescript
// Line 300 onwards - update the quick start section:

## Quick Start

**CRITICAL: Read Your Mission First**

\`\`\`bash
GET ${mcpUrl}/rest/resources/mission
Authorization: Bearer ${rawKey}
\`\`\`

This returns your mission definition (role, responsibilities, focus areas).

Then follow the bootstrap sequence:

1. Verify connection: \`GET ${mcpUrl}/rest/resources/briefing\`
2. Understand capabilities: \`GET ${mcpUrl}/rest/resources/skills\`
3. Understand modules: \`GET ${mcpUrl}/rest/resources/modules\`
```

### 6. Update AgentInvites to Pass Mission Metadata

```typescript
// In handleGenerate function, add mission data to the invite payload:

const missionData = mission.id === 'custom' 
  ? {
      mission_id: 'custom',
      mission_name: agentName || 'Custom Mission',
      instructions: customInstructions,
      focus_resources: [],
      focus_tools: [],
    }
  : {
      mission_id: mission.id,
      mission_name: mission.name,
      instructions: mission.instructions,
      focus_resources: mission.focusResources,
      focus_tools: mission.focusTools,
    };

// Then call federation-invite-peer with missionData:
const response = await supabase.functions.invoke('federation-invite-peer', {
  body: {
    invitee_name: agentName || mission.name,
    ...missionData,  // ← Add this
  },
});
```

---

## Testing the Fix

### For Hermes (or any external agent):

1. **Generate new invite** via `/admin/federation/agents`
2. **Agent runs bootstrap:**
   ```bash
   # First: Get mission
   curl -H "Authorization: Bearer fwk_xxx" \
     https://rzhjotxffjfsdlhrdkpj.supabase.co/functions/v1/mcp-server/rest/resources/mission
   
   # Response shows mission instructions
   # Agent reads: "You are the Growth Operator..."
   # Agent now knows what to do!
   ```

3. **Agent operates with context** — it knows:
   - Its role (Growth Operator, Commerce Operator, etc.)
   - Its responsibilities (score leads, manage pipeline, etc.)
   - Key resources to monitor (briefing, skills, modules)
   - Key tools to use (list_leads, update_deal, etc.)

### For admin verification:

```sql
-- Check if mission was stored for a peer
SELECT * FROM federation_peer_missions 
WHERE peer_id = 'peer-uuid'
```

---

## Backward Compatibility

- Existing agents continue to work (mission text is still in the prompt)
- New agents get the proper `/rest/resources/mission` endpoint
- No breaking changes to existing federation connections

---

## Implementation Priority

**P1: Critical** — This explains why Hermes didn't follow instructions
- Add `federation_peer_missions` table
- Update `federation-invite-peer` function
- Add `flowwink://mission` MCP resource

**P2: High** — Better UX for future agents
- Update `AgentInvites.tsx` to emphasize mission reading
- Update invite prompt to call `/rest/resources/mission` first

**P3: Enhancement** — Polish
- Add mission UI to `/admin/federation/peers` (show mission for each peer)
- Add audit logging for mission changes

---

## Why This Fixes Hermes

Hermes will now:
1. ✅ Receive invite with mission reference
2. ✅ **Read `/rest/resources/mission`** — knows role & responsibilities
3. ✅ Discover `/rest/resources/briefing` — platform context
4. ✅ Discover skills from active modules
5. ✅ **Operate according to mission** — follows Federation page guidelines

Instead of:
1. ❌ Receive invite text
2. ❌ Skip past mission instructions
3. ❌ Read only connection details
4. ❌ Start operating without mission context
5. ❌ Fail to follow guidelines
