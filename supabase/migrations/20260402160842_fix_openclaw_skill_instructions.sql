-- Fix openclaw + a2a_chat skills missing instructions (root cause: original migrations omitted instructions column)
UPDATE agent_skills SET instructions = 'Use when: An inbound A2A message from a connected peer has no explicit skill invocation — i.e. the peer sent plain text or an unstructured message. Routes the message through FlowPilot chat-completion with full site intelligence (pages, leads, objectives, recent activity, connected peers) and per-peer conversation memory (last 20 exchanges). Supports responseSchema for structured JSON responses. NOT for: outbound messages to peers, or messages that already specify a skill via DataPart.'
WHERE name = 'a2a_chat' AND (instructions IS NULL OR instructions = '');

-- Fix openclaw skills missing instructions (root cause: original migration omitted instructions column)
UPDATE agent_skills SET instructions = 'Use when: OpenClaw initiates a beta testing session. Call this first to register the session before any findings or exchanges. Pass scenario as a short description of what is being tested. peer_name defaults to "openclaw". Returns a session_id used in all subsequent openclaw calls.'
WHERE name = 'openclaw_start_session' AND (instructions IS NULL OR instructions = '');

UPDATE agent_skills SET instructions = 'Use when: A beta test session is complete. Call with the session_id from openclaw_start_session. Provide a summary of what was tested and a final status (e.g. "completed", "aborted"). NOT for: ending sessions that were never started.'
WHERE name = 'openclaw_end_session' AND (instructions IS NULL OR instructions = '');

UPDATE agent_skills SET instructions = 'Use when: OpenClaw discovers a bug, UX issue, suggestion, or observation during a beta test. Requires an active session_id. type must be one of: bug, ux_issue, suggestion, observation, performance. severity must be: low, medium, high, or critical. Include as much context as possible in the description field.'
WHERE name = 'openclaw_report_finding' AND (instructions IS NULL OR instructions = '');

UPDATE agent_skills SET instructions = 'Use when: Sending a structured message between OpenClaw and FlowPilot during a session. direction defaults to "openclaw_to_flowpilot". message_type should reflect intent: observation (what was seen), question (asking FlowPilot something), suggestion (proposing a change), learning (insight gained), acknowledgment (confirming a message). content is the human-readable message body.'
WHERE name = 'openclaw_exchange' AND (instructions IS NULL OR instructions = '');

UPDATE agent_skills SET instructions = 'Use when: Checking the current state of active beta test sessions — how many are open, recent findings, and pending messages from FlowPilot. NOT for: checking a specific session in detail (use openclaw_exchange for that). No arguments required.'
WHERE name = 'openclaw_get_status' AND (instructions IS NULL OR instructions = '');
