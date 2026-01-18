import { icons } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StaggeredReveal } from '@/components/public/StaggeredReveal';

interface TimelineStep {
  id: string;
  icon: string;
  title: string;
  description: string;
  date?: string;
}

interface TimelineBlockProps {
  data: {
    title?: string;
    subtitle?: string;
    steps?: TimelineStep[];
    variant?: 'vertical' | 'horizontal' | 'alternating';
    showDates?: boolean;
    staggeredReveal?: boolean;
  };
}

function StepIcon({ iconName, className }: { iconName: string; className?: string }) {
  const IconComponent = icons[iconName as keyof typeof icons];
  if (!IconComponent) {
    const FallbackIcon = icons['Circle'];
    return <FallbackIcon className={className} />;
  }
  return <IconComponent className={className} />;
}

function VerticalTimeline({ steps, showDates, staggered }: { steps: TimelineStep[]; showDates: boolean; staggered: boolean }) {
  const Wrapper = staggered ? StaggeredReveal : 'div';
  const wrapperProps = staggered 
    ? { animation: 'slide-left' as const, delayBetween: 150, className: 'space-y-8' }
    : { className: 'space-y-8' };

  return (
    <div className="relative">
      {/* Connecting line */}
      <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-border" />
      
      <Wrapper {...wrapperProps}>
        {steps.map((step, index) => (
          <div key={step.id} className="relative flex gap-6">
            {/* Icon circle */}
            <div className="relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <StepIcon iconName={step.icon} className="h-5 w-5" />
            </div>
            
            {/* Content */}
            <div className="flex-1 pt-1">
              {showDates && step.date && (
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {step.date}
                </span>
              )}
              <h3 className="text-lg font-semibold mt-1">{step.title}</h3>
              <p className="text-muted-foreground mt-1">{step.description}</p>
            </div>
          </div>
        ))}
      </Wrapper>
    </div>
  );
}

function HorizontalTimeline({ steps, showDates, staggered }: { steps: TimelineStep[]; showDates: boolean; staggered: boolean }) {
  const Wrapper = staggered ? StaggeredReveal : 'div';
  const wrapperProps = staggered 
    ? { animation: 'fade-up' as const, delayBetween: 100, className: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8' }
    : { className: 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8' };

  return (
    <div className="relative">
      {/* Connecting line */}
      <div className="absolute left-0 right-0 top-6 h-0.5 bg-border" />
      
      <Wrapper {...wrapperProps}>
        {steps.map((step) => (
          <div key={step.id} className="relative text-center">
            {/* Icon circle */}
            <div className="relative z-10 mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
              <StepIcon iconName={step.icon} className="h-5 w-5" />
            </div>
            
            {/* Content */}
            <div className="mt-4">
              {showDates && step.date && (
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {step.date}
                </span>
              )}
              <h3 className="text-base font-semibold mt-1">{step.title}</h3>
              <p className="text-sm text-muted-foreground mt-1">{step.description}</p>
            </div>
          </div>
        ))}
      </Wrapper>
    </div>
  );
}

function AlternatingTimeline({ steps, showDates, staggered }: { steps: TimelineStep[]; showDates: boolean; staggered: boolean }) {
  const Wrapper = staggered ? StaggeredReveal : 'div';
  const wrapperProps = staggered 
    ? { animation: 'scale-in' as const, delayBetween: 200, className: 'space-y-12' }
    : { className: 'space-y-12' };

  return (
    <div className="relative">
      {/* Center line */}
      <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-border -translate-x-1/2" />
      
      <Wrapper {...wrapperProps}>
        {steps.map((step, index) => {
          const isLeft = index % 2 === 0;
          
          return (
            <div key={step.id} className="relative">
              {/* Icon circle - centered */}
              <div className="absolute left-1/2 -translate-x-1/2 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                <StepIcon iconName={step.icon} className="h-5 w-5" />
              </div>
              
              {/* Content */}
              <div className={cn(
                "w-5/12",
                isLeft ? "mr-auto pr-8 text-right" : "ml-auto pl-8 text-left"
              )}>
                {showDates && step.date && (
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    {step.date}
                  </span>
                )}
                <h3 className="text-lg font-semibold mt-1">{step.title}</h3>
                <p className="text-muted-foreground mt-1">{step.description}</p>
              </div>
            </div>
          );
        })}
      </Wrapper>
    </div>
  );
}

export function TimelineBlock({ data }: TimelineBlockProps) {
  const steps = data.steps || [];
  const variant = data.variant || 'vertical';
  const showDates = data.showDates ?? false;
  const staggered = data.staggeredReveal ?? false;

  if (steps.length === 0) return null;

  return (
    <section className="py-16 md:py-24">
      <div className="container mx-auto px-4">
        {(data.title || data.subtitle) && (
          <div className="text-center mb-12">
            {data.title && (
              <h2 className="text-3xl md:text-4xl font-bold">{data.title}</h2>
            )}
            {data.subtitle && (
              <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
                {data.subtitle}
              </p>
            )}
          </div>
        )}

        <div className="max-w-4xl mx-auto">
          {variant === 'vertical' && (
            <VerticalTimeline steps={steps} showDates={showDates} staggered={staggered} />
          )}
          {variant === 'horizontal' && (
            <HorizontalTimeline steps={steps} showDates={showDates} staggered={staggered} />
          )}
          {variant === 'alternating' && (
            <AlternatingTimeline steps={steps} showDates={showDates} staggered={staggered} />
          )}
        </div>
      </div>
    </section>
  );
}
