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
import { usePlatformFormat } from '@/hooks/usePlatformFormat';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

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
  const { formatCurrency, formatAmount, formatDate } = usePlatformFormat();
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
        description="Chart of accounts, fiscal year and rounding for this instance. How amounts look is set once, for the whole platform, in Site settings."
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

      {draft && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" />
              Fiscal year &amp; rounding
            </CardTitle>
            <CardDescription>
              Amounts in the ledger are written the business&apos;s way — currency, separators and
              decimals come from{' '}
              <Link to="/admin/settings" className="underline">Site settings → Where the business is</Link>
              , the same as every invoice and e-mail. Amounts are always stored as integer öre/cents.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-lg border bg-muted/40 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">How the ledger reads</div>
              <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
                <div>
                  <div className="text-xs text-muted-foreground">Amount</div>
                  <div className="text-2xl font-mono font-semibold">{formatCurrency(123456789)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Ledger column</div>
                  <div className="text-lg font-mono">{formatAmount(-4250)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Entry date</div>
                  <div className="text-lg font-mono">{formatDate('2026-07-02', { month: '2-digit' })}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Fiscal year</div>
                  <div className="text-lg font-mono">{fiscalYearRange(fiscalYearOf(businessToday(), draft.fiscalYearStartMonth), draft.fiscalYearStartMonth).label}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Fiscal year starts in</Label>
                <Select
                  value={String(draft.fiscalYearStartMonth)}
                  onValueChange={(v) => patch({ fiscalYearStartMonth: Number(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {draft.fiscalYearStartMonth === 1
                    ? 'January = calendar year.'
                    : `A year named ${new Date().getFullYear()} runs ${MONTHS[draft.fiscalYearStartMonth - 1]} ${new Date().getFullYear() - 1} – ${MONTHS[draft.fiscalYearStartMonth - 2]} ${new Date().getFullYear()}.`}{' '}
                  Reports, period locks, opening balances, voucher numbering and the SIE export follow it.
                  VAT periods stay on the calendar, as the tax agency counts them.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Rounding</Label>
                <Select value={draft.rounding} onValueChange={(v) => patch({ rounding: v as AccountingPreferences['rounding'] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="half-up">Round half up — 0,5 → 1 (standard)</SelectItem>
                    <SelectItem value="half-even">Banker&apos;s rounding — 0,5 → 0, 1,5 → 2</SelectItem>
                    <SelectItem value="down">Always down — 0,9 → 0 (truncate)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Used when VAT/percentage templates are expanded.</p>
              </div>

              <div className="space-y-2">
                <Label>VAT return period</Label>
                <Select
                  value={draft.vatReturnPeriod ?? 'quarterly'}
                  onValueChange={(v) => patch({ vatReturnPeriod: v as AccountingPreferences['vatReturnPeriod'] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="yearly">Yearly (whole fiscal year)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  As registered with the tax agency. The filing calendar on the Overview and in the daily briefing
                  counts the due dates from it; the VAT declaration tab opens on this period.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Legal form</Label>
                <Select
                  value={draft.legalForm || 'unset'}
                  onValueChange={(v) => patch({ legalForm: (v === 'unset' ? '' : v) as AccountingPreferences['legalForm'] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">Not set</SelectItem>
                    <SelectItem value="limited_company">Limited company (aktiebolag)</SelectItem>
                    <SelectItem value="sole_trader">Sole trader (enskild firma)</SelectItem>
                    <SelectItem value="partnership">Partnership (handelsbolag)</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  The income tax return and annual report deadlines depend on it. Left unset, the calendar
                  lists VAT and employer declarations only and says why.
                </p>
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
      )}

      {draft && <FiscalYearsCard startMonth={draft.fiscalYearStartMonth} />}
      <ControlDialsCard />

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
import { FiscalYearsCard } from './FiscalYearsCard';
import { ControlDialsCard } from './ControlDialsCard';
import { fiscalYearOf, fiscalYearRange } from '@/lib/fiscal-year';
import { businessToday } from '@/lib/platform-fallbacks';

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
