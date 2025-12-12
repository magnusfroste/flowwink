import { ArticleGridBlockData } from '@/types/cms';
import { ArrowRight } from 'lucide-react';

interface ArticleGridBlockProps {
  data: ArticleGridBlockData;
}

export function ArticleGridBlock({ data }: ArticleGridBlockProps) {
  if (!data.articles || data.articles.length === 0) return null;

  const gridCols = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
  };

  return (
    <section className="py-16 px-6">
      <div className="container mx-auto">
        {data.title && (
          <h2 className="font-serif text-3xl font-bold mb-8">{data.title}</h2>
        )}
        <div className={`grid gap-8 ${gridCols[data.columns]}`}>
          {data.articles.map((article, index) => (
            <a
              key={index}
              href={article.url}
              className="group bg-card border border-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
            >
              {article.image && (
                <div className="aspect-video overflow-hidden">
                  <img
                    src={article.image}
                    alt={article.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              )}
              <div className="p-5">
                <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                  {article.title}
                </h3>
                {article.excerpt && (
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                    {article.excerpt}
                  </p>
                )}
                <span className="inline-flex items-center gap-1 text-sm text-primary font-medium">
                  Läs mer
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
