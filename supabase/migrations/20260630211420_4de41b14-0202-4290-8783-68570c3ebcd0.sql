ALTER TABLE public.voice_calls
  ADD COLUMN IF NOT EXISTS live_transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_handled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_summary text;

COMMENT ON COLUMN public.voice_calls.live_transcript IS 'Array of {role:"user"|"assistant", text, ts} pushed by voice-ingest/stream during a Gemini Live session.';
COMMENT ON COLUMN public.voice_calls.ai_handled IS 'True when the AI receptionist answered the call instead of a human agent.';
COMMENT ON COLUMN public.voice_calls.ai_summary IS 'Short post-call summary produced after the WS session ends.';