INSERT INTO public.agent_skills (name, description, handler, category, scope, origin, enabled, trust_level, requires_approval, tool_definition)
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
  '{"type":"function","function":{"name":"a2a_chat","description":"Process inbound A2A chat messages from peers","parameters":{"type":"object","properties":{"text":{"type":"string","description":"The message text from the peer"},"peer_name":{"type":"string","description":"Name of the sending peer"},"parts":{"type":"array","description":"Raw message parts"}},"required":["text"]}}}'::jsonb
);