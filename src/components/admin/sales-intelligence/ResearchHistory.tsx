import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { History, Building2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";

interface ResearchEntry {
  key: string;
  value: {
    company_name?: string;
    researched_at?: string;
    contacts_found?: number;
    company_summary?: { industry?: string; size_estimate?: string };
    qualifying_questions?: unknown[];
  };
  created_at: string;
}

export function ResearchHistory() {
  const [entries, setEntries] = useState<ResearchEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from('agent_memory')
        .select('key, value, created_at')
        .like('key', 'prospect_research_%')
        .order('created_at', { ascending: false })
        .limit(20);

      setEntries((data as any[]) || []);
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return null;
  if (entries.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4" />
          Research History
        </CardTitle>
        <CardDescription>Previous prospect research saved by FlowPilot</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {entries.map(entry => {
            const val = entry.value as any;
            return (
              <div
                key={entry.key}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium truncate">{val?.company_name || 'Unknown'}</span>
                  {val?.company_summary?.industry && (
                    <Badge variant="outline" className="text-xs shrink-0">
                      {val.company_summary.industry}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-3 text-muted-foreground text-xs shrink-0">
                  {val?.contacts_found != null && (
                    <span>{val.contacts_found} contacts</span>
                  )}
                  {val?.qualifying_questions && (
                    <span className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {val.qualifying_questions.length} Q&A
                    </span>
                  )}
                  {val?.researched_at && (
                    <span>{format(new Date(val.researched_at), 'MMM d')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
