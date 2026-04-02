INSERT INTO public.agent_skills (name, description, handler, category, scope, origin, enabled, trust_level, requires_approval, tool_definition, instructions)
VALUES (
  'a2a_chat',
  'Handle incoming A2A messages from federation peers. Routes natural language messages to FlowPilot for intelligent response.',
  'edge:a2a-chat',
  'system',
  'external',
  'bundled',
  true,
  'auto',
  false,
  '{"type":"function","function":{"name":"a2a_chat","description":"Process inbound A2A chat messages from peers","parameters":{"type":"object","properties":{"text":{"type":"string","description":"The message text from the peer"},"peer_name":{"type":"string","description":"Name of the sending peer"},"parts":{"type":"array","description":"Raw message parts"}},"required":["text"]}}}'::jsonb,
  'Use when: An inbound A2A message from a connected peer has no explicit skill invocation — i.e. the peer sent plain text or an unstructured message. Routes the message through FlowPilot chat-completion with full site intelligence (pages, leads, objectives, recent activity, connected peers) and per-peer conversation memory (last 20 exchanges). Supports responseSchema for structured JSON responses. NOT for: outbound messages to peers, or messages that already specify a skill via DataPart.'
);