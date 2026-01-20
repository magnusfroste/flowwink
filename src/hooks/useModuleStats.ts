import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ModulesSettings } from './useModules';

export interface ModuleStats {
  count: number;
  lastUsed?: string;
}

export type ModuleStatsMap = Partial<Record<keyof ModulesSettings, ModuleStats>>;

/**
 * Fetch statistics for each module (post count, last used, etc.)
 */
export function useModuleStats() {
  return useQuery({
    queryKey: ['module-stats'],
    queryFn: async (): Promise<ModuleStatsMap> => {
      const stats: ModuleStatsMap = {};

      // Parallel queries for all modules
      const [
        blogResult,
        newsletterResult,
        leadsResult,
        dealsResult,
        companiesResult,
        productsResult,
        ordersResult,
        kbResult,
        bookingsResult,
        pagesResult,
        formsResult,
      ] = await Promise.all([
        supabase.from('blog_posts').select('id, updated_at', { count: 'exact', head: false }).order('updated_at', { ascending: false }).limit(1),
        supabase.from('newsletters').select('id, updated_at', { count: 'exact', head: false }).order('updated_at', { ascending: false }).limit(1),
        supabase.from('leads').select('id, updated_at', { count: 'exact', head: false }).order('updated_at', { ascending: false }).limit(1),
        supabase.from('deals').select('id, updated_at', { count: 'exact', head: false }).order('updated_at', { ascending: false }).limit(1),
        supabase.from('companies').select('id, updated_at', { count: 'exact', head: false }).order('updated_at', { ascending: false }).limit(1),
        supabase.from('products').select('id, updated_at', { count: 'exact', head: false }).order('updated_at', { ascending: false }).limit(1),
        supabase.from('orders').select('id, updated_at', { count: 'exact', head: false }).order('updated_at', { ascending: false }).limit(1),
        supabase.from('kb_articles').select('id, updated_at', { count: 'exact', head: false }).order('updated_at', { ascending: false }).limit(1),
        supabase.from('bookings').select('id, updated_at', { count: 'exact', head: false }).order('updated_at', { ascending: false }).limit(1),
        supabase.from('pages').select('id, updated_at', { count: 'exact', head: false }).order('updated_at', { ascending: false }).limit(1),
        supabase.from('form_submissions').select('id, created_at', { count: 'exact', head: false }).order('created_at', { ascending: false }).limit(1),
      ]);

      // Map results to stats
      if (blogResult.count !== null) {
        stats.blog = { count: blogResult.count, lastUsed: blogResult.data?.[0]?.updated_at };
      }
      if (newsletterResult.count !== null) {
        stats.newsletter = { count: newsletterResult.count, lastUsed: newsletterResult.data?.[0]?.updated_at };
      }
      if (leadsResult.count !== null) {
        stats.leads = { count: leadsResult.count, lastUsed: leadsResult.data?.[0]?.updated_at };
      }
      if (dealsResult.count !== null) {
        stats.deals = { count: dealsResult.count, lastUsed: dealsResult.data?.[0]?.updated_at };
      }
      if (companiesResult.count !== null) {
        stats.companies = { count: companiesResult.count, lastUsed: companiesResult.data?.[0]?.updated_at };
      }
      if (productsResult.count !== null) {
        stats.products = { count: productsResult.count, lastUsed: productsResult.data?.[0]?.updated_at };
      }
      if (ordersResult.count !== null) {
        stats.orders = { count: ordersResult.count, lastUsed: ordersResult.data?.[0]?.updated_at };
      }
      if (kbResult.count !== null) {
        stats.knowledgeBase = { count: kbResult.count, lastUsed: kbResult.data?.[0]?.updated_at };
      }
      if (bookingsResult.count !== null) {
        stats.bookings = { count: bookingsResult.count, lastUsed: bookingsResult.data?.[0]?.updated_at };
      }
      if (pagesResult.count !== null) {
        stats.pages = { count: pagesResult.count, lastUsed: pagesResult.data?.[0]?.updated_at };
      }
      if (formsResult.count !== null) {
        stats.forms = { count: formsResult.count, lastUsed: formsResult.data?.[0]?.created_at };
      }

      return stats;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}
