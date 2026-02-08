import { useEffect, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TwoColumnBlockData, TiptapDocument, TextTitleSize } from '@/types/cms';
import { Bold, Italic, List, ListOrdered, ArrowLeftRight, Pin, Heading1, Heading2, Quote } from 'lucide-react';
import { ImageUploader } from '../ImageUploader';
import { AITiptapToolbar } from '../AITiptapToolbar';
import { renderToHtml, getEditorContent as getEditorContentFromUtils } from '@/lib/tiptap-utils';

interface TwoColumnBlockEditorProps {
  data: TwoColumnBlockData;
  isEditing: boolean;
  onChange: (data: TwoColumnBlockData) => void;
}

export function TwoColumnBlockEditor({ data, isEditing, onChange }: TwoColumnBlockEditorProps) {
  // Get editor content using shared utility
  const initialContent = getEditorContentFromUtils(data.content);
  
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Write your content here...' }),
    ],
    content: initialContent,
    editable: isEditing,
    onUpdate: ({ editor }) => {
      // Save as Tiptap JSON instead of HTML
      onChange({ ...data, content: editor.getJSON() as TiptapDocument });
    },
  });

  // Update editable state when isEditing changes
  useEffect(() => {
    if (editor) {
      editor.setEditable(isEditing);
    }
  }, [editor, isEditing]);

  const togglePosition = () => {
    onChange({ ...data, imagePosition: data.imagePosition === 'left' ? 'right' : 'left' });
  };

  // Focus editor on click
  const handleEditorClick = useCallback(() => {
    if (editor && isEditing) {
      editor.commands.focus();
    }
  }, [editor, isEditing]);

  if (isEditing) {
    return (
      <div className="space-y-4 p-4">
        {/* Design System 2026: Premium Header Settings */}
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
                placeholder="e.g., ABOUT US, SERVICES"
                className="text-sm"
              />
            </div>
            
            {/* Eyebrow Color */}
            <div className="space-y-2">
              <Label htmlFor="eyebrowColor" className="text-sm">Eyebrow Color</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="eyebrowColor"
                  type="color"
                  value={data.eyebrowColor || '#003d99'}
                  onChange={(e) => onChange({ ...data, eyebrowColor: e.target.value })}
                  className="h-9 w-16"
                />
                {data.eyebrowColor && (
                  <button
                    type="button"
                    onClick={() => onChange({ ...data, eyebrowColor: undefined })}
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Use brand default
                  </button>
                )}
                {!data.eyebrowColor && (
                  <span className="text-xs text-muted-foreground">Using brand primary</span>
                )}
              </div>
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
                placeholder="e.g., Excellence, Experience"
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

          <div className="grid grid-cols-2 gap-4">
            {/* CTA Text */}
            <div className="space-y-2">
              <Label htmlFor="ctaText" className="text-sm">CTA Link Text</Label>
              <Input
                id="ctaText"
                value={data.ctaText || ''}
                onChange={(e) => onChange({ ...data, ctaText: e.target.value })}
                placeholder="e.g., MORE ABOUT US"
                className="text-sm"
              />
            </div>
            
            {/* CTA URL */}
            <div className="space-y-2">
              <Label htmlFor="ctaUrl" className="text-sm">CTA Link URL</Label>
              <Input
                id="ctaUrl"
                value={data.ctaUrl || ''}
                onChange={(e) => onChange({ ...data, ctaUrl: e.target.value })}
                placeholder="/about-us or https://..."
                className="text-sm"
              />
            </div>
          </div>

          {/* Background Color */}
          <div className="space-y-2">
            <Label htmlFor="backgroundColor" className="text-sm">Section Background Color</Label>
            <div className="flex gap-2">
              <Input
                id="backgroundColor"
                type="color"
                value={data.backgroundColor || '#ffffff'}
                onChange={(e) => onChange({ ...data, backgroundColor: e.target.value })}
                className="h-9 w-20"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => onChange({ ...data, backgroundColor: undefined })}
              >
                Clear
              </Button>
            </div>
          </div>
        </div>

        {/* Layout controls */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Label>Image position</Label>
            <Button variant="outline" size="sm" onClick={togglePosition}>
              <ArrowLeftRight className="h-4 w-4 mr-2" />
              {data.imagePosition === 'left' ? 'Image left' : 'Image right'}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Pin className="h-4 w-4 text-muted-foreground" />
            <Label>Sticky column</Label>
            <Select
              value={data.stickyColumn || 'none'}
              onValueChange={(value) => onChange({ ...data, stickyColumn: value as 'none' | 'image' | 'text' })}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="image">Image</SelectItem>
                <SelectItem value="text">Text</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-4">
            <ImageUploader
              value={data.imageSrc || ''}
              onChange={(url) => onChange({ ...data, imageSrc: url })}
              label="Primary Image"
            />
            <div>
              <Label>Alt text</Label>
              <Input
                value={data.imageAlt || ''}
                onChange={(e) => onChange({ ...data, imageAlt: e.target.value })}
                placeholder="Description of the image"
              />
            </div>

            {/* Second Image for stacked effect */}
            <div className="pt-4 border-t">
              <ImageUploader
                value={data.secondImageSrc || ''}
                onChange={(url) => onChange({ ...data, secondImageSrc: url })}
                label="Second Image (Stacked Effect)"
              />
              {data.secondImageSrc && (
                <div className="mt-2">
                  <Label>Second image alt text</Label>
                  <Input
                    value={data.secondImageAlt || ''}
                    onChange={(e) => onChange({ ...data, secondImageAlt: e.target.value })}
                    placeholder="Description of second image"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Text content</Label>
            {editor && (
              <>
                <div className="flex gap-1 border-b pb-2 mb-2 flex-wrap">
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
                    variant={editor.isActive('heading', { level: 1 }) ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                  >
                    <Heading1 className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant={editor.isActive('heading', { level: 2 }) ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  >
                    <Heading2 className="h-4 w-4" />
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
                  <Button
                    type="button"
                    variant={editor.isActive('blockquote') ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                  >
                    <Quote className="h-4 w-4" />
                  </Button>
                  <div className="flex-1" />
                  <AITiptapToolbar editor={editor} />
                </div>
                <div onClick={handleEditorClick} className="cursor-text">
                  <EditorContent 
                    editor={editor} 
                    className="prose prose-sm max-w-none min-h-[200px] border rounded-md p-3 focus-within:ring-2 focus-within:ring-ring"
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Preview mode - match public TwoColumnBlock layout
  const imageFirst = data.imagePosition === 'left';
  const htmlContent = renderToHtml(data.content);
  const hasHeader = data.eyebrow || data.title;

  const renderAccentTitle = () => {
    if (!data.title) return null;
    const accentText = data.accentText;
    const accentPosition = data.accentPosition || 'end';
    if (!accentText) return <span>{data.title}</span>;
    const accentSpan = (
      <span className="font-serif italic" style={{ fontFamily: "'Playfair Display', Georgia, serif" }}>
        {accentText}
      </span>
    );
    switch (accentPosition) {
      case 'start': return <>{accentSpan} {data.title}</>;
      case 'inline': {
        const parts = data.title.split(accentText);
        if (parts.length > 1) return <>{parts[0]}{accentSpan}{parts.slice(1).join(accentText)}</>;
        return <>{data.title} {accentSpan}</>;
      }
      default: return <>{data.title} {accentSpan}</>;
    }
  };

  return (
    <div
      className="py-6 px-6 rounded-lg"
      style={data.backgroundColor ? { backgroundColor: data.backgroundColor } : undefined}
    >
      <div className={`grid md:grid-cols-2 gap-6 ${imageFirst ? '' : 'md:[&>*:first-child]:order-2'}`}>
        <div className="relative aspect-video md:aspect-auto rounded-lg overflow-hidden bg-muted">
          {data.imageSrc ? (
            <img
              src={data.imageSrc}
              alt={data.imageAlt || ''}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full min-h-[120px] flex items-center justify-center text-muted-foreground text-sm">
              No image selected
            </div>
          )}
          {data.secondImageSrc && (
            <div className="absolute -bottom-3 -right-3 w-1/2 rounded-lg overflow-hidden border-4 border-background shadow-lg">
              <img src={data.secondImageSrc} alt={data.secondImageAlt || ''} className="w-full h-full object-cover" />
            </div>
          )}
        </div>
        <div className="self-center space-y-3">
          {hasHeader && (
            <div>
              {data.eyebrow && (
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-2 text-accent-foreground">
                  {data.eyebrow}
                </p>
              )}
              {data.title && (
                <h3 className="text-xl font-bold tracking-tight leading-tight">
                  {renderAccentTitle()}
                </h3>
              )}
            </div>
          )}
          {htmlContent && (
            <div
              className="prose prose-sm dark:prose-invert max-w-none text-xs"
              dangerouslySetInnerHTML={{ __html: htmlContent }}
            />
          )}
          {data.ctaText && (
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              {data.ctaText} →
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
