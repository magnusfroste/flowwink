import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { TwoColumnBlockData } from '@/types/cms';
import { Bold, Italic, List, ListOrdered, ArrowLeftRight } from 'lucide-react';

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
      Placeholder.configure({ placeholder: 'Skriv ditt innehåll här...' }),
    ],
    content: data.content || '',
    editable: isEditing,
    onUpdate: ({ editor }) => {
      onChange({ ...data, content: editor.getHTML() });
    },
  });

  const handleImageChange = (field: 'imageSrc' | 'imageAlt', value: string) => {
    onChange({ ...data, [field]: value });
  };

  const togglePosition = () => {
    onChange({ ...data, imagePosition: data.imagePosition === 'left' ? 'right' : 'left' });
  };

  if (isEditing) {
    return (
      <div className="space-y-4 p-4">
        <div className="flex items-center justify-between">
          <Label>Bildposition</Label>
          <Button variant="outline" size="sm" onClick={togglePosition}>
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            {data.imagePosition === 'left' ? 'Bild vänster' : 'Bild höger'}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-4">
            <div>
              <Label>Bild-URL</Label>
              <Input
                value={data.imageSrc || ''}
                onChange={(e) => handleImageChange('imageSrc', e.target.value)}
                placeholder="https://example.com/bild.jpg"
              />
            </div>
            <div>
              <Label>Alt-text</Label>
              <Input
                value={data.imageAlt || ''}
                onChange={(e) => handleImageChange('imageAlt', e.target.value)}
                placeholder="Beskrivning av bilden"
              />
            </div>
            {data.imageSrc && (
              <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                <img 
                  src={data.imageSrc} 
                  alt={data.imageAlt || ''} 
                  className="w-full h-full object-cover"
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Textinnehåll</Label>
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
            Ingen bild vald
          </div>
        )}
      </div>
      <div 
        className="prose prose-sm max-w-none self-center"
        dangerouslySetInnerHTML={{ __html: data.content || '<p>Inget innehåll</p>' }}
      />
    </div>
  );
}
