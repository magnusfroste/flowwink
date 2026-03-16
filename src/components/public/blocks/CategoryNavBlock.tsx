import { Link } from 'react-router-dom';
import { useProductCategories } from '@/hooks/useProductCategories';
import { cn } from '@/lib/utils';
import { LayoutGrid } from 'lucide-react';

export interface CategoryNavBlockData {
  title?: string;
  columns?: 2 | 3 | 4;
  showDescription?: boolean;
  variant?: 'cards' | 'minimal' | 'overlay';
  linkBase?: string;
}

interface CategoryNavBlockProps {
  data: CategoryNavBlockData;
}

export function CategoryNavBlock({ data }: CategoryNavBlockProps) {
  const { data: categories = [], isLoading } = useProductCategories({ activeOnly: true });
  const columns = data.columns || 3;
  const variant = data.variant || 'cards';

  const colClasses = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
  };

  if (isLoading) {
    return (
      <section>
        <div className="max-w-6xl mx-auto px-4">
          <div className={cn('grid grid-cols-2 gap-4', colClasses[columns])}>
            {Array.from({ length: columns }).map((_, i) => (
              <div key={i} className="aspect-[4/3] bg-muted rounded-2xl animate-pulse" />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (categories.length === 0) {
    return (
      <section className="py-12 md:py-16">
        <div className="max-w-6xl mx-auto px-4 text-center text-muted-foreground">
          <LayoutGrid className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p>No categories yet</p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12 md:py-16">
      <div className="max-w-6xl mx-auto px-4">
        {data.title && (
          <h2 className="font-serif text-2xl md:text-3xl font-semibold mb-8 text-center">
            {data.title}
          </h2>
        )}

        <div className={cn('grid grid-cols-2 gap-4 md:gap-6', colClasses[columns])}>
          {categories.map(cat => (
            <Link
              key={cat.id}
              to={`${data.linkBase || '/shop'}?category=${cat.slug}`}
              className="group block"
            >
              {variant === 'overlay' && cat.image_url ? (
                <div className="relative aspect-[4/3] rounded-2xl overflow-hidden">
                  <img
                    src={cat.image_url}
                    alt={cat.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <h3 className="text-lg font-semibold text-white">{cat.name}</h3>
                    {data.showDescription && cat.description && (
                      <p className="text-sm text-white/70 mt-1 line-clamp-2">{cat.description}</p>
                    )}
                  </div>
                </div>
              ) : variant === 'minimal' ? (
                <div className="flex items-center gap-4 p-4 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-muted/30 transition-all">
                  {cat.image_url && (
                    <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                      <img src={cat.image_url} alt={cat.name} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div>
                    <h3 className="font-medium group-hover:text-primary transition-colors">{cat.name}</h3>
                    {data.showDescription && cat.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{cat.description}</p>
                    )}
                  </div>
                </div>
              ) : (
                /* cards variant */
                <div className="rounded-2xl overflow-hidden border border-border/50 hover:border-primary/30 hover:shadow-lg transition-all duration-300 bg-card">
                  {cat.image_url ? (
                    <div className="aspect-[4/3] overflow-hidden bg-muted">
                      <img
                        src={cat.image_url}
                        alt={cat.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                    </div>
                  ) : (
                    <div className="aspect-[4/3] bg-muted flex items-center justify-center">
                      <LayoutGrid className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="font-medium group-hover:text-primary transition-colors">{cat.name}</h3>
                    {data.showDescription && cat.description && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{cat.description}</p>
                    )}
                  </div>
                </div>
              )}
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
