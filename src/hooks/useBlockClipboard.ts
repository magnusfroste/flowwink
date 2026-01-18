import { useState, useEffect, useCallback } from 'react';
import { ContentBlock } from '@/types/cms';

const CLIPBOARD_KEY = 'cms_block_clipboard';

export interface ClipboardBlock {
  block: ContentBlock;
  copiedAt: string;
}

export function useBlockClipboard() {
  const [clipboardBlock, setClipboardBlock] = useState<ClipboardBlock | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(CLIPBOARD_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ClipboardBlock;
        // Only keep if copied within last hour
        const copiedAt = new Date(parsed.copiedAt);
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (copiedAt > hourAgo) {
          setClipboardBlock(parsed);
        } else {
          localStorage.removeItem(CLIPBOARD_KEY);
        }
      }
    } catch {
      localStorage.removeItem(CLIPBOARD_KEY);
    }
  }, []);

  const copyBlock = useCallback((block: ContentBlock) => {
    const clipboardData: ClipboardBlock = {
      block: { ...block, id: crypto.randomUUID() }, // New ID for paste
      copiedAt: new Date().toISOString(),
    };
    localStorage.setItem(CLIPBOARD_KEY, JSON.stringify(clipboardData));
    setClipboardBlock(clipboardData);
  }, []);

  const pasteBlock = useCallback((): ContentBlock | null => {
    if (!clipboardBlock) return null;
    // Return block with fresh ID each time
    return { ...clipboardBlock.block, id: crypto.randomUUID() };
  }, [clipboardBlock]);

  const clearClipboard = useCallback(() => {
    localStorage.removeItem(CLIPBOARD_KEY);
    setClipboardBlock(null);
  }, []);

  return {
    hasBlock: !!clipboardBlock,
    clipboardBlock: clipboardBlock?.block ?? null,
    copyBlock,
    pasteBlock,
    clearClipboard,
  };
}
