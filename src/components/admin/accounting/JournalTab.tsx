import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, FileText } from 'lucide-react';
import { useJournalEntries, useJournalEntryWithLines } from '@/hooks/useAccounting';
import { Skeleton } from '@/components/ui/skeleton';
import { NewJournalEntryDialog } from './NewJournalEntryDialog';
import { JournalEntryDetail } from './JournalEntryDetail';

const formatCents = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0 }).format(cents / 100);

const statusColor: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  posted: 'bg-primary/10 text-primary',
  voided: 'bg-destructive/10 text-destructive',
};

export function JournalTab() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const { data: entries, isLoading } = useJournalEntries(statusFilter);
  const { data: selectedEntry } = useJournalEntryWithLines(selectedId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="posted">Posted</SelectItem>
            <SelectItem value="voided">Voided</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-2" />
          New Entry
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16" />
          ))}
        </div>
      ) : entries?.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No journal entries</h3>
            <p className="text-sm text-muted-foreground">Create your first journal entry to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {entries?.map((entry) => (
            <Card
              key={entry.id}
              className="cursor-pointer hover:bg-muted/30 transition-colors"
              onClick={() => setSelectedId(entry.id)}
            >
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="text-sm text-muted-foreground font-mono w-24">
                      {entry.entry_date}
                    </div>
                    <div>
                      <div className="font-medium">{entry.description}</div>
                      {entry.reference_number && (
                        <div className="text-xs text-muted-foreground">
                          Ref: {entry.reference_number}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary" className={statusColor[entry.status] || ''}>
                      {entry.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {entry.source}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NewJournalEntryDialog open={showCreate} onOpenChange={setShowCreate} />

      {selectedEntry && (
        <JournalEntryDetail
          entry={selectedEntry}
          open={!!selectedId}
          onOpenChange={(open) => !open && setSelectedId(null)}
        />
      )}
    </div>
  );
}
