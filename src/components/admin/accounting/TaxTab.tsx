import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTaxCodes, useTaxGrids } from '@/hooks/useTax';
import { useAccountingLocale } from '@/hooks/useAccountingLocale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Receipt } from 'lucide-react';

export function TaxTab() {
  const { locale } = useAccountingLocale();
  // VAT codes/grids are currently SE-localised; future locales will fall back to SE seed
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Tax Engine
          </CardTitle>
          <CardDescription>
            Generic Odoo-style tax codes &amp; grids. Codes drive how VAT is posted and which grid (Skatteverket-ruta) it lands in for the VAT report.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="codes">
        <TabsList>
          <TabsTrigger value="codes">Tax Codes ({codes.length})</TabsTrigger>
          <TabsTrigger value="grids">Tax Grids ({grids.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="codes" className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Search code or name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="sale">Sale</SelectItem>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead>Output acc.</TableHead>
                    <TableHead>Input acc.</TableHead>
                    <TableHead>Flags</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>}
                  {!isLoading && filtered.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No tax codes</TableCell></TableRow>
                  )}
                  {filtered.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.code}</TableCell>
                      <TableCell>{c.name}</TableCell>
                      <TableCell><Badge variant="outline">{c.tax_type}</Badge></TableCell>
                      <TableCell className="text-right">{Number(c.rate_pct).toFixed(2)}%</TableCell>
                      <TableCell className="font-mono text-xs">{c.output_account_code || '—'}</TableCell>
                      <TableCell className="font-mono text-xs">{c.input_account_code || '—'}</TableCell>
                      <TableCell className="space-x-1">
                        {c.is_reverse_charge && <Badge variant="secondary" className="text-xs">RC</Badge>}
                        {c.is_eu && <Badge variant="secondary" className="text-xs">EU</Badge>}
                        {!c.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="grids">
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grids.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="font-mono text-xs">{g.code}</TableCell>
                      <TableCell>{g.name}</TableCell>
                      <TableCell><Badge variant="outline">{g.category}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
