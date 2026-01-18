import { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bold, Italic, List, ListOrdered, Quote, Heading1, Heading2 } from 'lucide-react';
import { TextBlockData, TiptapDocument, TextTitleSize } from '@/types/cms';
import { AITiptapToolbar } from '@/components/admin/AITiptapToolbar';
import { getEditorContent } from '@/lib/tiptap-utils';

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
    <div className="space-y-4">
      {/* Design System 2026: Premium Header Settings */}
      {isEditing && (
        <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Design System 2026
          </p>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Eyebrow */}
            <div className="space-y-2">
              <Label htmlFor="eyebrow" className="text-sm">Eyebrow Label</Label>
              <Input
                id="eyebrow"
                value={data.eyebrow || ''}
                onChange={(e) => onChange({ ...data, eyebrow: e.target.value })}
                placeholder="e.g., SERVICES, ABOUT US"
                className="text-sm"
              />
            </div>
            
            {/* Eyebrow Color */}
            <div className="space-y-2">
              <Label htmlFor="eyebrowColor" className="text-sm">Eyebrow Color</Label>
              <Input
                id="eyebrowColor"
                type="color"
                value={data.eyebrowColor || '#f97316'}
                onChange={(e) => onChange({ ...data, eyebrowColor: e.target.value })}
                className="h-9 w-full"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Display Title */}
            <div className="space-y-2">
              <Label htmlFor="title" className="text-sm">Display Title</Label>
              <Input
                id="title"
                value={data.title || ''}
                onChange={(e) => onChange({ ...data, title: e.target.value })}
                placeholder="Large heading above content"
                className="text-sm"
              />
            </div>
            
            {/* Title Size */}
            <div className="space-y-2">
              <Label className="text-sm">Title Size</Label>
              <Select
                value={data.titleSize || 'default'}
                onValueChange={(value: TextTitleSize) => onChange({ ...data, titleSize: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                  <SelectItem value="display">Display (XL)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Accent Text */}
            <div className="space-y-2">
              <Label htmlFor="accentText" className="text-sm">Accent Text (Script Font)</Label>
              <Input
                id="accentText"
                value={data.accentText || ''}
                onChange={(e) => onChange({ ...data, accentText: e.target.value })}
                placeholder="e.g., Excellence, Beauty"
                className="text-sm font-serif italic"
              />
            </div>
            
            {/* Accent Position */}
            <div className="space-y-2">
              <Label className="text-sm">Accent Position</Label>
              <Select
                value={data.accentPosition || 'end'}
                onValueChange={(value: 'start' | 'end' | 'inline') => onChange({ ...data, accentPosition: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="start">Before Title</SelectItem>
                  <SelectItem value="end">After Title</SelectItem>
                  <SelectItem value="inline">Replace in Title</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
      
      {/* Rich Text Editor */}
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
    </div>
  );
}
