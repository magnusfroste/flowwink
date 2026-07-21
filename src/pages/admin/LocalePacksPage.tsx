import { useState } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { AdminPageContainer } from '@/components/admin/AdminPageContainer';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, Globe, Coins, Receipt, FileSpreadsheet, Banknote, FileText, BookOpen, Layers, AlertCircle } from 'lucide-react';
import { listPacks, getPack, LOCALE_PACKS } from '@/lib/locale-packs';
import { useTenantLocalePack } from '@/hooks/useTenantLocalePack';
import { AccountRolesEditor } from '@/components/admin/accounting/AccountRolesEditor';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export default function LocalePacksPage() {
  const packs = listPacks();
  const { activeId, chosenId, hasChosen, setActive, isSaving } = useTenantLocalePack();
  const [selectedId, setSelectedId] = useState<string>(activeId);
  const selected = getPack(selectedId);

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Locale Packs"
          description="Accounting locale plugins — chart of accounts, VAT, payroll & bank adapters per market."
        />

        {!hasChosen && (
          <Alert className="mb-6 border-amber-500/50 bg-amber-500/5">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <AlertTitle>No accounting locale activated</AlertTitle>
            <AlertDescription>
              Bookkeeping is disabled until you choose a chart of accounts. Pick a pack
              below and click <span className="font-medium">Set as active</span> to enable
              journal entries, VAT reports, and payroll postings.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Pack list */}
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4" /> Available packs
              </CardTitle>
              <CardDescription>{packs.length} registered</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {packs.map((p) => {
                const isActive = p.id === activeId;
                const isSelected = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full text-left p-3 rounded-lg border-2 transition-colors ${
                      isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{p.label}</span>
                      {isActive && (
                        <Badge variant="default" className="text-xs">
                          <Check className="h-3 w-3 mr-1" /> Active
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.countries.join(', ')} · {p.currency.code}
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Pack detail */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Globe className="h-5 w-5" /> {selected.label}
                  </CardTitle>
                  <CardDescription className="mt-1">{selected.description}</CardDescription>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selected.countries.map((c) => (
                      <Badge key={c} variant="outline" className="text-xs">{c}</Badge>
                    ))}
                    <Badge variant="secondary" className="text-xs font-mono">{selected.id}</Badge>
                  </div>
                </div>
                <Button
                  onClick={() => setActive(selected.id)}
                  disabled={isSaving || selected.id === activeId}
                >
                  {selected.id === activeId ? 'Currently active' : isSaving ? 'Saving…' : 'Set as active'}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="vat">VAT</TabsTrigger>
                  <TabsTrigger value="payroll">Payroll</TabsTrigger>
                  <TabsTrigger value="bank">Bank import</TabsTrigger>
                  <TabsTrigger value="tax">Tax returns</TabsTrigger>
                  <TabsTrigger value="ai">AI hints</TabsTrigger>
                </TabsList>

                <TabsContent value="overview" className="space-y-4 mt-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat icon={<Coins className="h-4 w-4" />} label="Currency" value={`${selected.currency.code} (${selected.currency.symbol})`} />
                    <Stat icon={<Receipt className="h-4 w-4" />} label="Default VAT" value={`${(selected.vat.default_rate * 100).toFixed(0)}%`} />
                    <Stat icon={<BookOpen className="h-4 w-4" />} label="Accounts" value={selected.chart.length.toString()} />
                    <Stat icon={<FileText className="h-4 w-4" />} label="Templates" value={selected.templates.length.toString()} />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Intl locale: <code className="text-foreground">{selected.currency.intl_locale}</code> ·{' '}
                    {selected.currency.decimals} decimals
                  </div>
                </TabsContent>

                <TabsContent value="vat" className="mt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Label</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Output acct</TableHead>
                        <TableHead>Input acct</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.vat.rates.map((r) => (
                        <TableRow key={r.label}>
                          <TableCell className="font-medium">{r.label}</TableCell>
                          <TableCell>{(r.rate * 100).toFixed(0)}%</TableCell>
                          <TableCell className="font-mono text-xs">{r.output_account ?? '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{r.input_account ?? '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="payroll" className="mt-4">
                  <AdapterTable
                    icon={<FileSpreadsheet className="h-4 w-4" />}
                    rows={selected.payroll_adapters.map((a) => ({
                      id: a.id,
                      label: a.label,
                      meta: `.${a.extension} · ${a.mime}`,
                    }))}
                    empty="No payroll adapters."
                  />
                </TabsContent>

                <TabsContent value="bank" className="mt-4">
                  <AdapterTable
                    icon={<Banknote className="h-4 w-4" />}
                    rows={selected.bank_import_adapters.map((a) => ({
                      id: a.id,
                      label: a.label,
                      meta: a.extensions.map((e) => `.${e}`).join(', '),
                    }))}
                    empty="No bank import adapters."
                  />
                </TabsContent>

                <TabsContent value="tax" className="mt-4">
                  <AdapterTable
                    icon={<Receipt className="h-4 w-4" />}
                    rows={(selected.tax_return_adapters ?? []).map((a) => ({
                      id: a.id,
                      label: a.label,
                      meta: `${a.period}${a.edge_function ? ` · ${a.edge_function}` : ''}`,
                    }))}
                    empty="No tax return adapters defined."
                  />
                </TabsContent>

                <TabsContent value="ai" className="mt-4 space-y-3">
                  {(['journal_entry', 'invoicing', 'purchasing'] as const).map((k) => (
                    <div key={k} className="rounded-lg border p-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                        {k.replace('_', ' ')}
                      </div>
                      <p className="text-sm leading-relaxed">{selected.ai_instructions[k]}</p>
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </AdminPageContainer>
    </AdminLayout>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
        {icon}
        {label}
      </div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

function AdapterTable({
  icon,
  rows,
  empty,
}: {
  icon: React.ReactNode;
  rows: { id: string; label: string; meta: string }[];
  empty: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Label</TableHead>
          <TableHead>Format</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-mono text-xs">
              <span className="inline-flex items-center gap-1.5">
                {icon}
                {r.id}
              </span>
            </TableCell>
            <TableCell>{r.label}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{r.meta}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
