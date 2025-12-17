import { InfoBoxBlockData, TiptapDocument } from '@/types/cms';
import { Info, CheckCircle, AlertTriangle, Lightbulb } from 'lucide-react';
import { generateHTML } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

// Helper to check if content is Tiptap JSON
function isTiptapDocument(content: unknown): content is TiptapDocument {
  return typeof content === 'object' && content !== null && (content as TiptapDocument).type === 'doc';
}

// Render content as HTML (handles both legacy plaintext/HTML and Tiptap JSON)
function renderContent(content: string | TiptapDocument | undefined): string {
  if (!content) return '';
  if (isTiptapDocument(content)) {
    return generateHTML(content, [StarterKit, Link]);
  }
  // Legacy plaintext/HTML
  return content.includes('<') ? content : `<p>${content}</p>`;
}

interface InfoBoxBlockProps {
  data: InfoBoxBlockData;
}

const variantStyles = {
  info: {
    bg: 'bg-info/10',
    border: 'border-info/30',
    icon: 'text-info',
    IconComponent: Info,
  },
  success: {
    bg: 'bg-success/10',
    border: 'border-success/30',
    icon: 'text-success',
    IconComponent: CheckCircle,
  },
  warning: {
    bg: 'bg-warning/10',
    border: 'border-warning/30',
    icon: 'text-warning',
    IconComponent: AlertTriangle,
  },
  highlight: {
    bg: 'bg-primary/5',
    border: 'border-primary/20',
    icon: 'text-primary',
    IconComponent: Lightbulb,
  },
};

export function InfoBoxBlock({ data }: InfoBoxBlockProps) {
  const style = variantStyles[data.variant] || variantStyles.info;
  const Icon = style.IconComponent;

  return (
    <section className="py-8 px-6">
      <div className="container mx-auto max-w-3xl">
        <div className={`p-6 rounded-lg border ${style.bg} ${style.border}`}>
          <div className="flex items-start gap-4">
            <Icon className={`h-6 w-6 shrink-0 mt-0.5 ${style.icon}`} />
            <div>
              {data.title && (
                <h3 className="font-semibold mb-2">{data.title}</h3>
              )}
              <div 
                className="prose prose-sm dark:prose-invert max-w-none"
                dangerouslySetInnerHTML={{ __html: renderContent(data.content) }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
