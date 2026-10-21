import { Link } from 'react-router-dom';
import { FeaturesBlockData, FeatureHoverEffect, FeatureCardStyle } from '@/types/cms';
import { Sparkles } from 'lucide-react';
import { BlockIcon } from '@/components/public/BlockIcon';
import { cn } from '@/lib/utils';
import { StaggeredReveal } from '@/components/public/StaggeredReveal';
import { TagGroups } from '@/components/public/TagGroups';

interface FeaturesBlockProps {
  data: FeaturesBlockData;
}

function FeatureIcon({ 
  iconName, 
  iconStyle 
}: { 
  iconName: string; 
  iconStyle: 'circle' | 'square' | 'none';
}) {
  // AI-composers hittar på ikonnamn som inte finns i lucides register
  // ("Sheep", "Cow" — Restagård 2026-08-27); ett okänt namn ska ge
  // fallback-glyfen på accent-plattan, aldrig ett hål i kortet.

  const baseClasses = "h-6 w-6 text-accent-foreground";
  
  if (iconStyle === 'none') {
    return <BlockIcon name={iconName} fallback={Sparkles} className={cn(baseClasses, "h-8 w-8")} />;
  }

  const containerClasses = cn(
    "flex items-center justify-center w-12 h-12",
    iconStyle === 'circle' && "rounded-full",
    iconStyle === 'square' && "rounded-lg",
    "bg-accent/50"
  );

  return (
    <div className={containerClasses}>
      <BlockIcon name={iconName} fallback={Sparkles} className={baseClasses} />
    </div>
  );
}

// Design System 2026: Hover effect classes
const hoverEffectClasses: Record<FeatureHoverEffect, string> = {
  none: '',
  lift: 'card-hover-lift',
  glow: 'card-hover-glow',
  border: 'card-hover-border',
};

// Design System 2026: Card style classes
const cardStyleClasses: Record<FeatureCardStyle, string> = {
  default: '',
  glass: 'glass-card',
  'gradient-border': 'gradient-border',
  // The tile carries the OTHER surface's tokens: on a light band a black tile
  // with white text, on the dark page a white one (Synclair's technology grid).
  inverse: 'surface-inverse bg-background text-foreground border-transparent',
};

function FeatureCard({
  feature,
  variant,
  iconStyle,
  showLinks,
  hoverEffect = 'none',
  cardStyle = 'default',
  number,
}: {
  feature: FeaturesBlockData['features'][0];
  variant: FeaturesBlockData['variant'];
  iconStyle: FeaturesBlockData['iconStyle'];
  showLinks: boolean;
  hoverEffect?: FeatureHoverEffect;
  cardStyle?: FeatureCardStyle;
  /** "01", "02" … when the block is numbered. */
  number?: string;
}) {
  const content = (
    <>
      {feature.image && (
        <img src={feature.image} alt={feature.imageAlt || ''} loading="lazy" decoding="async" className="mb-5 aspect-[4/3] w-full rounded-[calc(var(--radius-block,1rem)*0.6)] object-cover" data-feature-image />
      )}
      {number && (
        <p className="mb-3 font-mono text-xs font-semibold tracking-widest text-[hsl(var(--accent))]" data-feature-number>{number}</p>
      )}
      {!feature.image && <FeatureIcon iconName={feature.icon} iconStyle={iconStyle || 'circle'} />}
      <h3 className={cn('text-lg font-semibold', !feature.image && 'mt-4')}>{feature.title}</h3>
      {feature.subtitle && <p className="mt-1 text-sm text-muted-foreground" data-feature-subtitle>{feature.subtitle}</p>}
      <p className="mt-2 text-muted-foreground text-sm leading-relaxed">
        {feature.description}
      </p>
      {feature.specs && feature.specs.length > 0 && (
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-current/15 pt-4 sm:grid-cols-3" data-feature-specs>
          {feature.specs.map((s, i) => (
            <div key={i}>
              <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{s.label}</dt>
              <dd className="mt-0.5 text-sm font-semibold">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );

  const baseClasses = cn(
    "group",
    variant === 'cards' && cn(
      "p-6 rounded-xl border bg-card transition-all duration-300",
      cardStyle === 'default' && hoverEffect === 'none' && "hover:shadow-md",
      hoverEffectClasses[hoverEffect] ?? hoverEffectClasses.none,
      cardStyleClasses[cardStyle] ?? cardStyleClasses.default,
      feature.inverse && cardStyleClasses.inverse
    ),
    variant === 'minimal' && "text-left",
    variant === 'centered' && "text-center flex flex-col items-center",
    variant === 'default' && "text-left"
  );

  const isExternalLink = feature.url?.startsWith('http');
  const hasLink = showLinks && feature.url;

  if (hasLink) {
    if (isExternalLink) {
      return (
        <a
          href={feature.url}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(baseClasses, "block hover:text-primary transition-colors")}
        >
          {content}
        </a>
      );
    }
    return (
      <Link
        to={feature.url!}
        className={cn(baseClasses, "block hover:text-primary transition-colors")}
      >
        {content}
      </Link>
    );
  }

  return <div className={baseClasses}>{content}</div>;
}

export function FeaturesBlock({ data }: FeaturesBlockProps) {
  const features = data.features || [];
  const columns = data.columns || 3;
  const layout = data.layout || 'grid';
  const variant = data.variant || 'default';
  const iconStyle = data.iconStyle || 'circle';
  const showLinks = data.showLinks ?? true;
  // Design System 2026
  const staggeredReveal = data.staggeredReveal ?? false;
  const hoverEffect = data.hoverEffect || 'none';
  const cardStyle = data.cardStyle || 'default';

  if (features.length === 0) return null;

  const gridClasses = cn(
    layout === 'grid' && {
      'grid gap-8': true,
      'sm:grid-cols-2': columns >= 2,
      'lg:grid-cols-3': columns >= 3,
      'xl:grid-cols-4': columns === 4,
    },
    layout === 'list' && "space-y-6"
  );

  const renderFeatureCards = () => (
    <>
      {features.map((feature, i) => (
        <FeatureCard
          key={feature.id}
          feature={feature}
          variant={variant}
          iconStyle={iconStyle}
          showLinks={showLinks}
          hoverEffect={hoverEffect}
          cardStyle={cardStyle}
          number={data.numbered ? String(i + 1).padStart(2, '0') : undefined}
        />
      ))}
    </>
  );

  return (
    <section>
      <div className="container mx-auto px-4 max-w-6xl">
        {(data.title || data.subtitle) && (
          <div className={cn(
            "mb-12",
            variant === 'centered' && "text-center"
          )}>
            {data.title && (
              <h2 className="text-3xl font-bold tracking-tight">{data.title}</h2>
            )}
            {data.subtitle && (
              <p className={cn(
                "mt-4 text-lg text-muted-foreground",
                variant === 'centered' && "max-w-2xl mx-auto"
              )}>
                {data.subtitle}
              </p>
            )}
          </div>
        )}

        {staggeredReveal ? (
          <StaggeredReveal 
            className={gridClasses}
            animation="fade-up"
            easing="premium"
            delayBetween={100}
          >
            {renderFeatureCards()}
          </StaggeredReveal>
        ) : (
          <div className={gridClasses}>
            {renderFeatureCards()}
          </div>
        )}
        <TagGroups groups={(data.tagGroups ?? []).map((g) => ({ label: g.label, tags: g.tags ?? [] }))} className="mt-10" />
      </div>
    </section>
  );
}
