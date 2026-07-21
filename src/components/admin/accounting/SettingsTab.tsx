import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Globe, Check, Database, ExternalLink, Hash, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Link } from 'react-router-dom';
import { useAccountingLocale, ACCOUNTING_LOCALES } from '@/hooks/useAccountingLocale';
import { useTenantLocalePack } from '@/hooks/useTenantLocalePack';
import { useChartOfAccounts } from '@/hooks/useAccounting';
import { useAccountingPreferences, useUpdateAccountingPreferences, type AccountingPreferences } from '@/hooks/useSiteSettings';

import { IFRS_TEMPLATES } from '@/data/templates-ifrs';
import { US_GAAP_TEMPLATES } from '@/data/templates-usgaap';
import { IFRS_ACCOUNTS } from '@/data/accounts-ifrs';
import { US_GAAP_ACCOUNTS } from '@/data/accounts-usgaap';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AccountingTabHeader } from './AccountingTabHeader';


export function SettingsTab() {
  const { locale, setLocale } = useAccountingLocale();
  const { activePack, hasChosen } = useTenantLocalePack();
  const { data: accounts } = useChartOfAccounts();
  const { data: prefs } = useAccountingPreferences();
  const updatePrefs = useUpdateAccountingPreferences();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [seeding, setSeeding] = useState(false);
  const [draft, setDraft] = useState<AccountingPreferences | null>(null);

  useEffect(() => {
    if (prefs && !draft) setDraft(prefs);
  }, [prefs, draft]);

  const patch = (p: Partial<AccountingPreferences>) =>
    setDraft((d) => (d ? { ...d, ...p } : d));

  const dirty = !!draft && !!prefs && JSON.stringify(draft) !== JSON.stringify(prefs);

  // Defaults sourced from the active locale pack — currency + decimals live on
  // the pack; separator/date conventions are inferred from intl_locale.
  const packDefaults: Partial<AccountingPreferences> = (() => {
    if (!activePack) return {};
    const intl = activePack.currency.intl_locale || '';
    const isSE = intl.startsWith('sv');
    const isDE = intl.startsWith('de');
    const isUS = intl.startsWith('en-US');
    return {
      currency: activePack.currency.code,
      decimals: (activePack.currency.decimals as 0 | 2) ?? 2,
      currencyPosition: isUS ? 'prefix' : 'suffix',
      decimalSeparator: isUS ? '.' : ',',
      thousandsSeparator: isUS ? ',' : isDE ? '.' : ' ',
      dateFormat: isUS ? 'MM/DD/YYYY' : isDE ? 'DD.MM.YYYY' : 'YYYY-MM-DD',
    };
  })();

  const applyPackDefaults = () =>
    setDraft((d) => (d ? { ...d, ...packDefaults } as AccountingPreferences : d));




  const handleSeedLocale = async (targetLocale: string) => {
    setSeeding(true);
    try {
      const { count } = await supabase
        .from('chart_of_accounts')
        .select('id', { count: 'exact', head: true })
        .eq('locale', targetLocale);

      if ((count ?? 0) > 0) {
        toast({ title: 'Already seeded', description: `${targetLocale} accounts already exist` });
        setSeeding(false);
        return;
      }

      const accountsToSeed = getAccountsForLocale(targetLocale);
      if (accountsToSeed.length === 0) {
        toast({ title: 'No data', description: 'No accounts defined for this locale', variant: 'destructive' });
        setSeeding(false);
        return;
      }

      const { error } = await supabase.from('chart_of_accounts').insert(accountsToSeed);
      if (error) throw error;

      const templatesToSeed = getTemplatesForLocale(targetLocale);
      if (templatesToSeed.length > 0) {
        await supabase.from('accounting_templates').insert(templatesToSeed as any);
      }

      queryClient.invalidateQueries({ queryKey: ['chart-of-accounts'] });
      queryClient.invalidateQueries({ queryKey: ['accounting-templates'] });
      toast({ title: 'Seeded successfully', description: `${accountsToSeed.length} accounts + ${templatesToSeed.length} templates added` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSeeding(false);
    }
  };

  const selectedInfo = ACCOUNTING_LOCALES.find((l) => l.value === locale);

  return (
    <div className="space-y-4">
      <AccountingTabHeader
        title="Settings"
        description="Chart of accounts, display formatting, and locale pack for this instance. All amounts are stored as integer öre/cents — settings only affect display."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/accounting/locale-packs">
              <ExternalLink className="h-3 w-3 mr-1" />
              Manage locale packs
            </Link>
          </Button>
        }
      />
      {!hasChosen && (
        <Alert className="border-amber-500/50 bg-amber-500/5">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle>No accounting locale activated</AlertTitle>
          <AlertDescription>
            Bookkeeping is disabled until you choose a chart of accounts.{' '}
            <Link to="/admin/accounting/locale-packs" className="underline font-medium">
              Choose a locale pack →
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Chart of Accounts
          </CardTitle>
          <CardDescription>
            Select which accounting standard to use. Each standard has its own chart of accounts and templates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {ACCOUNTING_LOCALES.map((opt) => {
            const isActive = locale === opt.value;
            return (
              <div
                key={opt.value}
                className={`flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                  isActive
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/40'
                }`}
                onClick={() => setLocale(opt.value)}
              >
                <div className="flex items-center gap-3">
                  {isActive && <Check className="h-5 w-5 text-primary shrink-0" />}
                  <div>
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-sm text-muted-foreground">{opt.description}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isActive && <Badge>Active</Badge>}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSeedLocale(opt.value);
                    }}
                    disabled={seeding}
                  >
                    <Database className="h-3 w-3 mr-1" />
                    {seeding ? 'Seeding...' : 'Seed'}
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {draft && (() => {
        const fmtNumber = (n: number, d: AccountingPreferences) => {
          const [intPart, decPart] = n.toFixed(d.decimals).split('.');
          const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, d.thousandsSeparator || '');
          return d.decimals > 0 ? `${grouped}${d.decimalSeparator}${decPart}` : grouped;
        };
        const fmtMoney = (n: number, d: AccountingPreferences) => {
          const num = fmtNumber(n, d);
          return d.currencyPosition === 'prefix' ? `${d.currency} ${num}` : `${num} ${d.currency}`;
        };
        const fmtDate = (d: AccountingPreferences) => {
          const yyyy = '2026', mm = '07', dd = '02';
          switch (d.dateFormat) {
            case 'DD/MM/YYYY': return `${dd}/${mm}/${yyyy}`;
            case 'MM/DD/YYYY': return `${mm}/${dd}/${yyyy}`;
            case 'DD.MM.YYYY': return `${dd}.${mm}.${yyyy}`;
            default: return `${yyyy}-${mm}-${dd}`;
          }
        };
        const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];

        return (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Hash className="h-5 w-5" />
                  Display format
                </CardTitle>
                <CardDescription className="mt-1">
                  How amounts and dates appear in journal entries, ledgers and reports.
                  Defaults come from your locale pack ({activePack?.label ?? '—'} · {activePack?.currency.intl_locale ?? 'n/a'}).
                  Amounts are always stored as integer öre/cents — this only changes display.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={applyPackDefaults} className="shrink-0">
                Use pack defaults
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* Live preview */}
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Live preview</div>
              <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
                <div>
                  <div className="text-xs text-muted-foreground">Amount</div>
                  <div className="text-2xl font-mono font-semibold">{fmtMoney(1234567.89, draft)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Small amount</div>
                  <div className="text-lg font-mono">{fmtMoney(42.5, draft)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Entry date</div>
                  <div className="text-lg font-mono">{fmtDate(draft)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Fiscal year</div>
                  <div className="text-lg font-mono">Starts {months[draft.fiscalYearStartMonth - 1]}</div>
                </div>
              </div>
            </div>

            {/* Currency */}
            <div>
              <h4 className="text-sm font-medium mb-3">Currency</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="currency">Currency code</Label>
                  <Input
                    id="currency"
                    value={draft.currency}
                    maxLength={3}
                    onChange={(e) => patch({ currency: e.target.value.toUpperCase() })}
                  />
                  <p className="text-xs text-muted-foreground">ISO 4217 — e.g. SEK, EUR, USD, GBP.</p>
                </div>

                <div className="space-y-2">
                  <Label>Where to show it</Label>
                  <Select value={draft.currencyPosition} onValueChange={(v) => patch({ currencyPosition: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="suffix">After the amount — {fmtNumber(1234.56, draft)} {draft.currency}</SelectItem>
                      <SelectItem value="prefix">Before the amount — {draft.currency} {fmtNumber(1234.56, draft)}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Numbers */}
            <div>
              <h4 className="text-sm font-medium mb-3">Numbers</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Decimals shown</Label>
                  <Select value={String(draft.decimals)} onValueChange={(v) => patch({ decimals: Number(v) as 0 | 2 })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2">2 decimals — 1{draft.thousandsSeparator}234{draft.decimalSeparator}56</SelectItem>
                      <SelectItem value="0">No decimals — 1{draft.thousandsSeparator}235</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Öre/cents are still stored — this only hides them.</p>
                </div>

                <div className="space-y-2">
                  <Label>Decimal separator</Label>
                  <Select value={draft.decimalSeparator} onValueChange={(v) => patch({ decimalSeparator: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=",">Comma — 1234,56 (Swedish / European)</SelectItem>
                      <SelectItem value=".">Period — 1234.56 (US / UK)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Thousands separator</Label>
                  <Select
                    value={draft.thousandsSeparator === '' ? 'none' : draft.thousandsSeparator}
                    onValueChange={(v) => patch({ thousandsSeparator: (v === 'none' ? '' : v) as any })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=" ">Space — 1 234 567 (Swedish)</SelectItem>
                      <SelectItem value=",">Comma — 1,234,567 (US / UK)</SelectItem>
                      <SelectItem value=".">Period — 1.234.567 (German)</SelectItem>
                      <SelectItem value="none">None — 1234567</SelectItem>
                    </SelectContent>
                  </Select>

                </div>

                <div className="space-y-2">
                  <Label>Rounding</Label>
                  <Select value={draft.rounding} onValueChange={(v) => patch({ rounding: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="half-up">Round half up — 0,5 → 1 (standard)</SelectItem>
                      <SelectItem value="half-even">Banker's rounding — 0,5 → 0, 1,5 → 2</SelectItem>
                      <SelectItem value="down">Always down — 0,9 → 0 (truncate)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Used when VAT/percentage templates are expanded.</p>
                </div>
              </div>
            </div>

            {/* Dates & fiscal year */}
            <div>
              <h4 className="text-sm font-medium mb-3">Dates & fiscal year</h4>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Date format</Label>
                  <Select value={draft.dateFormat} onValueChange={(v) => patch({ dateFormat: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="YYYY-MM-DD">2026-07-02 — ISO / Swedish</SelectItem>
                      <SelectItem value="DD/MM/YYYY">02/07/2026 — European</SelectItem>
                      <SelectItem value="MM/DD/YYYY">07/02/2026 — US</SelectItem>
                      <SelectItem value="DD.MM.YYYY">02.07.2026 — German</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Fiscal year starts in</Label>
                  <Select
                    value={String(draft.fiscalYearStartMonth)}
                    onValueChange={(v) => patch({ fiscalYearStartMonth: Number(v) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {months.map((m, i) => (
                        <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">January = calendar year. Change if your business runs on a broken fiscal year.</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                variant="ghost"
                disabled={!dirty || updatePrefs.isPending}
                onClick={() => prefs && setDraft(prefs)}
              >
                Reset
              </Button>
              <Button
                disabled={!dirty || updatePrefs.isPending}
                onClick={() => draft && updatePrefs.mutate(draft)}
              >
                {updatePrefs.isPending ? 'Saving...' : 'Save preferences'}
              </Button>
            </div>
          </CardContent>
        </Card>
        );
      })()}




      {selectedInfo && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Settings className="h-4 w-4" />
              Active: {selectedInfo.label}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Journal entries, ledger, and reports will use accounts from the <strong>{selectedInfo.label}</strong> chart.
              You can switch at any time — existing entries keep their original account references.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Locale routing — falls back to legacy data files for packs that
// don't yet have a full plugin (e.g. us-gaap). New packs in
// src/lib/locale-packs/ are picked up automatically by ACCOUNTING_LOCALES.
// ============================================================

import { LOCALE_PACKS } from '@/lib/locale-packs';

function getAccountsForLocale(locale: string) {
  const pack = LOCALE_PACKS[locale];
  if (pack) return pack.chart.map((a) => ({ ...a, locale: pack.id }));
  if (locale === 'us-gaap') return US_GAAP_ACCOUNTS;
  return [];
}

function getTemplatesForLocale(locale: string) {
  const pack = LOCALE_PACKS[locale];
  if (pack) {
    return pack.templates.map((t) => ({
      ...t,
      locale: pack.id,
      is_system: t.is_system ?? true,
    }));
  }
  if (locale === 'us-gaap') return US_GAAP_TEMPLATES;
  return [];
}
