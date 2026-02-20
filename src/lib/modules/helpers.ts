/**
 * Shared helpers for module implementations.
 */

import { tiptapDocumentSchema } from '@/types/module-contracts';

/**
 * Generate URL-safe slug from title
 */
export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
    .substring(0, 100);
}

/**
 * Check if content is a Tiptap document
 */
export function isTiptapDocument(content: unknown): boolean {
  const result = tiptapDocumentSchema.safeParse(content);
  return result.success;
}
