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
  /** Persisted documents.id (shadow markdown). null if persistence failed. */
  documentId: string | null;
  /** True when extraction continues in background and text is not ready yet. */
  pending?: boolean;
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

async function extractTextFromPdfClient(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  try {
    type PdfJsModule = {
      GlobalWorkerOptions: { workerSrc: string };
      getDocument: (params: { data: ArrayBuffer }) => { promise: Promise<{ numPages: number; getPage: (pageNumber: number) => Promise<{ getTextContent: () => Promise<{ items: Array<{ str?: string }> }> }> }> };
    };

    const pdfjsLib = await (Function(
      'return import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs")',
    )() as Promise<PdfJsModule>);
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';

    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pageTexts: string[] = [];

    for (let i = 1; i <= Math.min(pdf.numPages, 40); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item: { str?: string }) => item.str || '')
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) pageTexts.push(text);
    }

    return pageTexts.join('\n\n');
  } catch (error) {
    logger.error('client PDF extraction failed', error);
    return '';
  }
}

/**
 * Create a documents row for the upload via SECURITY DEFINER RPC.
 * Returns documents.id, or null if creation failed (we still want the chat
 * to keep working — the shadow is a nice-to-have, not a blocker).
 */
async function createShadowDocument(args: {
  title: string;
  fileName: string;
  fileUrl: string;
  fileType: string | null;
  fileSizeBytes: number | null;
  description: string;
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('create_cowork_document', {
    p_title: args.title,
    p_file_name: args.fileName,
    p_file_url: args.fileUrl,
    p_file_type: args.fileType,
    p_file_size_bytes: args.fileSizeBytes,
    p_description: args.description,
    p_category: 'chat-attachment',
    p_tags: ['cowork'],
  });
  if (error) {
    logger.error('create_cowork_document failed', error);
    return null;
  }
  return (data as string) ?? null;
}

async function writeBackExtraction(
  documentId: string,
  status: 'success' | 'failed' | 'unsupported' | 'not_applicable',
  contentMd: string | null,
  errorMessage: string | null,
) {
  const { error } = await supabase.rpc('update_cowork_document_extraction', {
    p_document_id: documentId,
    p_status: status,
    p_content_md: contentMd,
    p_error: errorMessage,
  });
  if (error) {
    logger.error('update_cowork_document_extraction failed', error);
  }
}

async function parseTextFile(file: File): Promise<ParseResult> {
  const raw = await file.text();
  const { text, truncated } = truncate(raw);

  const docId = await createShadowDocument({
    title: file.name,
    fileName: file.name,
    fileUrl: 'inline:text', // text files aren't uploaded to storage
    fileType: file.type || 'text/plain',
    fileSizeBytes: file.size,
    description: 'Uploaded in cowork chat',
  });

  if (docId) {
    // For text files we already have the markdown — write it back immediately.
    await writeBackExtraction(docId, 'success', text, null);
  }

  return { text, truncated, kind: 'text', documentId: docId };
}

async function parsePdfFile(file: File): Promise<ParseResult> {
  const clientExtracted = await extractTextFromPdfClient(file);
  if (clientExtracted && clientExtracted.trim().length > 100) {
    const { text, truncated } = truncate(clientExtracted);
    const docId = await createShadowDocument({
      title: file.name,
      fileName: file.name,
      fileUrl: 'inline:pdf-text',
      fileType: file.type || PDF_MIME,
      fileSizeBytes: file.size,
      description: 'PDF uploaded in cowork chat',
    });

    if (docId) {
      await writeBackExtraction(docId, 'success', text, null);
    }

    return { text, truncated, kind: 'pdf', documentId: docId };
  }

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

  // Create the shadow document immediately (status: pending).
  const docId = await createShadowDocument({
    title: file.name,
    fileName: file.name,
    fileUrl: `cowork-uploads/${path}`,
    fileType: file.type || PDF_MIME,
    fileSizeBytes: file.size,
    description: 'PDF uploaded in cowork chat',
  });

  try {
    const { data, error } = await supabase.functions.invoke('extract-pdf-text', {
      body: { storage_path: `cowork-uploads/${path}`, document_id: docId },
    });
    if (error) throw new Error(error.message || 'extract-pdf-text failed');
    if (data?.queued) {
      return {
        text: '',
        truncated: false,
        kind: 'pdf',
        documentId: docId,
        pending: true,
      };
    }
    if (!data?.success) throw new Error(data?.error || 'PDF extraction returned no text');
    const { text, truncated } = truncate(String(data.text || ''));

    if (docId) {
      await writeBackExtraction(docId, 'success', text, null);
    }

    return { text, truncated, kind: 'pdf', documentId: docId };
  } catch (err) {
    if (docId) {
      await writeBackExtraction(
        docId,
        'failed',
        null,
        err instanceof Error ? err.message : 'extraction failed',
      );
    }
    throw err;
  }
  // NOTE: we no longer delete the PDF from storage — it's now the canonical
  // file backing the shadow document and must remain accessible.
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
