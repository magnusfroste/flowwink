import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import type { Json } from '@/integrations/supabase/types';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import {
  FederationPeerInput,
  FederationPeerOutput,
  federationPeerInputSchema,
  federationPeerOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const FEDERATION_SKILLS: SkillSeed[] = [
  {
    name: 'start_qa_session',
    description: 'Start a beta test session with a scenario description. Use when: initiating a new round of beta testing; defining test scope and purpose; preparing for a new testing task. NOT for: ending a session (end_qa_session); getting status (openclaw_get_status).',
    category: 'system',
    handler: 'module:openclaw',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'start_qa_session',
        description: 'Start a beta test session with a scenario description. Use when: initiating a new round of beta testing; defining test scope and purpose; preparing for a new testing task. NOT for: ending a session (end_qa_session); getting status (openclaw_get_status).',
        parameters: {
          type: 'object',
          properties: {
            scenario: {
              type: 'string',
              description: 'Test scenario description',
            },
            peer_name: {
              type: 'string',
              description: 'Name of the tester',
            },
            metadata: {
              type: 'object',
              description: 'Optional metadata',
            },
          },
          required: [
            'scenario',
          ],
        },
      },
    },
    instructions: `## start_qa_session
### What
Opens a new beta test session. Registers the session in the database before any findings or exchanges can be logged.
### When to use
- The testing agent initiates a session — call this first
- Returns a session_id used in all subsequent QA-session calls
### Parameters
- **scenario**: Short description of what is being tested
- **peer_name**: Name of the tester (defaults to "agent")
- **metadata**: Optional additional context`,
  },
  {
    name: 'end_qa_session',
    description: 'End a beta test session with summary. Use when: concluding a beta testing round; collecting final session feedback; marking a test as complete. NOT for: starting a new test session (start_qa_session); reporting findings (report_finding).',
    category: 'system',
    handler: 'module:openclaw',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'end_qa_session',
        description: 'End a beta test session with summary. Use when: concluding a beta testing round; collecting final session feedback; marking a test as complete. NOT for: starting a new test session (start_qa_session); reporting findings (report_finding).',
        parameters: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Session ID to end',
            },
            summary: {
              type: 'string',
              description: 'Session summary',
            },
            status: {
              type: 'string',
              description: 'Final status',
            },
          },
          required: [
            'session_id',
          ],
        },
      },
    },
    instructions: `## end_qa_session
### What
Closes an active beta test session with a summary and final status.
### When to use
- A beta test session is complete
- Call with the session_id from start_qa_session
### NOT for
- Ending sessions that were never started
### Parameters
- **session_id**: The session to close
- **summary**: What was tested
- **status**: Final status (e.g. "completed", "aborted")`,
  },
  {
    name: 'report_finding',
    description: 'Report a bug, UX issue, suggestion, positive note, missing feature, or performance issue from beta testing. Use when: documenting observed problems during a test; submitting improvement ideas; logging defects. NOT for: getting test status (openclaw_get_status); sending a general message (openclaw_exchange).',
    category: 'system',
    handler: 'module:openclaw',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'report_finding',
        description: 'Report a bug, UX issue, suggestion, positive note, missing feature, or performance issue from beta testing. Use when: documenting observed problems during a test; submitting improvement ideas; logging defects. NOT for: getting test status (openclaw_get_status); sending a general message (openclaw_exchange).',
        parameters: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Optional session ID',
            },
            type: {
              type: 'string',
              enum: [
                'bug',
                'ux_issue',
                'suggestion',
                'positive',
                'performance',
                'missing_feature',
              ],
              description: 'Finding type',
            },
            severity: {
              type: 'string',
              enum: [
                'low',
                'medium',
                'high',
                'critical',
              ],
              description: 'Severity level',
            },
            title: {
              type: 'string',
              description: 'Finding title',
            },
            description: {
              type: 'string',
              description: 'Detailed description',
            },
            context: {
              type: 'object',
              description: 'Additional context',
            },
            screenshot_url: {
              type: 'string',
              description: 'Screenshot URL',
            },
          },
          required: [
            'type',
            'title',
          ],
        },
      },
    },
    instructions: `## report_finding
### What
Logs a finding (bug, UX issue, suggestion, positive note, missing feature, or performance issue) discovered during a beta test session.
### When to use
- The agent discovers something worth logging during an active session
- Include as much context as possible in the description field
### Parameters
- **session_id**: Optional active session ID
- **type**: bug | ux_issue | suggestion | positive | performance | missing_feature
- **severity**: low | medium | high | critical
- **title**: Short finding title
- **description**: Detailed description
- **context**: Additional structured context (optional)
- **screenshot_url**: Optional screenshot URL`,
  },
  {
    name: 'openclaw_exchange',
    mcp_exposed: false, // FlowPilot's own peer-comms primitive, not a tool for external operators
    description: 'Send a message between OpenClaw and FlowPilot. Use when: passing information between systems; requesting an action from the other AI; synchronizing state or data. NOT for: reporting QA findings (report_finding); dispatching a mission (dispatch_claw_mission).',
    category: 'system',
    handler: 'module:openclaw',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'openclaw_exchange',
        description: 'Send a message between OpenClaw and FlowPilot. Use when: passing information between systems; requesting an action from the other AI; synchronizing state or data. NOT for: reporting QA findings (report_finding); dispatching a mission (dispatch_claw_mission).',
        parameters: {
          type: 'object',
          properties: {
            session_id: {
              type: 'string',
              description: 'Optional session ID',
            },
            direction: {
              type: 'string',
              enum: [
                'openclaw_to_flowpilot',
                'flowpilot_to_openclaw',
              ],
              description: 'Message direction',
            },
            message_type: {
              type: 'string',
              enum: [
                'observation',
                'question',
                'suggestion',
                'learning',
                'acknowledgment',
              ],
              description: 'Message type',
            },
            content: {
              type: 'string',
              description: 'Message content',
            },
            payload: {
              type: 'object',
              description: 'Structured payload',
            },
          },
          required: [
            'content',
          ],
        },
      },
    },
    instructions: `## openclaw_exchange
### What
Sends a structured message between OpenClaw and FlowPilot during a session.
### When to use
- Sending observations, questions, suggestions, learnings, or acknowledgments between agents
### Parameters
- **content**: The human-readable message body (required)
- **session_id**: Optional session ID
- **direction**: openclaw_to_flowpilot (default) | flowpilot_to_openclaw
- **message_type**: observation | question | suggestion | learning | acknowledgment
- **payload**: Optional structured payload`,
  },
  {
    name: 'openclaw_get_status',
    mcp_exposed: false, // FlowPilot's own peer-comms primitive, not a tool for external operators
    description: 'Get current beta test status. Use when: checking progress of an ongoing beta test; verifying if a test session is active; monitoring testing phase. NOT for: starting a new session (start_qa_session); ending a session (end_qa_session).',
    category: 'system',
    handler: 'module:openclaw',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'openclaw_get_status',
        description: 'Get current beta test status. Use when: checking progress of an ongoing beta test; verifying if a test session is active; monitoring testing phase. NOT for: starting a new session (start_qa_session); ending a session (end_qa_session).',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    instructions: `## openclaw_get_status
### What
Returns an overview of active beta test sessions — open sessions, recent findings, and pending messages from FlowPilot.
### When to use
- Checking overall state of ongoing beta testing
- No arguments required
### NOT for
- Getting details of a specific session (use openclaw_exchange for that)`,
  },
  {
    name: 'dispatch_claw_mission',
    mcp_exposed: false, // FlowPilot's own peer-comms primitive, not a tool for external operators
    description: 'Dispatch a one-shot mission to an external OpenClaw agent via /v1/responses. Fire-and-forget: the Claw works independently and reports results back via MCP callback. Use when: running template audits, site testing, content review, or any task delegated to an external Claw agent. NOT for: a single message to the Claw (use openclaw_exchange); checking on a Claw (use openclaw_get_status).',
    category: 'automation',
    handler: 'edge:openclaw-responses',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'dispatch_claw_mission',
        description: 'Dispatch a one-shot mission to an external OpenClaw agent. Fire-and-forget with MCP callback. Use when: running audits, site testing, or delegating tasks to a Claw. NOT for: a single message to the Claw (use openclaw_exchange).',
        parameters: {
          type: 'object',
          required: [
            'peer_name',
            'prompt',
          ],
          properties: {
            peer_name: {
              type: 'string',
              description: 'Name of the peer agent to dispatch to (e.g. "ClawOne")',
            },
            prompt: {
              type: 'string',
              description: 'Self-contained mission instructions. Be specific about what to audit/test and how to report back.',
            },
            inject_mcp_credentials: {
              type: 'boolean',
              description: 'Include MCP callback credentials in the prompt (default: true)',
            },
            fire_and_forget: {
              type: 'boolean',
              description: 'Send without waiting for response (default: true)',
            },
          },
        },
      },
    },
    instructions: `## dispatch_claw_mission — One-Shot Mission Dispatch

### What
Sends a self-contained mission to an external OpenClaw agent. MCP credentials are auto-injected so the Claw can report findings back.

### CRITICAL: Writing good mission prompts
External agents may run on smaller models (27B). Your mission prompt MUST be:
- **Short**: Max 200 words. No walls of text.
- **Step-by-step**: Numbered list of 3-5 concrete steps.
- **Specific**: Tell them exactly what to check, not "audit everything".
- **Role-based**: Start with "You are a [role]. Your job is to [task]."

### GOOD mission prompt example:
"You are a customer testing FlowWink's booking system.

Steps:
1. Call GET /resources/health to check the site is online.
2. Check if bookings are available (look at the health data).
3. Report what you find. Send ONE finding per request.

Focus on: Is booking functional? Are there services listed? Any errors?"

### BAD mission prompt (too vague, too long):
"Please perform a comprehensive analysis of the entire website including SEO, performance, accessibility, content quality, user experience, and technical architecture..."

### Parameters
- \`peer_name\`: Name of the registered peer (e.g. "ClawOne")
- \`prompt\`: The mission instructions — short, specific, step-by-step
- \`inject_mcp_credentials\`: Set to true (default) to include callback credentials
- \`fire_and_forget\`: Set to true (default) to avoid timeout`,
  },
  {
    name: 'queue_beta_test',
    mcp_exposed: false, // FlowPilot's own peer-comms primitive, not a tool for external operators
    description: 'Queue a test scenario for OpenClaw to execute on next poll. Use when: scheduling tests for asynchronous execution. NOT for: dispatching a mission for immediate execution (use dispatch_claw_mission).',
    category: 'system',
    handler: 'module:openclaw',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'queue_beta_test',
        parameters: {
          type: 'object',
          required: [
            'scenario',
          ],
          properties: {
            priority: {
              enum: [
                'normal',
                'high',
                'critical',
              ],
              type: 'string',
            },
            scenario: {
              type: 'string',
            },
            instructions: {
              type: 'string',
            },
          },
        },
        description: 'Queue a test scenario for OpenClaw to execute on next poll. Use when: scheduling tests for asynchronous execution. NOT for: dispatching a mission for immediate execution (use dispatch_claw_mission).',
      },
    },
    instructions: `# Queue Beta Test

Queue a test scenario for OpenClaw to pick up.`,
  },
  {
    name: 'resolve_finding',
    description: 'Mark a beta test finding as resolved. Use when: closing fixed issues, updating finding status. NOT for: reporting new findings (use report_finding).',
    category: 'system',
    handler: 'module:openclaw',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'resolve_finding',
        parameters: {
          type: 'object',
          required: [
            'finding_id',
          ],
          properties: {
            finding_id: {
              type: 'string',
            },
            resolution_note: {
              type: 'string',
            },
          },
        },
        description: 'Mark a beta test finding as resolved. Use when: closing fixed issues, updating finding status. NOT for: reporting new findings (use report_finding).',
      },
    },
    instructions: `# Resolve Finding

Marks a finding as resolved after fix.`,
  },
  {
    name: 'confirm_fulfillment',
    description: 'Confirm delivery/fulfillment of an order or purchase order. Use when: an external agent (Claw/supplier) confirms that goods have been delivered. NOT for: updating order status manually (use manage_orders); receiving goods against a PO (use receive_purchase_order).',
    category: 'system',
    handler: 'module:openclaw',
    scope: 'external',
    tool_definition: {
      type: 'function',
      function: {
        name: 'confirm_fulfillment',
        description: 'Confirm delivery/fulfillment of an order or purchase order. Use when: a supplier agent confirms goods have been delivered. NOT for: updating order status manually (use manage_orders).',
        parameters: {
          type: 'object',
          required: [],
          properties: {
            order_id: {
              type: 'string',
              description: 'Customer order UUID',
            },
            purchase_order_id: {
              type: 'string',
              description: 'Purchase order UUID',
            },
            tracking_number: {
              type: 'string',
              description: 'Tracking reference',
            },
            tracking_url: {
              type: 'string',
              description: 'Tracking URL',
            },
            notes: {
              type: 'string',
              description: 'Fulfillment notes',
            },
          },
        },
      },
    },
    instructions: `## confirm_fulfillment
### What
Marks an order or purchase order as delivered/received. Used by supplier agents to close the fulfillment loop.
### Parameters
- order_id: UUID of the customer order to confirm (provide this OR purchase_order_id)
- purchase_order_id: UUID of the PO to confirm
- tracking_number: optional tracking reference
- tracking_url: optional tracking URL
- notes: optional fulfillment notes
### Returns
success, entity type, fulfillment status`,
  },
  {
    name: 'scan_beta_findings',
    description: 'Scan unresolved beta test findings from OpenClaw. Use when: reviewing outstanding QA issues, finding unresolved bugs. NOT for: resolving findings (use resolve_finding).',
    category: 'system',
    handler: 'module:openclaw',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'scan_beta_findings',
        parameters: {
          type: 'object',
          required: [],
          properties: {},
        },
        description: 'Scan unresolved beta test findings from OpenClaw. Use when: reviewing outstanding QA issues, finding unresolved bugs. NOT for: resolving findings (use resolve_finding).',
      },
    },
    instructions: `# Scan Beta Findings

## Decision Table
| Severity | Count | Action |
|----------|-------|--------|
| critical | ≥1 | Create objective immediately |
| high | ≥2 | Create objective |
| medium | ≥3 | Group into improvement objective |
| low | any | Monitor |`,
  },
  {
    name: 'invite_peer_agent',
    description: 'Invite a new sub-agent into the FlowWink federation. Auto-generates an MCP API key and registers the peer with full transitive trust (the new peer inherits the inviter\'s toolset_groups). Use when: an external operator (e.g. OpenClaw) needs to recruit a specialist sub-agent for a task; expanding the federation autonomously. NOT for: registering a human-operated peer (use the admin UI); revoking peers.',
    category: 'system',
    handler: 'edge:federation-invite-peer',
    scope: 'external',
    tool_definition: {
      type: 'function',
      function: {
        name: 'invite_peer_agent',
        description: 'Invite a new sub-agent into the federation. Returns MCP credentials the inviter passes to its sub-agent.',
        parameters: {
          type: 'object',
          required: ['invitee_name'],
          properties: {
            invitee_name: { type: 'string', description: 'Display name for the new peer' },
            invitee_url: { type: 'string', description: 'Optional callback URL where the sub-agent can be reached' },
            invitee_description: { type: 'string', description: 'What this sub-agent specialises in' },
            toolset_groups: {
              type: 'array',
              items: { type: 'string' },
              description: 'Optional: override which MCP toolset groups to grant (defaults to inheriting inviter groups)',
            },
            reason: { type: 'string', description: 'Why this peer is being invited (audit log)' },
          },
        },
      },
    },
    instructions: `## invite_peer_agent — Recruit Sub-Agents

### What
Registers a new peer in the FlowWink federation, auto-generates an MCP API key, and inherits the inviter toolset_groups (full transitive trust). The new peer can immediately call MCP tools.

### Trust model
- **Full transitive**: invitee inherits ALL toolset_groups the inviter has
- **Orphaned revocation**: if the inviter is revoked, the invitee continues operating

### Returns
JSON with peer_id and credentials { mcp_api_key, mcp_endpoint, mcp_url_with_groups, authorization_header }.

### How to use the credentials
Pass the entire credentials object to the sub-agent in its onboarding prompt. It uses the bearer token to authenticate against the MCP endpoint.

### Audit
Every invitation is logged to peer_invitations with inviter, invitee, granted groups, and reason.`,
  },
];

