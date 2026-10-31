import { useUiText } from '@/lib/ui-text';

/** The employment type in the visitor's language. */
export function useEmploymentLabel(): (type: string) => string {
  const t = useUiText();
  return (type: string) => ({
    full_time: t('careers.fullTime', 'Full-time'),
    part_time: t('careers.partTime', 'Part-time'),
    contract: t('careers.contract', 'Contract'),
    temporary: t('careers.temporary', 'Temporary'),
    internship: t('careers.internship', 'Internship'),
  } as Record<string, string>)[type] ?? type;
}
