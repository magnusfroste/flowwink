import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { ResizableImage } from '@/components/admin/ResizableImageExtension';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { Bold, Italic, List, ListOrdered, Quote, Heading1, Heading2, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';
import { AITiptapToolbar } from '@/components/admin/AITiptapToolbar';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { MediaLibraryPicker } from '@/components/admin/MediaLibraryPicker';
import { UnsplashPicker } from '@/components/admin/UnsplashPicker';

interface NewsletterEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export function NewsletterEditor({ content, onChange, placeholder = 'Write your newsletter content...' }: NewsletterEditorProps) {
  const [linkUrl, setLinkUrl] = useState('');
  const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
  const [imagePopoverOpen, setImagePopoverOpen] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [unsplashOpen, setUnsplashOpen] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      Link.configure({ 
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline',
        },
      }),
      ResizableImage,
    ],
    content: content || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  // Sync content when it changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content || '');
    }
  }, [content, editor]);

  const handleAddLink = () => {
    if (linkUrl && editor) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
      setLinkUrl('');
      setLinkPopoverOpen(false);
    }
  };

  const handleRemoveLink = () => {
    if (editor) {
      editor.chain().focus().unsetLink().run();
      setLinkPopoverOpen(false);
    }
  };

  const handleInsertImage = (url: string) => {
    if (editor && url) {
      editor.chain().focus().insertContent({
        type: 'image',
        attrs: { src: url, align: 'center' },
      }).run();
      setImagePopoverOpen(false);
    }
  };

  if (!editor) return null;

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-3 py-2 flex items-center gap-1 flex-wrap bg-muted/30">
        <Toggle
          size="sm"
          pressed={editor.isActive('bold')}
          onPressedChange={() => editor.chain().focus().toggleBold().run()}
          aria-label="Bold"
        >
          <Bold className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('italic')}
          onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          aria-label="Italic"
        >
          <Italic className="h-4 w-4" />
        </Toggle>
        <Separator orientation="vertical" className="h-6 mx-2" />
        <Toggle
          size="sm"
          pressed={editor.isActive('heading', { level: 1 })}
          onPressedChange={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          aria-label="Heading 1"
        >
          <Heading1 className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('heading', { level: 2 })}
          onPressedChange={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          aria-label="Heading 2"
        >
          <Heading2 className="h-4 w-4" />
        </Toggle>
        <Separator orientation="vertical" className="h-6 mx-2" />
        <Toggle
          size="sm"
          pressed={editor.isActive('bulletList')}
          onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
          aria-label="Bullet list"
        >
          <List className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('orderedList')}
          onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
          aria-label="Numbered list"
        >
          <ListOrdered className="h-4 w-4" />
        </Toggle>
        <Toggle
          size="sm"
          pressed={editor.isActive('blockquote')}
          onPressedChange={() => editor.chain().focus().toggleBlockquote().run()}
          aria-label="Quote"
        >
          <Quote className="h-4 w-4" />
        </Toggle>
        <Separator orientation="vertical" className="h-6 mx-2" />
        
        {/* Link Button */}
        <Popover open={linkPopoverOpen} onOpenChange={setLinkPopoverOpen}>
          <PopoverTrigger asChild>
            <Toggle
              size="sm"
              pressed={editor.isActive('link')}
              aria-label="Add link"
            >
              <LinkIcon className="h-4 w-4" />
            </Toggle>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-3" align="start">
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-medium">URL</label>
                <Input
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddLink();
                    }
                  }}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddLink} disabled={!linkUrl}>
                  Add Link
                </Button>
                {editor.isActive('link') && (
                  <Button size="sm" variant="outline" onClick={handleRemoveLink}>
                    Remove Link
                  </Button>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        
        {/* Image Button */}
        <Popover open={imagePopoverOpen} onOpenChange={setImagePopoverOpen}>
          <PopoverTrigger asChild>
            <Toggle
              size="sm"
              pressed={editor.isActive('image')}
              aria-label="Add image"
            >
              <ImageIcon className="h-4 w-4" />
            </Toggle>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-3" align="start">
            <div className="space-y-2">
              <p className="text-sm font-medium mb-3">Insert image from</p>
              <Button 
                variant="outline" 
                className="w-full justify-start" 
                onClick={() => {
                  setImagePopoverOpen(false);
                  setMediaLibraryOpen(true);
                }}
              >
                <ImageIcon className="h-4 w-4 mr-2" />
                Media Library
              </Button>
              <Button 
                variant="outline" 
                className="w-full justify-start" 
                onClick={() => {
                  setImagePopoverOpen(false);
                  setUnsplashOpen(true);
                }}
              >
                <ImageIcon className="h-4 w-4 mr-2" />
                Unsplash
              </Button>
            </div>
          </PopoverContent>
        </Popover>
        
        <Separator orientation="vertical" className="h-6 mx-2" />
        <AITiptapToolbar editor={editor} context="newsletter email content" />
      </div>
      <EditorContent 
        editor={editor} 
        className="tiptap min-h-[200px] prose prose-sm max-w-none p-4" 
      />
      
      {/* Media Library Dialog */}
      <MediaLibraryPicker
        open={mediaLibraryOpen}
        onOpenChange={setMediaLibraryOpen}
        onSelect={handleInsertImage}
      />
      
      {/* Unsplash Dialog */}
      <UnsplashPicker
        open={unsplashOpen}
        onOpenChange={setUnsplashOpen}
        onSelect={handleInsertImage}
      />
    </div>
  );
}
