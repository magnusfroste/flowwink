// The HTTP door to the skill executor. The pipeline itself — every gate, the
// dispatch, the envelope and the journal — lives in _shared/execute/core.ts so
// a caller inside the same project (the ReAct loop, the gateway, a dispatcher)
// can import it and run a skill without the HTTP hop; this function stays the
// door for everything outside the process (the admin UI, cron, other
// functions' `async: true` handoff).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleAgentExecute } from '../_shared/execute/core.ts';

serve(handleAgentExecute);
