import { StatsBlockData } from '@/types/cms';
import { icons } from 'lucide-react';

interface StatsBlockProps {
  data: StatsBlockData;
}

export function StatsBlock({ data }: StatsBlockProps) {
  const stats = data.stats || [];

  if (stats.length === 0) return null;

  const getIcon = (iconName?: string) => {
    if (!iconName) return null;
    const Icon = icons[iconName as keyof typeof icons];
    return Icon ? <Icon className="h-6 w-6" /> : null;
  };

  const gridCols = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-4',
  }[Math.min(stats.length, 4) as 1 | 2 | 3 | 4];

  return (
    <section className="py-12 md:py-20 bg-primary/5">
      <div className="container mx-auto px-4">
        {data.title && (
          <h2 className="text-2xl md:text-3xl font-serif font-bold text-center mb-12">
            {data.title}
          </h2>
        )}

        <div className={`grid ${gridCols} gap-8 max-w-5xl mx-auto`}>
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center p-6 bg-background rounded-xl shadow-sm"
            >
              {stat.icon && (
                <div className="flex justify-center mb-4 text-primary">
                  {getIcon(stat.icon)}
                </div>
              )}
              <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                {stat.value}
              </div>
              <div className="text-muted-foreground font-medium">
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
