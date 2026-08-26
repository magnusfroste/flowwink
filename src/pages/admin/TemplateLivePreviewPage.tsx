import { useSearchParams } from 'react-router-dom';
import { ALL_TEMPLATES } from '@/data/templates';
import { PageBlocks } from '@/components/public/PageBlocks';
import { TemplateBrandingProvider } from '@/components/admin/templates/TemplateBrandingProvider';
import { ContentBlock } from '@/types/cms';
import { cn } from '@/lib/utils';

export default function TemplateLivePreviewPage() {
  const [params] = useSearchParams();
  const templateId = params.get('id');
  const pageIdx = parseInt(params.get('page') || '0', 10);

  const template = ALL_TEMPLATES.find(t => t.id === templateId);
  if (!template) {
    return <div className="flex items-center justify-center h-screen text-muted-foreground">Template not found</div>;
  }

  const page = template.pages?.[pageIdx];
  const isDark = template.branding?.defaultTheme === 'dark';

  return (
    <TemplateBrandingProvider branding={template.branding || {}}>
      <div className={cn("min-h-screen", isDark && "dark")}
        style={{
          backgroundColor: isDark ? 'hsl(222 47% 11%)' : 'hsl(0 0% 100%)',
          color: isDark ? 'hsl(0 0% 100%)' : 'hsl(222 47% 11%)',
        }}
      >
        <PageBlocks blocks={(page?.blocks || []) as ContentBlock[]} />
        {(!page?.blocks || page.blocks.length === 0) && (
          <div className="flex items-center justify-center h-screen text-muted-foreground">
            No blocks on this page
          </div>
        )}
      </div>
    </TemplateBrandingProvider>
  );
}
