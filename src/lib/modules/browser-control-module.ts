import { defineModule } from '@/lib/module-def';
import { z } from 'zod';

export const browserControlInputSchema = z.object({
  action: z.enum(['check_status', 'set_extension_id']),
  extension_id: z.string().optional(),
});

export const browserControlOutputSchema = z.object({
  success: z.boolean(),
  installed: z.boolean().optional(),
  version: z.string().optional(),
  error: z.string().optional(),
});

export type BrowserControlInput = z.infer<typeof browserControlInputSchema>;
export type BrowserControlOutput = z.infer<typeof browserControlOutputSchema>;

export const browserControlModule = defineModule<BrowserControlInput, BrowserControlOutput>({
  id: 'browserControl',
  name: 'Browser Control',
  version: '1.0.0',
  description: 'Chrome Extension relay for authenticated web browsing — enables FlowPilot to read login-walled sites (LinkedIn, X) using your browser session',
  capabilities: ['data:read'],
  inputSchema: browserControlInputSchema,
  outputSchema: browserControlOutputSchema,

  skills: [
    // browser_fetch is cross-cutting, kept as core
  ],

  async publish(input: BrowserControlInput): Promise<BrowserControlOutput> {
    return { success: true, installed: false };
  },
});
