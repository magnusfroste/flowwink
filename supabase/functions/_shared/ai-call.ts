/**
 * Unified AI Call Adapter
 * 
 * Handles the difference between OpenAI-compatible APIs and Anthropic's Messages API.
 * All edge functions should use this instead of raw fetch() for AI calls.
 */

import { isAnthropicProvider } from './ai-config.ts';

interface AiCallOptions {
  apiKey: string;
  apiUrl: string;
  model: string;
  messages: Array<{ role: string; content: string; tool_calls?: any[]; tool_call_id?: string; name?: string }>;
  tools?: any[];
  tool_choice?: string | object;
  stream?: boolean;
  max_tokens?: number;
}

interface AiCallResult {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  text: () => Promise<string>;
  body: ReadableStream<Uint8Array> | null;
}

/**
 * Convert OpenAI-format messages to Anthropic format
 */
function toAnthropicMessages(messages: AiCallOptions['messages']): { system: string; messages: any[] } {
  let system = '';
  const anthropicMessages: any[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system += (system ? '\n\n' : '') + msg.content;
      continue;
    }

    if (msg.role === 'tool') {
      // Anthropic expects tool results as user messages with tool_result content blocks
      anthropicMessages.push({
        role: 'user',
        content: [{
          type: 'tool_result',
          tool_use_id: msg.tool_call_id,
          content: msg.content,
        }],
      });
      continue;
    }

    if (msg.role === 'assistant' && msg.tool_calls?.length) {
      // Convert OpenAI tool_calls to Anthropic tool_use content blocks
      const content: any[] = [];
      if (msg.content) {
        content.push({ type: 'text', text: msg.content });
      }
      for (const tc of msg.tool_calls) {
        let args: any;
        try { args = typeof tc.function.arguments === 'string' ? JSON.parse(tc.function.arguments) : tc.function.arguments; } catch { args = {}; }
        content.push({
          type: 'tool_use',
          id: tc.id,
          name: tc.function.name,
          input: args,
        });
      }
      anthropicMessages.push({ role: 'assistant', content });
      continue;
    }

    anthropicMessages.push({
      role: msg.role === 'assistant' ? 'assistant' : 'user',
      content: msg.content,
    });
  }

  // Anthropic requires alternating user/assistant — merge consecutive same-role messages
  const merged: any[] = [];
  for (const m of anthropicMessages) {
    if (merged.length > 0 && merged[merged.length - 1].role === m.role) {
      const prev = merged[merged.length - 1];
      // Merge content
      if (typeof prev.content === 'string' && typeof m.content === 'string') {
        prev.content = prev.content + '\n\n' + m.content;
      } else {
        const prevBlocks = typeof prev.content === 'string' ? [{ type: 'text', text: prev.content }] : prev.content;
        const newBlocks = typeof m.content === 'string' ? [{ type: 'text', text: m.content }] : m.content;
        prev.content = [...prevBlocks, ...newBlocks];
      }
    } else {
      merged.push({ ...m });
    }
  }

  return { system, messages: merged };
}

/**
 * Convert OpenAI tool definitions to Anthropic format
 */
function toAnthropicTools(tools: any[]): any[] {
  return tools.map(t => ({
    name: t.function.name,
    description: t.function.description || '',
    input_schema: t.function.parameters || { type: 'object', properties: {} },
  }));
}

/**
 * Convert Anthropic response to OpenAI-compatible format
 */
function fromAnthropicResponse(data: any): any {
  const textBlocks = (data.content || []).filter((b: any) => b.type === 'text');
  const toolBlocks = (data.content || []).filter((b: any) => b.type === 'tool_use');

  const message: any = {
    role: 'assistant',
    content: textBlocks.map((b: any) => b.text).join('\n') || null,
  };

  if (toolBlocks.length > 0) {
    message.tool_calls = toolBlocks.map((b: any) => ({
      id: b.id,
      type: 'function',
      function: {
        name: b.name,
        arguments: JSON.stringify(b.input),
      },
    }));
  }

  return {
    choices: [{
      index: 0,
      message,
      finish_reason: data.stop_reason === 'tool_use' ? 'tool_calls' : 'stop',
    }],
    usage: data.usage ? {
      prompt_tokens: data.usage.input_tokens,
      completion_tokens: data.usage.output_tokens,
      total_tokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
    } : undefined,
  };
}

/**
 * Make an AI call that works with both OpenAI-compatible and Anthropic APIs
 */
export async function callAi(options: AiCallOptions): Promise<Response> {
  const { apiKey, apiUrl, model, messages, tools, tool_choice, max_tokens } = options;

  if (isAnthropicProvider(apiUrl)) {
    const { system, messages: anthropicMessages } = toAnthropicMessages(messages);
    
    const body: any = {
      model,
      max_tokens: max_tokens || 8192,
      messages: anthropicMessages,
    };
    if (system) body.system = system;
    if (tools?.length) {
      body.tools = toAnthropicTools(tools);
      if (tool_choice === 'auto') body.tool_choice = { type: 'auto' };
    }

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return response; // Pass error through
    }

    // Convert Anthropic response to OpenAI format
    const data = await response.json();
    const openaiFormat = fromAnthropicResponse(data);

    return new Response(JSON.stringify(openaiFormat), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // OpenAI-compatible path (OpenAI, Gemini, Local LLM)
  const body: any = { model, messages };
  if (tools?.length) {
    body.tools = tools;
    body.tool_choice = tool_choice || 'auto';
  }

  return fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
