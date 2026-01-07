import { cn } from '@/lib/utils';
import { Award, Shield, CheckCircle, Star, Medal, Trophy } from 'lucide-react';

export interface BadgeItem {
  id: string;
  title: string;
  subtitle?: string;
  icon?: 'award' | 'shield' | 'check' | 'star' | 'medal' | 'trophy';
  image?: string;
  url?: string;
}

export interface BadgeBlockData {
  title?: string;
  subtitle?: string;
  badges: BadgeItem[];
  variant: 'default' | 'cards' | 'minimal' | 'bordered';
  columns: 3 | 4 | 5 | 6;
  size: 'sm' | 'md' | 'lg';
  showTitles: boolean;
  grayscale: boolean;
}

interface BadgeBlockProps {
  data: BadgeBlockData;
}

const iconComponents = {
  award: Award,
  shield: Shield,
  check: CheckCircle,
  star: Star,
  medal: Medal,
  trophy: Trophy,
};

const sizeConfig = {
  sm: { icon: 'h-8 w-8', image: 'h-12 w-12', text: 'text-xs', gap: 'gap-4' },
  md: { icon: 'h-10 w-10', image: 'h-16 w-16', text: 'text-sm', gap: 'gap-6' },
  lg: { icon: 'h-12 w-12', image: 'h-20 w-20', text: 'text-base', gap: 'gap-8' },
};

const columnConfig = {
  3: 'grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-3 sm:grid-cols-6',
};

export function BadgeBlock({ data }: BadgeBlockProps) {
  const {
    title,
    subtitle,
    badges = [],
    variant = 'default',
    columns = 4,
    size = 'md',
    showTitles = true,
    grayscale = false,
  } = data;

  const config = sizeConfig[size];

  if (badges.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No badges configured
      </div>
    );
  }

  const renderBadge = (badge: BadgeItem) => {
    const IconComponent = badge.icon ? iconComponents[badge.icon] : Award;
    
    const content = (
      <>
        {badge.image ? (
          <img
            src={badge.image}
            alt={badge.title}
            className={cn(
              config.image,
              'object-contain',
              grayscale && 'grayscale hover:grayscale-0 transition-all duration-300'
            )}
          />
        ) : (
          <IconComponent 
            className={cn(
              config.icon,
              'text-primary',
              grayscale && 'opacity-50 hover:opacity-100 transition-opacity duration-300'
            )} 
          />
        )}
        {showTitles && (
          <div className="text-center">
            <div className={cn('font-medium', config.text)}>{badge.title}</div>
            {badge.subtitle && (
              <div className={cn('text-muted-foreground', config.text, 'text-xs mt-0.5')}>
                {badge.subtitle}
              </div>
            )}
          </div>
        )}
      </>
    );

    const wrapperClasses = cn(
      'flex flex-col items-center justify-center transition-all duration-200',
      config.gap,
      variant === 'cards' && 'p-6 rounded-lg border bg-card hover:shadow-md',
      variant === 'bordered' && 'p-4 rounded-lg border-2 border-dashed border-muted hover:border-primary',
      variant === 'minimal' && 'p-4',
      variant === 'default' && 'p-4 hover:bg-muted/50 rounded-lg',
      badge.url && 'cursor-pointer'
    );

    if (badge.url) {
      return (
        <a
          key={badge.id}
          href={badge.url}
          target="_blank"
          rel="noopener noreferrer"
          className={wrapperClasses}
        >
          {content}
        </a>
      );
    }

    return (
      <div key={badge.id} className={wrapperClasses}>
        {content}
      </div>
    );
  };

  return (
    <section className="py-12">
      <div className="container mx-auto px-4">
        {/* Header */}
        {(title || subtitle) && (
          <div className="text-center mb-10">
            {title && (
              <h2 className="text-3xl font-bold tracking-tight mb-3">{title}</h2>
            )}
            {subtitle && (
              <p className="text-muted-foreground max-w-2xl mx-auto">{subtitle}</p>
            )}
          </div>
        )}

        {/* Badges Grid */}
        <div className={cn('grid', columnConfig[columns], 'gap-6')}>
          {badges.map(renderBadge)}
        </div>
      </div>
    </section>
  );
}
