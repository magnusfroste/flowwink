/**
 * Step 4a of the FlowPilot plan (2026-10-30): FlowChat runs on the shared
 * engine. agent-operate used to carry its own copy of the ReAct loop, so the
 * guards added to reason() in steps 1–2 (granted built-ins, retry only what is
 * retryable, pending ≠ success, trace events) never reached the surface an
 * admin actually types into — and its final answer was a SECOND model call
 * that regenerated the reply instead of showing the one the loop produced.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p: string) => readFileSync(p, 'utf8');
const operate = read('supabase/functions/agent-operate/index.ts');
const engine = read('supabase/functions/_shared/pilot/reason.ts');
const types = read('supabase/functions/_shared/types.ts');

describe('FlowChat hands its turn to reason()', () => {
  it('calls the shared engine and keeps no loop of its own', () => {
    expect(operate).toMatch(/await reason\(supabase,/);
    expect(operate).not.toMatch(/callAi\(/);
    expect(operate).not.toMatch(/for \(let iteration = 0; iteration < MAX_TOOL_ITERATIONS/);
    expect(operate).not.toMatch(/executeBuiltInTool\(/);
    expect(operate).not.toMatch(/streamFinalResponse/);
  });

  it('passes what makes it FlowChat as configuration', () => {
    for (const key of ['callerUserId: auth.userId', 'autoChainNextAction: true', 'continuationNudge: true', 'summarizeOnExhaustion: true', 'memoryFlush: false', 'traceId: operateTraceId', 'deadlineAt:', 'onProgress:', 'builtInToolGroups: builtInGroups']) {
      expect(operate).toContain(key);
    }
  });

  it('keeps the SSE contract useAgentOperate reads', () => {
    for (const ev of ["'flowchat_meta'", "'skill_results'", "'delta'", "'done'", "'error'"]) {
      expect(operate).toContain(ev);
    }
    // tool_start / tool_done come from the engine's progress events, by name.
    expect(types).toMatch(/kind: 'tool_start'; iteration: number; tools: string\[\]/);
    expect(types).toMatch(/kind: 'tool_done'; iteration: number; tools: string\[\]; results_count: number/);
    expect(operate).toMatch(/sseEvent\(writer, encoder, e\.kind,/);
  });

  it("maps the engine's 'pending' back to the skill's own status for the approval chips", () => {
    expect(operate).toMatch(/r\.status === 'pending'\s*\n?\s*\? \{ \.\.\.r, status:/);
    expect(read('src/components/admin/copilot/OperateChat.tsx')).toMatch(/sr\.status === 'pending_approval'/);
  });
});

describe('the engine can carry a reactive surface', () => {
  it('declares the switches on ReasonConfig', () => {
    for (const key of ['callerUserId?:', 'maxSkills?:', 'onProgress?:', 'autoChainNextAction?:', 'continuationNudge?:', 'summarizeOnExhaustion?:', 'memoryFlush?:', 'deadlineAt?:']) {
      expect(types).toContain(key);
    }
  });

  it('calls the provider through callAi, so an Anthropic key works for every consumer', () => {
    const loop = engine.slice(engine.indexOf('export async function reason('));
    expect(loop).not.toMatch(/await fetch\(apiUrl/);
    expect(loop).toMatch(/callAiWithRetry\(\{/);
  });

  it('runs a named next step only when asked, and only a granted built-in', () => {
    expect(engine).toMatch(/if \(config\.autoChainNextAction\)/);
    expect(engine).toMatch(/isBuiltInTool\(nextAction\.tool\) && !grantedBuiltIns\.has\(nextAction\.tool\)/);
    expect(engine).toMatch(/why\.add\('auto_chained'/);
    expect(read('supabase/functions/_shared/trace/events.ts')).toMatch(/'auto_chained'/);
    expect(read('src/components/admin/copilot/FlowPilotTraceTab.tsx')).toMatch(/auto_chained:/);
  });

  it('a listener can never stop a run', () => {
    expect(engine).toMatch(/try \{ void Promise\.resolve\(config\.onProgress\(event\)\)\.catch\(\(\) => \{\}\); \} catch/);
  });

  it('the heartbeat is unchanged by default: no chaining, no nudges, memory flush on', () => {
    const heartbeat = read('supabase/functions/flowpilot-heartbeat/index.ts');
    expect(heartbeat).not.toMatch(/autoChainNextAction|continuationNudge|summarizeOnExhaustion/);
    expect(engine).toMatch(/config\.memoryFlush !== false/);
  });
});

describe('FlowWork brings its tools; the engine runs the loop (step 4b)', () => {
  const work = read('supabase/functions/workspace-chat/index.ts');

  it('hands its turn to reason() with its own tool surface, and keeps no loop of its own', () => {
    expect(work).toMatch(/await reason\(supabaseAdmin, conversation, \{/);
    expect(work).toMatch(/toolSurface: \{\s*tools,/);
    expect(work).toMatch(/execute: executeSurfaceTool/);
    expect(work).not.toMatch(/for \(let round = 0; round < 6; round\+\+\)/);
    expect(work).not.toMatch(/phase: 'force-final'/);
    expect(work).not.toMatch(/No tools: stream straight through/);
  });

  it('keeps what makes it FlowWork: gates, the two-card limit, the bounce nudge, citations', () => {
    expect(work).toMatch(/Max 2 staged actions per message/);
    expect(work).toMatch(/beforeFinalAnswer: \(_answer, iteration\) =>/);
    expect(work).toMatch(/if \(bouncedStage && stagedActions\.length === 0 && !nudged && iteration < 3\)/);
    expect(work).toMatch(/citations\.push\(\{ ref: r, type: 'skill'/);
    expect(work).toMatch(/return streamFinal\(citations, finalText, contextMeta, consulted, stagedActions, documentOut\)/);
    expect(work).toMatch(/pruneHistory: false/);
    expect(work).toMatch(/usage: \{ source: 'workspace-chat', userId: user\.id/);
  });

  it('a FlowWork turn is one run: its skill calls carry the trace id', () => {
    expect(work).toMatch(/const traceId = generateTraceId\('flowwork'\)/);
    expect(work).toMatch(/\.\.\.\(traceId \? \{ trace_id: traceId \} : \{\}\)/);
  });

  it('guards key on what a call is about, and a corrected retry is not a loop', () => {
    expect(work).toMatch(/`\$\{toolName\}:\$\{String\(args\?\.name \?\? ''\)\}`/);
    expect(engine).toMatch(/recentToolCalls\.push\(`\$\{key\}\|\$\{JSON\.stringify\(fnArgs\)\}`\)/);
    expect(engine).toMatch(/const surface = config\.toolSurface;/);
    expect(engine).toMatch(/const builtInTools = surface \? \[\] :/);
  });

  it('a provider error keeps its status, so FlowWork still answers 429 as 429', () => {
    expect(engine).toMatch(/Object\.assign\(new Error\(`AI provider error: \$\{aiResponse\.status\}/);
    expect(work).toMatch(/status: status === 429 \? 429 : 502/);
  });

  it('a sent-back answer is a trace event the Log can show', () => {
    expect(engine).toMatch(/why\.add\('answer_returned'/);
    expect(read('src/components/admin/copilot/FlowPilotTraceTab.tsx')).toMatch(/answer_returned:/);
  });
});

describe('a refusal is not reported as a success', () => {
  it('the engine records refused skills as refused, and FlowChat shows it so', () => {
    expect(engine).toMatch(/const refused = !failed && result\?\.status === 'refused';/);
    expect(engine).toMatch(/status: failed \? 'failed' : refused \? 'refused' : pending \? 'pending' : 'success'/);
    expect(read('src/components/admin/copilot/OperateChat.tsx')).toMatch(/sr\.status === 'pending_approval' \|\| sr\.status === 'refused' \? 'secondary'/);
  });
});