export const federationModule = defineModule<FederationPeerInput, FederationPeerOutput>({
  id: 'federation',
  name: 'Federation',
  version: '1.0.0',
  processes: [],
  maturity: 'L3',
  description: 'Connected agents — register and manage the agents that operate this instance over MCP',
  capabilities: ['data:read', 'data:write'],
  tier: 'core',
  inputSchema: federationPeerInputSchema,
  outputSchema: federationPeerOutputSchema,

  skills: [
    'start_qa_session',
    'end_qa_session',
    'report_finding',
    'openclaw_exchange',
    'openclaw_get_status',
    'queue_beta_test',
    'resolve_finding',
    'scan_beta_findings',
    'invite_peer_agent',
  ],
  data: {
    tables: [
      'a2a_activity',
      'beta_test_exchanges',
      'beta_test_findings',
      'beta_test_sessions',
      'peer_invitations',
      'a2a_peers',
    ],
  },
  skillSeeds: FEDERATION_SKILLS,

  async publish(input: FederationPeerInput): Promise<FederationPeerOutput> {
    try {
      const validated = federationPeerInputSchema.parse(input);

      const { data, error } = await supabase
        .from('a2a_peers')
        .insert([{
          name: validated.name,
          url: validated.url,
          outbound_token: validated.outbound_token || '',
          capabilities: (validated.capabilities || {}) as Json,
          status: 'paused' as const,
        }])
        .select('id, name, status')
        .single();

      if (error) throw error;

      logger.log(`[FederationModule] Peer registered: ${data.id}`);

      return {
        success: true,
        peer_id: data.id,
        name: data.name,
        status: data.status,
      };
    } catch (err) {
      logger.error('[FederationModule] Failed to register peer:', err);
      return {
        success: false,
        peer_id: '',
        name: input.name,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  },
});
