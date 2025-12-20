import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { InfoBoxBlockData, TiptapDocument } from '@/types/cms';
import { Info, CheckCircle, AlertTriangle, Sparkles, icons, Bold, Italic, List, ListOrdered, LucideIcon } from 'lucide-react';
import { useEditor, EditorContent, generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { AITextAssistant } from '../AITextAssistant';
import { AITiptapToolbar } from '../AITiptapToolbar';

// Helper to check if content is Tiptap JSON
function isTiptapDocument(content: unknown): content is TiptapDocument {
  return typeof content === 'object' && content !== null && (content as TiptapDocument).type === 'doc';
}

// Get initial content for editor
function getEditorContent(content: string | TiptapDocument | undefined): string {
  if (!content) return '';
  if (isTiptapDocument(content)) {
    return generateHTML(content, [StarterKit, Link]);
  }
  return `<p>${content}</p>`;
}

// Render content as HTML
function renderContent(content: string | TiptapDocument | undefined): string {
  if (!content) return '';
  if (isTiptapDocument(content)) {
    return generateHTML(content, [StarterKit, Link]);
  }
  return `<p>${content}</p>`;
}

const VARIANT_CONFIG = {
  default: {
    label: 'Default',
    icon: Info,
    className: 'bg-muted/50 border-border',
    iconClass: 'text-muted-foreground',
  },
  info: {
    label: 'Information',
    icon: Info,
    className: 'bg-info/10 border-info/30',
    iconClass: 'text-info',
  },
  success: {
    label: 'Success',
    icon: CheckCircle,
    className: 'bg-success/10 border-success/30',
    iconClass: 'text-success',
  },
  warning: {
    label: 'Warning',
    icon: AlertTriangle,
    className: 'bg-warning/10 border-warning/30',
    iconClass: 'text-warning',
  },
  highlight: {
    label: 'Highlight',
    icon: Sparkles,
    className: 'bg-primary/5 border-primary/20',
    iconClass: 'text-primary',
  },
};

const ICON_OPTIONS = [
  'Info', 'CheckCircle', 'AlertTriangle', 'Sparkles', 'Heart', 'Phone',
  'Calendar', 'Clock', 'MapPin', 'Mail', 'FileText', 'Users', 'Star', 'Bell'
];

interface InfoBoxBlockEditorProps {
  data: InfoBoxBlockData;
  isEditing: boolean;
  onChange: (data: InfoBoxBlockData) => void;
}

export function InfoBoxBlockEditor({ data, isEditing, onChange }: InfoBoxBlockEditorProps) {
  const variant = data.variant || 'info';
  const config = VARIANT_CONFIG[variant];

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: 'Write your message here...' }),
    ],
    content: getEditorContent(data.content),
    editable: isEditing,
    onUpdate: ({ editor }) => {
      onChange({ ...data, content: editor.getJSON() as TiptapDocument });
    },
  });

  const renderIcon = () => {
    if (data.icon) {
      const IconComponent = icons[data.icon as keyof typeof icons] as LucideIcon | undefined;
      if (IconComponent) {
        return <IconComponent className={`h-6 w-6 ${config.iconClass}`} />;
      }
    }
    const DefaultIcon = config.icon;
    return <DefaultIcon className={`h-6 w-6 ${config.iconClass}`} />;
  };

  if (isEditing) {
    return (
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Variant</Label>
            <Select 
              value={variant} 
              onValueChange={(v) => onChange({ ...data, variant: v as InfoBoxBlockData['variant'] })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(VARIANT_CONFIG).map(([key, { label }]) => (
                  <SelectItem key={key} value={key}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Icon (optional)</Label>
            <Select 
              value={data.icon || ''} 
              onValueChange={(v) => onChange({ ...data, icon: v || undefined })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Default icon" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Default icon</SelectItem>
                {ICON_OPTIONS.map((iconName) => {
                  const IconComponent = icons[iconName as keyof typeof icons] as LucideIcon | undefined;
                  return (
                    <SelectItem key={iconName} value={iconName}>
                      <div className="flex items-center gap-2">
                        {IconComponent && <IconComponent className="h-4 w-4" />}
                        <span>{iconName}</span>
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label>Title</Label>
          <div className="flex gap-2">
            <Input
              value={data.title || ''}
              onChange={(e) => onChange({ ...data, title: e.target.value })}
              placeholder="Important information"
              className="flex-1"
            />
            <AITextAssistant
              value={data.title || ''}
              onChange={(text) => onChange({ ...data, title: text })}
              actions={['expand', 'improve']}
              compact
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Content</Label>
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
                <div className="flex-1" />
                <AITiptapToolbar editor={editor} />
              </div>
              <EditorContent 
                editor={editor} 
                className="prose prose-sm max-w-none min-h-[100px] border rounded-md p-3 focus-within:ring-2 focus-within:ring-ring"
              />
            </>
          )}
        </div>

        <div className={`border rounded-lg p-4 ${config.className}`}>
          <div className="flex gap-3">
            {renderIcon()}
            <div>
              <h4 className="font-semibold">{data.title || 'Title'}</h4>
              <div 
                className="text-sm mt-1 opacity-90 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: renderContent(data.content) || 'Content...' }}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Preview mode
  return (
    <div className={`border rounded-lg p-6 m-4 ${config.className}`}>
      <div className="flex gap-4">
        {renderIcon()}
        <div>
        <h4 className="font-semibold text-lg">{data.title || 'Important information'}</h4>
          <div 
            className="mt-2 opacity-90 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{ __html: renderContent(data.content) || 'No content' }}
          />
        </div>
      </div>
    </div>
  );
}
