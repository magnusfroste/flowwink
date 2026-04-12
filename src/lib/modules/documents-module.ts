import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { z } from 'zod';
import type { ModuleDefinition } from '@/types/module-contracts';

const documentsInputSchema = z.object({
  action: z.enum(['create', 'list', 'get', 'update']),
  id: z.string().uuid().optional(),
  title: z.string().optional(),
  category: z.string().optional(),
  file_url: z.string().optional(),
  related_entity_type: z.string().optional(),
  related_entity_id: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const documentsOutputSchema = z.object({
  success: z.boolean(),
  document_id: z.string().optional(),
  message: z.string().optional(),
});

type DocumentsInput = z.infer<typeof documentsInputSchema>;
type DocumentsOutput = z.infer<typeof documentsOutputSchema>;

export const documentsModule: ModuleDefinition<DocumentsInput, DocumentsOutput> = {
  id: 'documents',
  name: 'Documents',
  version: '1.0.0',
  description: 'Document management with categorization, entity linking, and version tracking',
  capabilities: ['data:write', 'data:read'],
  inputSchema: documentsInputSchema,
  outputSchema: documentsOutputSchema,

  async publish(input: DocumentsInput): Promise<DocumentsOutput> {
    const validated = documentsInputSchema.parse(input);

    if (validated.action === 'create') {
      if (!validated.title) {
        return { success: false, message: 'title is required' };
      }

      const { data, error } = await supabase
        .from('documents')
        .insert({
          title: validated.title,
          category: validated.category,
          file_url: validated.file_url,
          related_entity_type: validated.related_entity_type,
          related_entity_id: validated.related_entity_id,
          notes: validated.notes,
        })
        .select('id')
        .single();

      if (error) {
        logger.error('[documents] create failed', error);
        return { success: false, message: error.message };
      }
      return { success: true, document_id: data.id, message: 'Document created' };
    }

    if (validated.action === 'list') {
      let query = supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (validated.category) {
        query = query.eq('category', validated.category);
      }

      const { data, error } = await query;
      if (error) {
        return { success: false, message: error.message };
      }
      return { success: true, message: `Found ${data.length} documents` };
    }

    return { success: false, message: 'Unsupported action' };
  },
};
