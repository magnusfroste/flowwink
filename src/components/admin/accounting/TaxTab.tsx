import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTaxCodes, useTaxGrids } from '@/hooks/useTax';
import { useAccountingLocale } from '@/hooks/useAccountingLocale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search } from 'lucide-react';
import { AccountingTabHeader } from './AccountingTabHeader';

export function TaxTab() {
  const { locale } = useAccountingLocale();
  const localeKey = locale === 'bas-2024' ? 'SE' : 'SE';
  const { data: codes = [], isLoading } = useTaxCodes(localeKey);
  const { data: grids = [] } = useTaxGrids(localeKey);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const filtered = codes.filter((c) => {
    if (typeFilter !== 'all' && c.tax_type !== typeFilter) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <AccountingTabHeader
        title="Tax"
        description="Generic tax codes and grids. Codes drive how VAT is posted; grids decide which Skatteverket-ruta each amount lands in on the VAT report."
      />

      <div className="rounded-lg border bg-card">
        <Tabs defaultValue="codes">
          <div className="flex flex-wrap items-center gap-4 px-6 py-4 border-b">
            <TabsList>
              <TabsTrigger value="codes">Tax codes ({codes.length})</TabsTrigger>
              <TabsTrigger value="grids">Tax grids ({grids.length})</TabsTrigger>
            </TabsList>
            <div className="relative flex-1 min-w-[200px] max-w-md ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search code or name…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 h-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="sale">Sale</SelectItem>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="codes" className="m-0">
            <div className="grid grid-cols-[6rem_1fr_5rem_5rem_5rem_5rem_1fr] gap-4 px-6 py-2 text-xs text-muted-foreground border-b">
              <div>Code</div>
              <div>Name</div>
              <div>Type</div>
              <div className="text-right">Rate</div>
              <div>Output</div>
              <div>Input</div>
              <div>Flags</div>
            </div>
            {isLoading ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center">
                <h3 className="text-sm font-medium mb-1">No tax codes match</h3>
                <p className="text-sm text-muted-foreground">Adjust the search or type filter.</p>
              </div>
            ) : (
              filtered.map((c) => (
                <div
                  key={c.id}
                  className="grid grid-cols-[6rem_1fr_5rem_5rem_5rem_5rem_1fr] items-baseline gap-4 px-6 py-2 text-sm border-b border-border/40 last:border-b-0"
                >
                  <div className="font-mono text-xs text-muted-foreground">{c.code}</div>
                  <div className="truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground">{c.tax_type}</div>
                  <div className="text-right font-mono tabular-nums">{Number(c.rate_pct).toFixed(2)}%</div>
                  <div className="font-mono text-xs text-muted-foreground">{c.output_account_code || '\u2014'}</div>
                  <div className="font-mono text-xs text-muted-foreground">{c.input_account_code || '\u2014'}</div>
                  <div className="flex flex-wrap gap-1">
                    {c.is_reverse_charge && <Badge variant="outline" className="text-[10px] font-normal">RC</Badge>}
                    {c.is_eu && <Badge variant="outline" className="text-[10px] font-normal">EU</Badge>}
                    {!c.is_active && <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">Inactive</Badge>}
                  </div>
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="grids" className="m-0">
            <div className="grid grid-cols-[6rem_1fr_8rem] gap-4 px-6 py-2 text-xs text-muted-foreground border-b">
              <div>Code</div>
              <div>Name</div>
              <div>Category</div>
            </div>
            {grids.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">No tax grids defined.</div>
            ) : (
              grids.map((g) => (
                <div
                  key={g.id}
                  className="grid grid-cols-[6rem_1fr_8rem] items-baseline gap-4 px-6 py-2 text-sm border-b border-border/40 last:border-b-0"
                >
                  <div className="font-mono text-xs text-muted-foreground">{g.code}</div>
                  <div className="truncate">{g.name}</div>
                  <div className="text-xs text-muted-foreground">{g.category}</div>
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
