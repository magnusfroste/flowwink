/**
 * Markdown editor for contract bodies. TipTap WYSIWYG with autosave to
 * `contracts.body_markdown`. Markdown is the source of truth so external
 * operators (ClawWink via MCP) get LLM-friendly content directly.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { Button } from '@/components/ui/button';
import {
  Bold, Italic, List, ListOrdered, Heading1, Heading2, Heading3,
  Quote, Undo, Redo, Link as LinkIcon, Save,
} from 'lucide-react';
import { useSaveContractBody } from '@/hooks/useContractWorkflow';
import { AITiptapToolbar } from '@/components/admin/AITiptapToolbar';
import { cn } from '@/lib/utils';

interface Props {
  contractId: string;
  initialMarkdown: string;
  readOnly?: boolean;
  onSaved?: () => void;
  /** Short context hint passed to AI utility actions (e.g. contract title + counterparty). */
  aiContext?: string;
}

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

export function ContractMarkdownEditor({ contractId, initialMarkdown, readOnly, onSaved, aiContext }: Props) {
  const save = useSaveContractBody();
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [dirty, setDirty] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSerializedRef = useRef<string>(initialMarkdown || '');

  const initialHtml = useMemo(() => {
    const md = initialMarkdown || '';
    return md ? (marked.parse(md) as string) : '';
  }, [initialMarkdown]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline' } }),
      Placeholder.configure({
        placeholder: 'Write the agreement here. Markdown is the source of truth — what you see is what ClawWink and the counterparty get.',
      }),
    ],
    content: initialHtml,
    editable: !readOnly,
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none min-h-[400px] focus:outline-none px-4 py-3',
      },
    },
    onUpdate: ({ editor }) => {
      const md = turndown.turndown(editor.getHTML());
      if (md === lastSerializedRef.current) return;
      lastSerializedRef.current = md;
      setDirty(true);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        save.mutate(
          { id: contractId, body_markdown: md },
          {
            onSuccess: () => {
              setSavedAt(new Date());
              setDirty(false);
              onSaved?.();
            },
          },
        );
      }, 1200);
    },
  });

  // Reload when contract changes (e.g. switching contracts)
  useEffect(() => {
    if (!editor) return;
    const html = initialMarkdown ? (marked.parse(initialMarkdown) as string) : '';
    if (lastSerializedRef.current !== (initialMarkdown || '')) {
      lastSerializedRef.current = initialMarkdown || '';
      editor.commands.setContent(html, { emitUpdate: false });
    }
  }, [contractId, initialMarkdown, editor]);

  const flushSave = () => {
    if (!editor || !dirty) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const md = turndown.turndown(editor.getHTML());
    save.mutate(
      { id: contractId, body_markdown: md },
      { onSuccess: () => { setSavedAt(new Date()); setDirty(false); onSaved?.(); } },
    );
  };

  if (!editor) return <div className="h-64 animate-pulse bg-muted/40 rounded-md" />;

  return (
    <div className="border rounded-md bg-card">
      {!readOnly && (
        <div className="flex items-center gap-1 border-b p-1.5 flex-wrap">
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive('heading', { level: 1 })}><Heading1 className="h-4 w-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive('heading', { level: 2 })}><Heading2 className="h-4 w-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive('heading', { level: 3 })}><Heading3 className="h-4 w-4" /></ToolBtn>
          <span className="w-px h-5 bg-border mx-1" />
          <ToolBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')}><Bold className="h-4 w-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')}><Italic className="h-4 w-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')}><List className="h-4 w-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')}><ListOrdered className="h-4 w-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')}><Quote className="h-4 w-4" /></ToolBtn>
          <ToolBtn onClick={() => {
            const url = window.prompt('Link URL');
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }} active={editor.isActive('link')}><LinkIcon className="h-4 w-4" /></ToolBtn>
          <span className="w-px h-5 bg-border mx-1" />
          <ToolBtn onClick={() => editor.chain().focus().undo().run()}><Undo className="h-4 w-4" /></ToolBtn>
          <ToolBtn onClick={() => editor.chain().focus().redo().run()}><Redo className="h-4 w-4" /></ToolBtn>
          <span className="w-px h-5 bg-border mx-1" />
          {/* Klass 1 AI utilities — pure text transforms (improve, translate, summarize). Always available, no FlowPilot dependency. */}
          <AITiptapToolbar editor={editor} context={aiContext} />
          <div className="ml-auto flex items-center gap-2 pr-1 text-xs text-muted-foreground">
            {save.isPending ? 'Saving…' : dirty ? 'Unsaved changes' : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : 'Markdown · auto-save'}
            {dirty && (
              <Button size="sm" variant="ghost" onClick={flushSave} className="h-7 px-2">
                <Save className="h-3.5 w-3.5 mr-1" /> Save now
              </Button>
            )}
          </div>
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}

function ToolBtn({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-8 w-8 inline-flex items-center justify-center rounded hover:bg-accent text-muted-foreground',
        active && 'bg-accent text-accent-foreground',
      )}
    >
      {children}
    </button>
  );
}
