import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

export function SalesUomSelect({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const { data } = useQuery({
    queryKey: ['uoms-with-category'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('uoms')
        .select('id, name, code, is_active, category:uom_categories(name)')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as Array<{ id: string; name: string; code: string | null; category: { name: string } | null }>;
    },
  });

  return (
    <div className="space-y-2">
      <Label>Sales unit</Label>
      <Select value={value ?? '__none__'} onValueChange={v => onChange(v === '__none__' ? null : v)}>
        <SelectTrigger>
          <SelectValue placeholder="Default" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none__">Default</SelectItem>
          {data?.map(u => (
            <SelectItem key={u.id} value={u.id}>
              {u.name}
              {u.code ? ` (${u.code})` : ''} {u.category ? `· ${u.category.name}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
