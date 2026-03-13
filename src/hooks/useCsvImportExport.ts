import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  parseCSV,
  generateCSV,
  downloadCSV,
  leadCsvHeaderMap,
  leadCsvColumns,
  companyCsvHeaderMap,
  companyCsvColumns,
  productCsvHeaderMap,
  productCsvColumns,
  type LeadCsvRow,
  type CompanyCsvRow,
  type ProductCsvRow,
} from '@/lib/csv-utils';
import type { LeadWithCompany } from '@/hooks/useLeads';
import type { Company } from '@/hooks/useCompanies';
import type { Product } from '@/hooks/useProducts';

export function useExportLeads() {
  return async (leads: LeadWithCompany[]) => {
    const exportData = leads.map((lead) => ({
      email: lead.email,
      name: lead.name || '',
      phone: lead.phone || '',
      source: lead.source || '',
      status: lead.status || '',
    }));
    
    const csv = generateCSV(exportData, leadCsvColumns);
    const date = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `leads-export-${date}.csv`);
    toast.success(`Exported ${leads.length} leads`);
  };
}

export function useExportCompanies() {
  return async (companies: Company[]) => {
    const exportData = companies.map((company) => ({
      name: company.name,
      domain: company.domain || '',
      industry: company.industry || '',
      size: company.size || '',
      website: company.website || '',
      phone: company.phone || '',
      address: company.address || '',
    }));
    
    const csv = generateCSV(exportData, companyCsvColumns);
    const date = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `companies-export-${date}.csv`);
    toast.success(`Exported ${companies.length} companies`);
  };
}

export function useImportLeads() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (file: File): Promise<{ success: number; errors: string[] }> => {
      const text = await file.text();
      const { data, errors: parseErrors } = parseCSV<LeadCsvRow>(
        text,
        leadCsvHeaderMap,
        ['email']
      );
      
      if (parseErrors.length > 0 && data.length === 0) {
        return { success: 0, errors: parseErrors };
      }
      
      const allErrors = [...parseErrors];
      let successCount = 0;
      
      // Process in batches of 50
      const batchSize = 50;
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        const insertData = batch.map((row) => ({
          email: row.email.toLowerCase().trim(),
          name: row.name || null,
          phone: row.phone || null,
          source: row.source || 'csv_import',
          status: validateLeadStatus(row.status) ? row.status : 'lead',
        }));
        
        const { data: inserted, error } = await supabase
          .from('leads')
          .upsert(insertData, { 
            onConflict: 'email',
            ignoreDuplicates: false,
          })
          .select();
        
        if (error) {
          allErrors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
        } else {
          successCount += inserted?.length || 0;
        }
      }
      
      return { success: successCount, errors: allErrors };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      if (result.success > 0) {
        toast.success(`Imported ${result.success} leads`);
      }
    },
    onError: (error) => {
      toast.error('Import failed: ' + error.message);
    },
  });
}

export function useImportCompanies() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (file: File): Promise<{ success: number; errors: string[] }> => {
      const text = await file.text();
      const { data, errors: parseErrors } = parseCSV<CompanyCsvRow>(
        text,
        companyCsvHeaderMap,
        ['name']
      );
      
      if (parseErrors.length > 0 && data.length === 0) {
        return { success: 0, errors: parseErrors };
      }
      
      const allErrors = [...parseErrors];
      let successCount = 0;
      
      // Process in batches of 50
      const batchSize = 50;
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        const insertData = batch.map((row) => ({
          name: row.name.trim(),
          domain: row.domain || null,
          industry: row.industry || null,
          size: row.size || null,
          website: row.website || null,
          phone: row.phone || null,
          address: row.address || null,
        }));
        
        const { data: inserted, error } = await supabase
          .from('companies')
          .insert(insertData)
          .select();
        
        if (error) {
          allErrors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
        } else {
          successCount += inserted?.length || 0;
        }
      }
      
      return { success: successCount, errors: allErrors };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['companies'] });
      if (result.success > 0) {
        toast.success(`Imported ${result.success} companies`);
      }
    },
    onError: (error) => {
      toast.error('Import failed: ' + error.message);
    },
  });
}

function validateLeadStatus(status: string | null): status is 'lead' | 'opportunity' | 'customer' | 'lost' {
  return status !== null && ['lead', 'opportunity', 'customer', 'lost'].includes(status);
}

function validateProductType(type: string | null): type is 'one_time' | 'recurring' {
  return type !== null && ['one_time', 'recurring', 'one-time'].includes(type);
}

function parsePriceToCents(price: string | null): number {
  if (!price) return 0;
  // Remove currency symbols and whitespace
  const cleaned = price.replace(/[^0-9.,\-]/g, '').trim();
  if (!cleaned) return 0;
  // Handle comma as decimal separator (European format)
  const normalized = cleaned.includes(',') && !cleaned.includes('.')
    ? cleaned.replace(',', '.')
    : cleaned.replace(',', '');
  const num = parseFloat(normalized);
  if (isNaN(num)) return 0;
  // If the number looks like it's already in cents (no decimal), return as-is
  // Otherwise multiply by 100
  return Number.isInteger(num) && num > 1000 ? num : Math.round(num * 100);
}

export function useExportProducts() {
  return async (products: Product[]) => {
    const exportData = products.map((p) => ({
      name: p.name,
      description: p.description || '',
      price: (p.price_cents / 100).toString(),
      currency: p.currency || 'USD',
      type: p.type || 'one_time',
      image_url: p.image_url || '',
    }));
    
    const csv = generateCSV(exportData, productCsvColumns);
    const date = new Date().toISOString().split('T')[0];
    downloadCSV(csv, `products-export-${date}.csv`);
    toast.success(`Exported ${products.length} products`);
  };
}

export function useImportProducts() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (file: File): Promise<{ success: number; errors: string[] }> => {
      const text = await file.text();
      const { data, errors: parseErrors } = parseCSV<ProductCsvRow>(
        text,
        productCsvHeaderMap,
        ['name']
      );
      
      if (parseErrors.length > 0 && data.length === 0) {
        return { success: 0, errors: parseErrors };
      }
      
      const allErrors = [...parseErrors];
      let successCount = 0;
      
      const batchSize = 50;
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        const insertData = batch.map((row) => ({
          name: row.name.trim(),
          description: row.description || null,
          price_cents: parsePriceToCents(row.price),
          currency: row.currency?.toUpperCase()?.trim() || 'USD',
          type: (validateProductType(row.type?.toLowerCase()?.replace('-', '_')?.trim() ?? null)
            ? row.type!.toLowerCase().replace('-', '_').trim()
            : 'one_time') as 'one_time' | 'recurring',
          image_url: row.image_url || null,
          is_active: true,
        }));
        
        const { data: inserted, error } = await supabase
          .from('products')
          .insert(insertData)
          .select();
        
        if (error) {
          allErrors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`);
        } else {
          successCount += inserted?.length || 0;
        }
      }
      
      return { success: successCount, errors: allErrors };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      if (result.success > 0) {
        toast.success(`Imported ${result.success} products`);
      }
    },
    onError: (error) => {
      toast.error('Import failed: ' + error.message);
    },
  });
}
