import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

// ─── Addresses ───

export interface CustomerAddress {
  id: string;
  user_id: string;
  label: string;
  full_name: string;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string | null;
  postal_code: string;
  country: string;
  phone: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export function useCustomerAddresses() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['customer-addresses', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CustomerAddress[];
    },
  });
}

export function useUpsertAddress() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (address: Partial<CustomerAddress> & { id?: string }) => {
      if (!user) throw new Error('Not authenticated');

      const { id, created_at, updated_at, ...fields } = address;
      const payload = {
        ...fields,
        user_id: user.id,
      };

      if (id) {
        const { data, error } = await supabase
          .from('customer_addresses')
          .update(payload)
          .eq('id', id)
          .select()
          .single();
        if (error) throw error;
        return data;
      } else {
        const { data, error } = await supabase
          .from('customer_addresses')
          .insert([payload as any])
          .select()
          .single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-addresses'] });
      toast.success('Address saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('customer_addresses').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-addresses'] });
      toast.success('Address removed');
    },
  });
}

// ─── Orders ───

export interface CustomerOrder {
  id: string;
  status: string;
  total_cents: number;
  currency: string;
  customer_email: string;
  customer_name: string | null;
  created_at: string;
}

export interface CustomerOrderItem {
  id: string;
  product_name: string;
  quantity: number;
  price_cents: number;
}

export function useCustomerOrders() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['customer-orders', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, status, total_cents, currency, customer_email, customer_name, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as CustomerOrder[];
    },
  });
}

export function useCustomerOrderItems(orderId: string | null) {
  return useQuery({
    queryKey: ['customer-order-items', orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select('id, product_name, quantity, price_cents')
        .eq('order_id', orderId!);
      if (error) throw error;
      return data as CustomerOrderItem[];
    },
  });
}

// ─── Wishlist ───

export function useWishlist() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['wishlist', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wishlist_items')
        .select('id, product_id, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Array<{ id: string; product_id: string; created_at: string }>;
    },
  });
}

export function useToggleWishlist() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (productId: string) => {
      if (!user) throw new Error('Not authenticated');

      // Check if already in wishlist
      const { data: existing } = await supabase
        .from('wishlist_items')
        .select('id')
        .eq('product_id', productId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (existing) {
        await supabase.from('wishlist_items').delete().eq('id', existing.id);
        return { action: 'removed' as const };
      } else {
        await supabase.from('wishlist_items').insert({ product_id: productId, user_id: user.id });
        return { action: 'added' as const };
      }
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['wishlist'] });
      toast.success(result.action === 'added' ? 'Added to wishlist' : 'Removed from wishlist');
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
