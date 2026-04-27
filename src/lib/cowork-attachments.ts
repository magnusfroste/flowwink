import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

const MAX_TEXT_CHARS = 60_000; // ~15k tokens
const PDF_MIME = 'application/pdf';
const TEXT_MIMES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/json',
  'text/xml',
  'application/xml',
  'text/html',
];
const TEXT_EXTENSIONS = [
  '.txt', '.md', '.markdown', '.csv', '.json', '.log', '.xml', '.yml', '.yaml',
  '.html', '.htm', '.tsv', '.ini', '.toml',
];

export interface ParseResult {
  text: string;
  truncated: boolean;
  kind: 'pdf' | 'text';
}

export function detectKind(file: File): 'pdf' | 'text' | 'image' | 'other' {
  if (file.type === PDF_MIME || file.name.toLowerCase().endsWith('.pdf')) return 'pdf';
  if (file.type.startsWith('image/')) return 'image';
  if (TEXT_MIMES.includes(file.type)) return 'text';
  const lower = file.name.toLowerCase();
  if (TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'text';
  return 'other';
}

function truncate(text: string): { text: string; truncated: boolean } {
  if (text.length <= MAX_TEXT_CHARS) return { text, truncated: false };
  return {
    text: text.slice(0, MAX_TEXT_CHARS) + '\n\n[…content truncated to fit context window]',
    truncated: true,
  };
}

async function parseTextFile(file: File): Promise<ParseResult> {
  const raw = await file.text();
  const { text, truncated } = truncate(raw);
  return { text, truncated, kind: 'text' };
}

async function parsePdfFile(file: File): Promise<ParseResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) throw new Error('Not authenticated');

  // Upload to private cowork-uploads bucket: <user_id>/<random>-<name>
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${userId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('cowork-uploads')
    .upload(path, file, { contentType: file.type || PDF_MIME, upsert: false });
  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  try {
    const { data, error } = await supabase.functions.invoke('extract-pdf-text', {
      body: { storage_path: `cowork-uploads/${path}` },
    });
    if (error) throw new Error(error.message || 'extract-pdf-text failed');
    if (!data?.success) throw new Error(data?.error || 'PDF extraction returned no text');
    const { text, truncated } = truncate(String(data.text || ''));
    return { text, truncated, kind: 'pdf' };
  } finally {
    // Best-effort cleanup — don't block on failure
    supabase.storage
      .from('cowork-uploads')
      .remove([path])
      .catch((e) => logger.error('cowork cleanup failed', e));
  }
}

export async function parseAttachment(file: File): Promise<ParseResult> {
  const kind = detectKind(file);
  if (kind === 'pdf') return parsePdfFile(file);
  if (kind === 'text') return parseTextFile(file);
  throw new Error(
    kind === 'image'
      ? 'Image uploads are not supported yet — paste relevant text instead.'
      : `Unsupported file type: ${file.type || file.name}`,
  );
}

/** Build a single context block to prepend to the user's prompt. */
export function buildAttachmentContext(
  attachments: Array<{ name: string; text?: string }>,
): string {
  const withText = attachments.filter((a) => a.text && a.text.trim());
  if (withText.length === 0) return '';
  const blocks = withText.map(
    (a) => `--- FILE: ${a.name} ---\n${a.text}\n--- END FILE ---`,
  );
  return `The user has attached the following file(s). Use them as primary context when answering:\n\n${blocks.join('\n\n')}\n\n`;
}
