import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Settings, Globe, Check, Database } from 'lucide-react';
import { useAccountingLocale, ACCOUNTING_LOCALES } from '@/hooks/useAccountingLocale';
import { useChartOfAccounts } from '@/hooks/useAccounting';
import { IFRS_TEMPLATES } from '@/data/templates-ifrs';
import { US_GAAP_TEMPLATES } from '@/data/templates-usgaap';
import { IFRS_ACCOUNTS } from '@/data/accounts-ifrs';
import { US_GAAP_ACCOUNTS } from '@/data/accounts-usgaap';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function SettingsTab() {
  const { locale, setLocale } = useAccountingLocale();
  const { data: accounts } = useChartOfAccounts();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [seeding, setSeeding] = useState(false);

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
        await supabase.from('accounting_templates').insert(templatesToSeed);
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
// Locale routing
// ============================================================

function getAccountsForLocale(locale: string) {
  if (locale === 'ifrs-generic') return IFRS_ACCOUNTS;
  if (locale === 'us-gaap') return US_GAAP_ACCOUNTS;
  return []; // BAS 2024 is seeded by the bootstrap
}

function getTemplatesForLocale(locale: string) {
  if (locale === 'ifrs-generic') return IFRS_TEMPLATES;
  if (locale === 'us-gaap') return US_GAAP_TEMPLATES;
  return []; // BAS 2024 templates are seeded by the bootstrap
}
