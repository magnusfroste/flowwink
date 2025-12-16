import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { Bold, Italic, List, ListOrdered, Quote, Heading1, Heading2 } from 'lucide-react';
import { TextBlockData, TiptapDocument } from '@/types/cms';
import { AITiptapToolbar } from '@/components/admin/AITiptapToolbar';

// Helper to check if content is Tiptap JSON
function isTiptapDocument(content: string | TiptapDocument): content is TiptapDocument {
  return typeof content === 'object' && content !== null && content.type === 'doc';
}

// Convert content to editor-compatible format
function getEditorContent(content: string | TiptapDocument | undefined): string | TiptapDocument {
  if (!content) return '';
  if (isTiptapDocument(content)) return content;
  return content; // HTML string for legacy content
}

interface TextBlockEditorProps {
  data: TextBlockData;
  onChange: (data: TextBlockData) => void;
  isEditing: boolean;
}

export function TextBlockEditor({ data, onChange, isEditing }: TextBlockEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Write your content here...' }),
      Link.configure({ openOnClick: false }),
    ],
    content: getEditorContent(data.content),
    editable: isEditing,
    onUpdate: ({ editor }) => {
      // Save as Tiptap JSON for new content (headless-ready)
      onChange({ ...data, content: editor.getJSON() as TiptapDocument });
    },
  });

  useEffect(() => {
    if (editor && editor.isEditable !== isEditing) {
      editor.setEditable(isEditing);
    }
  }, [editor, isEditing]);

  useEffect(() => {
    // Compare JSON content properly
    const currentContent = editor?.getJSON();
    const newContent = getEditorContent(data.content);
    
    if (editor && JSON.stringify(currentContent) !== JSON.stringify(newContent)) {
      editor.commands.setContent(newContent);
    }
  }, [data.content, editor]);

  if (!editor) return null;

  return (
    <div className="rounded-lg border bg-card">
      {isEditing && (
        <div className="border-b px-3 py-2 flex items-center gap-1 flex-wrap bg-muted/30">
          <Toggle
            size="sm"
            pressed={editor.isActive('bold')}
            onPressedChange={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive('italic')}
            onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </Toggle>
          <Separator orientation="vertical" className="h-6 mx-2" />
          <Toggle
            size="sm"
            pressed={editor.isActive('heading', { level: 1 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          >
            <Heading1 className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive('heading', { level: 2 })}
            onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 className="h-4 w-4" />
          </Toggle>
          <Separator orientation="vertical" className="h-6 mx-2" />
          <Toggle
            size="sm"
            pressed={editor.isActive('bulletList')}
            onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive('orderedList')}
            onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            pressed={editor.isActive('blockquote')}
            onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
          >
            <Quote className="h-4 w-4" />
          </Toggle>
          <Separator orientation="vertical" className="h-6 mx-2" />
          <AITiptapToolbar editor={editor} />
        </div>
      )}
      <EditorContent editor={editor} className="tiptap min-h-[100px]" />
    </div>
  );
}
