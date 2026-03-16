import { cn } from '@/lib/utils';

export interface QuickLink {
  id: string;
  label: string;
  url: string;
  icon?: string;
}

export interface QuickLinksBlockData {
  heading?: string;          // "Hur kan vi hjälpa dig?"
  links: QuickLink[];
  variant?: 'dark' | 'primary' | 'muted';  // background variant
  layout?: 'centered' | 'split';  // heading left, buttons right
}

export function QuickLinksBlock({ data }: { data: QuickLinksBlockData }) {
  const { heading, links = [], variant = 'dark', layout = 'split' } = data;

  if (links.length === 0) return null;

  const bgClasses = {
    dark: 'bg-foreground text-background',
    primary: 'bg-primary text-primary-foreground',
    muted: 'bg-muted text-foreground',
  };

  const buttonClasses = {
    dark: 'border-background/30 text-background hover:bg-background/10',
    primary: 'border-primary-foreground/30 text-primary-foreground hover:bg-primary-foreground/10',
    muted: 'border-foreground/20 text-foreground hover:bg-foreground/5',
  };

  return (
    <section className={cn(bgClasses[variant])}>
      <div className={cn(
        'container mx-auto max-w-6xl px-6',
        layout === 'split' ? 'flex flex-col md:flex-row md:items-center md:gap-10' : 'text-center'
      )}>
        {heading && (
          <p className={cn(
            'font-semibold text-lg shrink-0',
            layout === 'split' ? 'mb-4 md:mb-0' : 'mb-5'
          )}>
            {heading}
          </p>
        )}
        <div className={cn(
          'flex flex-wrap gap-3',
          layout === 'centered' && 'justify-center'
        )}>
          {links.map((link) => (
            <a
              key={link.id}
              href={link.url}
              className={cn(
                'px-5 py-2.5 rounded-full border text-sm font-medium transition-colors',
                buttonClasses[variant]
              )}
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
