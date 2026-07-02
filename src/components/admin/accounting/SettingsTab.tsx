import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Settings, Globe, Check, Database, ExternalLink, Hash } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAccountingLocale, ACCOUNTING_LOCALES } from '@/hooks/useAccountingLocale';
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


export function SettingsTab() {
  const { locale, setLocale } = useAccountingLocale();
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

  const previewAmount = (() => {
    if (!draft) return '';
    const n = 1234567.89;
    const [intPart, decPart] = n.toFixed(draft.decimals).split('.');
    const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, draft.thousandsSeparator || '');
    const num = draft.decimals > 0 ? `${grouped}${draft.decimalSeparator}${decPart}` : grouped;
    return draft.currencyPosition === 'prefix' ? `${draft.currency} ${num}` : `${num} ${draft.currency}`;
  })();



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
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/accounting/locale-packs">
            <ExternalLink className="h-3 w-3 mr-1" />
            Manage locale packs
          </Link>
        </Button>
      </div>
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
              Number & Date Formatting
            </CardTitle>
            <CardDescription>
              How amounts and dates are displayed across journal entries, ledger and reports.
              Formatting is a display concern only — all amounts are stored as integer cents/öre.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="rounded-md border bg-muted/40 px-4 py-3 text-sm">
              <span className="text-muted-foreground">Preview: </span>
              <span className="font-mono font-medium">{previewAmount}</span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="currency">Currency (ISO 4217)</Label>
                <Input
                  id="currency"
                  value={draft.currency}
                  maxLength={3}
                  onChange={(e) => patch({ currency: e.target.value.toUpperCase() })}
                />
              </div>

              <div className="space-y-2">
                <Label>Currency position</Label>
                <Select value={draft.currencyPosition} onValueChange={(v) => patch({ currencyPosition: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="suffix">After amount (1 234,56 SEK)</SelectItem>
                    <SelectItem value="prefix">Before amount (SEK 1 234.56)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Decimal places</Label>
                <Select value={String(draft.decimals)} onValueChange={(v) => patch({ decimals: Number(v) as 0 | 2 })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 (1 234,56)</SelectItem>
                    <SelectItem value="0">0 (1 235)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Rounding mode</Label>
                <Select value={draft.rounding} onValueChange={(v) => patch({ rounding: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="half-up">Half up (standard)</SelectItem>
                    <SelectItem value="half-even">Half even (banker's)</SelectItem>
                    <SelectItem value="down">Down (truncate)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Decimal separator</Label>
                <Select value={draft.decimalSeparator} onValueChange={(v) => patch({ decimalSeparator: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=",">Comma ( , )</SelectItem>
                    <SelectItem value=".">Period ( . )</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Thousands separator</Label>
                <Select value={draft.thousandsSeparator} onValueChange={(v) => patch({ thousandsSeparator: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=" ">Space (1 234 567)</SelectItem>
                    <SelectItem value=",">Comma (1,234,567)</SelectItem>
                    <SelectItem value=".">Period (1.234.567)</SelectItem>
                    <SelectItem value="">None (1234567)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Date format</Label>
                <Select value={draft.dateFormat} onValueChange={(v) => patch({ dateFormat: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="YYYY-MM-DD">2026-07-02 (ISO)</SelectItem>
                    <SelectItem value="DD/MM/YYYY">02/07/2026</SelectItem>
                    <SelectItem value="MM/DD/YYYY">07/02/2026</SelectItem>
                    <SelectItem value="DD.MM.YYYY">02.07.2026</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Fiscal year starts</Label>
                <Select
                  value={String(draft.fiscalYearStartMonth)}
                  onValueChange={(v) => patch({ fiscalYearStartMonth: Number(v) })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['January','February','March','April','May','June','July','August','September','October','November','December'].map((m, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
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
