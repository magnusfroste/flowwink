import { ArticleGridBlockData } from '@/types/cms';
import { stripHtml } from '@/lib/utils';
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
    <section>
      <div className="container mx-auto">
        {data.title && (
          <h2 className="font-serif text-3xl font-bold mb-8">{data.title}</h2>
        )}
        <div className={`grid gap-8 ${gridCols[data.columns] ?? gridCols[3]}`}>
          {data.articles.map((article, index) => {
            // The registry advertised link/description until 2026-09-28 while this
            // renderer read url/excerpt: every agent-built grid had dead cards
            // and no teaser (MJP demo). Both spellings are read.
            const href = article.url ?? article.link;
            const teaser = article.excerpt ?? article.description;
            return (
            <a
              key={index}
              href={href}
              className="group bg-card border border-border rounded-lg overflow-hidden hover:shadow-lg transition-shadow"
            >
              {article.image && (
                <div className="aspect-video overflow-hidden bg-muted">
                  <img
                    src={article.image}
                    alt={article.title}
                    className={`w-full h-full group-hover:scale-105 transition-transform duration-300 ${data.imageFit === 'contain' ? 'object-contain' : 'object-cover'}`}
                  />
                </div>
              )}
              <div className="p-5">
                <h3 className="font-semibold text-lg mb-2 group-hover:text-primary transition-colors">
                  {article.title}
                </h3>
                {teaser && (
                  <p className="text-sm text-muted-foreground line-clamp-3 mb-4">
                    {stripHtml(teaser)}
                  </p>
                )}
                <span className="inline-flex items-center gap-1 text-sm text-primary font-medium">
                  Read more
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </span>
              </div>
            </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
