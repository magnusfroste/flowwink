import { LinkGridBlockData } from '@/types/cms';
import { ArrowRight, FileText, Users, Calendar, Heart, Star, Info, HelpCircle } from 'lucide-react';

interface LinkGridBlockProps {
  data: LinkGridBlockData;
}

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  'file-text': FileText,
  'users': Users,
  'calendar': Calendar,
  'heart': Heart,
  'star': Star,
  'info': Info,
  'help-circle': HelpCircle,
};

export function LinkGridBlock({ data }: LinkGridBlockProps) {
  if (!data.links || data.links.length === 0) return null;

  const gridCols = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
  };

  return (
    <section className="py-16 px-6">
      <div className="container mx-auto">
        <div className={`grid gap-6 ${gridCols[data.columns]}`}>
          {data.links.map((link, index) => {
            const IconComponent = iconMap[link.icon] || FileText;
            return (
              <a
                key={index}
                href={link.url}
                className="group p-6 bg-card rounded-lg border border-border hover:border-primary hover:shadow-md transition-all"
              >
                <div className="flex items-start gap-4">
                  <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                    <IconComponent className="h-6 w-6 text-primary" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-1 group-hover:text-primary transition-colors">
                      {link.title}
                    </h3>
                    {link.description && (
                      <p className="text-sm text-muted-foreground">{link.description}</p>
                    )}
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0" />
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </section>
  );
}
