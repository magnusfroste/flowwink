import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Languages } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkingLanguage } from '@/hooks/useWorkingLanguage';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface PageLanguageSwitchProps {
  /** The page currently open in the editor. */
  pageId: string;
  translationGroupId?: string | null;
  locale?: string | null;
}

/**
 * Moves the editor between the language versions of the page it is on.
 *
 * The same gesture as the language chooser in the pages list, carried into the
 * editor so a translator never has to go back out to switch. Choosing a
 * language here also sets the working language, so the list agrees when they
 * return to it — one choice, not two that can disagree.
 *
 * Renders nothing when the page has no siblings, which is every page on a
 * single-language site.
 */
export function PageLanguageSwitch({ pageId, translationGroupId, locale }: PageLanguageSwitchProps) {
  const navigate = useNavigate();
  const { setLang } = useWorkingLanguage();

  const { data: siblings = [] } = useQuery({
    queryKey: ['page-language-siblings', translationGroupId],
    enabled: !!translationGroupId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pages')
        .select('id, slug, title, locale, status')
        .eq('translation_group_id', translationGroupId!)
        .is('deleted_at', null)
        .order('locale', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; slug: string; title: string; locale: string | null; status: string }>;
    },
    staleTime: 1000 * 60,
  });

  if (siblings.length < 2) return null;

  const current = String(locale ?? '').toLowerCase();

  return (
    <div className="flex items-center gap-1 rounded-md border p-0.5" role="group" aria-label="Page language">
      <Languages className="h-4 w-4 mx-1.5 text-muted-foreground" aria-hidden="true" />
      {siblings.map((sibling) => {
        const code = String(sibling.locale ?? '').toLowerCase();
        const isCurrent = sibling.id === pageId || code === current;
        return (
          <Tooltip key={sibling.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-current={isCurrent ? 'true' : undefined}
                onClick={() => {
                  if (isCurrent) return;
                  if (code) setLang(code);
                  navigate(`/admin/pages/${sibling.id}`);
                }}
                className={cn(
                  'px-2 py-1 rounded text-xs font-medium uppercase transition-colors',
                  isCurrent ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground',
                )}
              >
                {code || '—'}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {sibling.title}
              {sibling.status !== 'published' && ` — ${sibling.status}`}
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}
