---
name: Manifest namespacing (agent/ui/data)
description: defineModule accepts namespaced shape with agent/ui/data sub-objects, BC-shimmed to flat fields
type: design
---

`defineModule()` accepts both shapes:

```ts
// Preferred (namespaced)
defineModule({ id, name, version, capabilities, inputSchema, outputSchema, publish,
  agent: { skills, skillSeeds, automations, webhookEvents },
  ui:    { /* reserved: navItems, routes */ },
  data:  { tables, seedData },
});

// Legacy (flat — still works, auto-merged into agent/data)
defineModule({ id, ..., skills, skillSeeds, automations, webhookEvents, seedData });
```

`normaliseModule()` mirrors fields both ways so old readers (skill-map,
module-bootstrap, etc.) keep working unchanged. New code should read from
`mod.agent.*` / `mod.data.*`.

**Why:** Clear separation of concerns — agent (AI/MCP), ui (humans),
data (DB). UI/data namespaces are reserved placeholders today; concerns get
pulled in as Sidebar/migrations get consolidated into the manifest.
