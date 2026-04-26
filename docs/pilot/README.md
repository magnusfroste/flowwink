# FlowPilot Docs

Internal architecture documentation for **FlowPilot** — FlowWink's *local*,
opt-in autonomous operator module.

> FlowPilot is one of several possible operators for the FlowWink platform.
> The platform itself (modules, skill catalogue, automations, MCP surface)
> runs independently of FlowPilot. See
> [`../concepts/operator-strategy.md`](../concepts/operator-strategy.md) for
> the strategy behind this separation, and
> [`../architecture/mcp-as-platform.md`](../architecture/mcp-as-platform.md)
> for the architectural rule that enforces it.

The documents in this folder describe how the local agent is built —
heartbeat, memory, dreaming, presence, sensors, model failover. They are
relevant when you are **working on FlowPilot itself**. If you are working on
the platform layer (modules, skills, automations, MCP) those docs live in
[`../architecture/`](../architecture/) and [`../modules/`](../modules/).
