import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { History, Building2, Users, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface CompanyRow {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  website: string | null;
  enriched_at: string | null;
  leads: { count: number }[];
}

export function ResearchHistory() {
  const [entries, setEntries] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, domain, industry, website, enriched_at, leads(count)')
        .not('enriched_at', 'is', null)
        .order('enriched_at', { ascending: false })
        .limit(20);

      if (error) console.error('ResearchHistory load failed:', error.message);
      setEntries((data as any[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          Research History
        </CardTitle>
        <CardDescription>Recently researched companies — click to open in CRM</CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No research yet. Run a prospect lookup in the Research tab to populate history.
          </p>
        ) : (
          <div className="space-y-2">
            {entries.map((c) => {
              const contactCount = c.leads?.[0]?.count ?? 0;
              return (
                <Link
                  key={c.id}
                  to={`/admin/leads?company=${c.id}`}
                  className="flex items-center justify-between rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{c.name}</span>
                    {c.domain && (
                      <span className="text-xs text-muted-foreground truncate">{c.domain}</span>
                    )}
                    {c.industry && (
                      <Badge variant="outline" className="text-xs shrink-0">
                        {c.industry}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground text-xs shrink-0">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {contactCount}
                    </span>
                    {c.enriched_at && (
                      <span>{format(new Date(c.enriched_at), 'MMM d, HH:mm')}</span>
                    )}
                    <ExternalLink className="h-3 w-3" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
