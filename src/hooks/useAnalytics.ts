import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfMonth, endOfMonth, subMonths, format, eachDayOfInterval, subDays } from 'date-fns';

export interface AnalyticsSummary {
  totalLeads: number;
  totalDeals: number;
  dealsPipelineValue: number;
  newsletterSubscribers: number;
  formSubmissions: number;
  publishedPages: number;
  publishedPosts: number;
  totalPageViews: number;
  uniqueVisitors: number;
}

export interface LeadsBySource {
  source: string;
  count: number;
}

export interface LeadsByStatus {
  status: string;
  count: number;
}

export interface DealsByStage {
  stage: string;
  count: number;
  value: number;
}

export interface NewsletterPerformance {
  id: string;
  subject: string;
  sent_count: number;
  open_count: number;
  unique_opens: number;
  click_count: number;
  unique_clicks: number;
  sent_at: string | null;
}

export interface TimeSeriesData {
  date: string;
  leads: number;
  formSubmissions: number;
  pageViews: number;
}

export interface PageViewsByPage {
  page_slug: string;
  page_title: string | null;
  views: number;
  unique_visitors: number;
}

export interface PageViewsTimeSeries {
  date: string;
  views: number;
  unique_visitors: number;
}

export function useAnalyticsSummary() {
  return useQuery({
    queryKey: ['analytics', 'summary'],
    queryFn: async (): Promise<AnalyticsSummary> => {
      const [
        leadsResult,
        dealsResult,
        subscribersResult,
        formsResult,
        pagesResult,
        postsResult,
        pageViewsResult,
        uniqueVisitorsResult,
      ] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('deals').select('value_cents, stage'),
        supabase.from('newsletter_subscribers').select('id', { count: 'exact', head: true }).eq('status', 'confirmed'),
        supabase.from('form_submissions').select('id', { count: 'exact', head: true }),
        supabase.from('pages').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('blog_posts').select('id', { count: 'exact', head: true }).eq('status', 'published'),
        supabase.from('page_views').select('id', { count: 'exact', head: true }),
        supabase.from('page_views').select('visitor_id'),
      ]);

      // Calculate pipeline value (exclude closed_lost)
      const pipelineValue = (dealsResult.data || [])
        .filter(d => d.stage !== 'closed_lost')
        .reduce((sum, d) => sum + (d.value_cents || 0), 0);

      // Calculate unique visitors
      const uniqueVisitors = new Set((uniqueVisitorsResult.data || []).map(v => v.visitor_id).filter(Boolean)).size;

      return {
        totalLeads: leadsResult.count || 0,
        totalDeals: dealsResult.data?.length || 0,
        dealsPipelineValue: pipelineValue,
        newsletterSubscribers: subscribersResult.count || 0,
        formSubmissions: formsResult.count || 0,
        publishedPages: pagesResult.count || 0,
        publishedPosts: postsResult.count || 0,
        totalPageViews: pageViewsResult.count || 0,
        uniqueVisitors,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useLeadsBySource() {
  return useQuery({
    queryKey: ['analytics', 'leads-by-source'],
    queryFn: async (): Promise<LeadsBySource[]> => {
      const { data, error } = await supabase
        .from('leads')
        .select('source');

      if (error) throw error;

      // Group by source
      const grouped = (data || []).reduce((acc, lead) => {
        const source = lead.source || 'unknown';
        acc[source] = (acc[source] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return Object.entries(grouped)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useLeadsByStatus() {
  return useQuery({
    queryKey: ['analytics', 'leads-by-status'],
    queryFn: async (): Promise<LeadsByStatus[]> => {
      const { data, error } = await supabase
        .from('leads')
        .select('status');

      if (error) throw error;

      const grouped = (data || []).reduce((acc, lead) => {
        const status = lead.status || 'unknown';
        acc[status] = (acc[status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return Object.entries(grouped)
        .map(([status, count]) => ({ status, count }));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useDealsByStage() {
  return useQuery({
    queryKey: ['analytics', 'deals-by-stage'],
    queryFn: async (): Promise<DealsByStage[]> => {
      const { data, error } = await supabase
        .from('deals')
        .select('stage, value_cents');

      if (error) throw error;

      const grouped = (data || []).reduce((acc, deal) => {
        const stage = deal.stage;
        if (!acc[stage]) {
          acc[stage] = { count: 0, value: 0 };
        }
        acc[stage].count += 1;
        acc[stage].value += deal.value_cents || 0;
        return acc;
      }, {} as Record<string, { count: number; value: number }>);

      const stageOrder = ['proposal', 'negotiation', 'closed_won', 'closed_lost'];
      return stageOrder
        .filter(stage => grouped[stage])
        .map(stage => ({
          stage,
          count: grouped[stage].count,
          value: grouped[stage].value,
        }));
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useNewsletterPerformance() {
  return useQuery({
    queryKey: ['analytics', 'newsletter-performance'],
    queryFn: async (): Promise<NewsletterPerformance[]> => {
      const { data, error } = await supabase
        .from('newsletters')
        .select('id, subject, sent_count, open_count, unique_opens, click_count, unique_clicks, sent_at')
        .eq('status', 'sent')
        .order('sent_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useTimeSeriesData(days: number = 30) {
  return useQuery({
    queryKey: ['analytics', 'time-series', days],
    queryFn: async (): Promise<TimeSeriesData[]> => {
      const endDate = new Date();
      const startDate = subDays(endDate, days);

      const [leadsResult, formsResult, pageViewsResult] = await Promise.all([
        supabase
          .from('leads')
          .select('created_at')
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString()),
        supabase
          .from('form_submissions')
          .select('created_at')
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString()),
        supabase
          .from('page_views')
          .select('created_at')
          .gte('created_at', startDate.toISOString())
          .lte('created_at', endDate.toISOString()),
      ]);

      // Create date range
      const dates = eachDayOfInterval({ start: startDate, end: endDate });
      
      // Group leads by date
      const leadsByDate = (leadsResult.data || []).reduce((acc, lead) => {
        const date = format(new Date(lead.created_at), 'yyyy-MM-dd');
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Group forms by date
      const formsByDate = (formsResult.data || []).reduce((acc, form) => {
        const date = format(new Date(form.created_at), 'yyyy-MM-dd');
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      // Group page views by date
      const pageViewsByDate = (pageViewsResult.data || []).reduce((acc, view) => {
        const date = format(new Date(view.created_at), 'yyyy-MM-dd');
        acc[date] = (acc[date] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      return dates.map(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return {
          date: format(date, 'dd MMM'),
          leads: leadsByDate[dateStr] || 0,
          formSubmissions: formsByDate[dateStr] || 0,
          pageViews: pageViewsByDate[dateStr] || 0,
        };
      });
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function usePageViewsByPage(limit: number = 10) {
  return useQuery({
    queryKey: ['analytics', 'page-views-by-page', limit],
    queryFn: async (): Promise<PageViewsByPage[]> => {
      const { data, error } = await supabase
        .from('page_views')
        .select('page_slug, page_title, visitor_id');

      if (error) throw error;

      // Group by page_slug
      const grouped = (data || []).reduce((acc, view) => {
        const slug = view.page_slug;
        if (!acc[slug]) {
          acc[slug] = { 
            page_slug: slug, 
            page_title: view.page_title, 
            views: 0, 
            visitors: new Set<string>() 
          };
        }
        acc[slug].views += 1;
        if (view.visitor_id) {
          acc[slug].visitors.add(view.visitor_id);
        }
        return acc;
      }, {} as Record<string, { page_slug: string; page_title: string | null; views: number; visitors: Set<string> }>);

      return Object.values(grouped)
        .map(item => ({
          page_slug: item.page_slug,
          page_title: item.page_title,
          views: item.views,
          unique_visitors: item.visitors.size,
        }))
        .sort((a, b) => b.views - a.views)
        .slice(0, limit);
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function usePageViewsTimeSeries(days: number = 30) {
  return useQuery({
    queryKey: ['analytics', 'page-views-time-series', days],
    queryFn: async (): Promise<PageViewsTimeSeries[]> => {
      const endDate = new Date();
      const startDate = subDays(endDate, days);

      const { data, error } = await supabase
        .from('page_views')
        .select('created_at, visitor_id')
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString());

      if (error) throw error;

      const dates = eachDayOfInterval({ start: startDate, end: endDate });
      
      // Group by date
      const byDate = (data || []).reduce((acc, view) => {
        const date = format(new Date(view.created_at), 'yyyy-MM-dd');
        if (!acc[date]) {
          acc[date] = { views: 0, visitors: new Set<string>() };
        }
        acc[date].views += 1;
        if (view.visitor_id) {
          acc[date].visitors.add(view.visitor_id);
        }
        return acc;
      }, {} as Record<string, { views: number; visitors: Set<string> }>);

      return dates.map(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return {
          date: format(date, 'dd MMM'),
          views: byDate[dateStr]?.views || 0,
          unique_visitors: byDate[dateStr]?.visitors.size || 0,
        };
      });
    },
    staleTime: 1000 * 60 * 5,
  });
}

export function useMonthlyComparison() {
  return useQuery({
    queryKey: ['analytics', 'monthly-comparison'],
    queryFn: async () => {
      const now = new Date();
      const thisMonthStart = startOfMonth(now);
      const thisMonthEnd = endOfMonth(now);
      const lastMonthStart = startOfMonth(subMonths(now, 1));
      const lastMonthEnd = endOfMonth(subMonths(now, 1));

      const [thisMonthLeads, lastMonthLeads, thisMonthDeals, lastMonthDeals] = await Promise.all([
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', thisMonthStart.toISOString())
          .lte('created_at', thisMonthEnd.toISOString()),
        supabase
          .from('leads')
          .select('id', { count: 'exact', head: true })
          .gte('created_at', lastMonthStart.toISOString())
          .lte('created_at', lastMonthEnd.toISOString()),
        supabase
          .from('deals')
          .select('value_cents')
          .gte('created_at', thisMonthStart.toISOString())
          .lte('created_at', thisMonthEnd.toISOString()),
        supabase
          .from('deals')
          .select('value_cents')
          .gte('created_at', lastMonthStart.toISOString())
          .lte('created_at', lastMonthEnd.toISOString()),
      ]);

      const thisMonthValue = (thisMonthDeals.data || []).reduce((sum, d) => sum + (d.value_cents || 0), 0);
      const lastMonthValue = (lastMonthDeals.data || []).reduce((sum, d) => sum + (d.value_cents || 0), 0);

      return {
        leads: {
          current: thisMonthLeads.count || 0,
          previous: lastMonthLeads.count || 0,
          change: lastMonthLeads.count 
            ? Math.round(((thisMonthLeads.count || 0) - lastMonthLeads.count) / lastMonthLeads.count * 100)
            : 0,
        },
        dealValue: {
          current: thisMonthValue,
          previous: lastMonthValue,
          change: lastMonthValue 
            ? Math.round((thisMonthValue - lastMonthValue) / lastMonthValue * 100)
            : 0,
        },
      };
    },
    staleTime: 1000 * 60 * 5,
  });
}
