import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GrowthMetrics {
  totalSpendCents: number;
  totalBudgetCents: number;
  totalImpressions: number;
  totalClicks: number;
  totalConversions: number;
  ctr: number;
  cpc: number;
  roi: number;
  currency: string;
  activeCampaigns: number;
  totalCampaigns: number;
}

export interface CampaignSummary {
  id: string;
  name: string;
  platform: string;
  status: string;
  budgetCents: number;
  spentCents: number;
  currency: string;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  creativesCount: number;
}

function extractMetrics(metrics: unknown): { impressions: number; clicks: number; conversions: number } {
  const m = metrics as Record<string, number> | null;
  return {
    impressions: m?.impressions ?? 0,
    clicks: m?.clicks ?? 0,
    conversions: m?.conversions ?? 0,
  };
}

export function useGrowthDashboard() {
  return useQuery({
    queryKey: ['growth-dashboard'],
    queryFn: async () => {
      const { data: campaigns, error } = await supabase
        .from('ad_campaigns')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const rows = campaigns ?? [];

      const summaries: CampaignSummary[] = rows.map((c) => {
        const m = extractMetrics(c.metrics);
        return {
          id: c.id,
          name: c.name,
          platform: c.platform,
          status: c.status,
          budgetCents: c.budget_cents,
          spentCents: c.spent_cents,
          currency: c.currency,
          impressions: m.impressions,
          clicks: m.clicks,
          conversions: m.conversions,
          ctr: m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0,
          creativesCount: 0,
        };
      });

      const totalSpendCents = rows.reduce((s, c) => s + c.spent_cents, 0);
      const totalBudgetCents = rows.reduce((s, c) => s + c.budget_cents, 0);
      const totalImpressions = summaries.reduce((s, c) => s + c.impressions, 0);
      const totalClicks = summaries.reduce((s, c) => s + c.clicks, 0);
      const totalConversions = summaries.reduce((s, c) => s + c.conversions, 0);
      const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
      const cpc = totalClicks > 0 ? totalSpendCents / totalClicks / 100 : 0;
      // Simple ROI: (conversions value - spend) / spend. Using conversions as proxy count.
      const roi = totalSpendCents > 0 ? ((totalConversions * 100 - totalSpendCents / 100) / (totalSpendCents / 100)) * 100 : 0;

      const metrics: GrowthMetrics = {
        totalSpendCents,
        totalBudgetCents,
        totalImpressions,
        totalClicks,
        totalConversions,
        ctr,
        cpc,
        roi,
        currency: rows[0]?.currency ?? 'SEK',
        activeCampaigns: rows.filter((c) => c.status === 'active').length,
        totalCampaigns: rows.length,
      };

      return { metrics, campaigns: summaries };
    },
    refetchInterval: 60_000,
  });
}
