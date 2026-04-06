import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Search, FileText, Tag } from 'lucide-react';
import { useAccountingTemplates } from '@/hooks/useAccounting';
import { Skeleton } from '@/components/ui/skeleton';
import type { TemplateLine } from '@/hooks/useAccounting';

export function TemplatesTab() {
  const [search, setSearch] = useState('');
  const { data: templates, isLoading } = useAccountingTemplates();

  const filtered = (templates || []).filter(
    (t) =>
      !search ||
      t.template_name.toLowerCase().includes(search.toLowerCase()) ||
      t.description.toLowerCase().includes(search.toLowerCase()) ||
      t.category.toLowerCase().includes(search.toLowerCase()) ||
      t.keywords?.some((k) => k.toLowerCase().includes(search.toLowerCase()))
  );

  // Group by category
  const grouped = filtered.reduce<Record<string, typeof filtered>>((acc, t) => {
    const cat = t.category || 'general';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(t);
    return acc;
  }, {});

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search templates by name, keyword, or category..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {Object.keys(grouped).length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No templates found</h3>
          </CardContent>
        </Card>
      ) : (
        Object.entries(grouped).map(([category, items]) => (
          <div key={category}>
            <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-3">
              {category}
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {items.map((template) => {
                const lines = template.template_lines as TemplateLine[];
                return (
                  <Card key={template.id}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-medium">{template.template_name}</h4>
                          <p className="text-sm text-muted-foreground">{template.description}</p>
                        </div>
                        {template.is_system && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            System
                          </Badge>
                        )}
                      </div>

                      {/* Lines preview */}
                      <div className="mt-3 space-y-1">
                        {lines.map((line, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <Badge
                              variant="secondary"
                              className={`w-14 justify-center ${
                                line.type === 'debit'
                                  ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400'
                                  : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400'
                              }`}
                            >
                              {line.type === 'debit' ? 'Debit' : 'Credit'}
                            </Badge>
                            <span className="font-mono">{line.account_code}</span>
                            <span className="text-muted-foreground truncate">
                              {line.account_name}
                            </span>
                          </div>
                        ))}
                      </div>

                      {/* Keywords */}
                      {template.keywords && template.keywords.length > 0 && (
                        <div className="flex items-center gap-1 mt-3 flex-wrap">
                          <Tag className="h-3 w-3 text-muted-foreground" />
                          {template.keywords.slice(0, 4).map((kw) => (
                            <Badge key={kw} variant="outline" className="text-xs">
                              {kw}
                            </Badge>
                          ))}
                          {template.keywords.length > 4 && (
                            <span className="text-xs text-muted-foreground">
                              +{template.keywords.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
