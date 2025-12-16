import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { TwoColumnBlockData, TiptapDocument } from '@/types/cms';
import { Bold, Italic, List, ListOrdered, ArrowLeftRight } from 'lucide-react';
import { ImageUploader } from '../ImageUploader';
import { generateHTML } from '@tiptap/react';

// Helper to check if content is Tiptap JSON
function isTiptapDocument(content: unknown): content is TiptapDocument {
  return typeof content === 'object' && content !== null && (content as TiptapDocument).type === 'doc';
}

// Get initial content for editor (convert JSON to HTML for Tiptap)
function getEditorContent(content: string | TiptapDocument | undefined): string {
  if (!content) return '';
  if (isTiptapDocument(content)) {
    return generateHTML(content, [StarterKit, Link]);
  }
  return content;
}

interface TwoColumnBlockEditorProps {
  data: TwoColumnBlockData;
  isEditing: boolean;
  onChange: (data: TwoColumnBlockData) => void;
}

export function TwoColumnBlockEditor({ data, isEditing, onChange }: TwoColumnBlockEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Write your content here...' }),
    ],
    content: getEditorContent(data.content),
    editable: isEditing,
    onUpdate: ({ editor }) => {
      // Save as Tiptap JSON instead of HTML
      onChange({ ...data, content: editor.getJSON() as TiptapDocument });
    },
  });

  const togglePosition = () => {
    onChange({ ...data, imagePosition: data.imagePosition === 'left' ? 'right' : 'left' });
  };

  // Helper to render content as HTML for preview
  const renderContent = (): string => {
    if (!data.content) return '<p>No content</p>';
    if (isTiptapDocument(data.content)) {
      return generateHTML(data.content, [StarterKit, Link]);
    }
    return data.content;
  };

  if (isEditing) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <Label>Image position</Label>
          <Button variant="outline" size="sm" onClick={togglePosition}>
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            {data.imagePosition === 'left' ? 'Image left' : 'Image right'}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-4">
            <ImageUploader
              value={data.imageSrc || ''}
              onChange={(url) => onChange({ ...data, imageSrc: url })}
              label="Image"
            />
            <div>
              <Label>Alt text</Label>
              <Input
                value={data.imageAlt || ''}
                onChange={(e) => onChange({ ...data, imageAlt: e.target.value })}
                placeholder="Description of the image"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Text content</Label>
            {editor && (
              <>
                <div className="flex gap-1 border-b pb-2 mb-2">
                  <Button
                    type="button"
                    variant={editor.isActive('bold') ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleBold().run()}
                  >
                    <Bold className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant={editor.isActive('italic') ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                  >
                    <Italic className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant={editor.isActive('bulletList') ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant={editor.isActive('orderedList') ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  >
                    <ListOrdered className="h-4 w-4" />
                  </Button>
                </div>
                <EditorContent 
                  editor={editor} 
                  className="prose prose-sm max-w-none min-h-[200px] border rounded-md p-3 focus-within:ring-2 focus-within:ring-ring"
                />
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Preview mode
  const imageFirst = data.imagePosition === 'left';

  return (
    <div className={`grid md:grid-cols-2 gap-8 p-6 ${imageFirst ? '' : 'md:[&>*:first-child]:order-2'}`}>
      <div className="aspect-video md:aspect-auto rounded-lg overflow-hidden bg-muted">
        {data.imageSrc ? (
          <img 
            src={data.imageSrc} 
            alt={data.imageAlt || ''} 
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            No image selected
          </div>
        )}
      </div>
      <div 
        className="prose prose-sm max-w-none self-center"
        dangerouslySetInnerHTML={{ __html: renderContent() }}
      />
    </div>
  );
}
