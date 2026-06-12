import { logger } from '@/lib/logger';
import { useState, KeyboardEvent } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Sparkles, Loader2, X } from 'lucide-react';
import { useCreateCompany, useCompanies } from '@/hooks/useCompanies';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';

const COMPANY_SIZES = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1000+', label: '1000+ employees' },
];

const INDUSTRIES = [
  'Technology', 'Finance', 'Healthcare', 'Manufacturing', 'Retail',
  'Consulting', 'Education', 'Media', 'Real Estate', 'Transportation', 'Other',
];

interface CreateCompanyDialogProps {
  trigger?: React.ReactNode;
  onCreated?: (companyId: string) => void;
}

function useUserOptions() {
  return useQuery({
    queryKey: ['profiles', 'options'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name', { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
    },
  });
}

export function CreateCompanyDialog({ trigger, onCreated }: CreateCompanyDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [industry, setIndustry] = useState('');
  const [size, setSize] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [orgNumber, setOrgNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [employeeCount, setEmployeeCount] = useState<string>('');
  const [annualRevenue, setAnnualRevenue] = useState<string>('');
  const [creditLimit, setCreditLimit] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [parentCompanyId, setParentCompanyId] = useState<string>('');
  const [accountOwner, setAccountOwner] = useState<string>('');
  const [isEnriching, setIsEnriching] = useState(false);

  const createCompany = useCreateCompany();
  const { data: companies } = useCompanies();
  const { data: users } = useUserOptions();

  const handleEnrich = async () => {
    if (!domain) return toast.error('Enter a domain first');
    setIsEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-company', { body: { domain } });
      if (error) throw error;
      if (data?.success && data?.data) {
        const e = data.data;
        if (e.industry && !industry) setIndustry(e.industry);
        if (e.size && !size) setSize(e.size);
        if (e.phone && !phone) setPhone(e.phone);
        if (e.website && !website) setWebsite(e.website);
        if (e.address && !address) setAddress(e.address);
        if (e.description && !notes) setNotes(e.description);
        toast.success('Company information fetched');
      } else toast.error('Could not fetch company information');
    } catch (error) {
      logger.error('Enrichment error:', error);
      toast.error('Could not fetch company information');
    } finally {
      setIsEnriching(false);
    }
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setTagInput('');
  };

  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = await createCompany.mutateAsync({
      name,
      domain: domain || null,
      industry: industry || null,
      size: size || null,
      phone: phone || null,
      website: website || null,
      address: address || null,
      notes: notes || null,
      created_by: null,
      enriched_at: industry || size || phone || address ? new Date().toISOString() : null,
      org_number: orgNumber || null,
      vat_number: vatNumber || null,
      employee_count: employeeCount ? Number(employeeCount) : null,
      annual_revenue_cents: annualRevenue ? Math.round(Number(annualRevenue) * 100) : null,
      credit_limit_cents: creditLimit ? Math.round(Number(creditLimit) * 100) : null,
      tags: tags.length ? tags : null,
      parent_company_id: parentCompanyId || null,
      account_owner: accountOwner || null,
    } as any);

    if (result) {
      onCreated?.(result.id);
      setOpen(false);
      resetForm();
    }
  };

  const resetForm = () => {
    setName(''); setDomain(''); setIndustry(''); setSize('');
    setPhone(''); setWebsite(''); setAddress(''); setNotes('');
    setOrgNumber(''); setVatNumber(''); setEmployeeCount('');
    setAnnualRevenue(''); setCreditLimit(''); setTags([]); setTagInput('');
    setParentCompanyId(''); setAccountOwner('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            New company
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create new company</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Company name *</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="domain">Domain</Label>
            <div className="flex gap-2">
              <Input id="domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" className="flex-1" />
              <Button type="button" variant="outline" onClick={handleEnrich} disabled={!domain || isEnriching} className="shrink-0">
                {isEnriching ? <Loader2 className="h-4 w-4 animate-spin" /> : (<><Sparkles className="h-4 w-4 mr-1" />Enrich</>)}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input id="website" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://acme.com" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger><SelectValue placeholder="Select industry" /></SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Size</Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger><SelectValue placeholder="Select size" /></SelectTrigger>
                <SelectContent>
                  {COMPANY_SIZES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 123 4567" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="New York, USA" />
            </div>
          </div>

          {/* Legal & financial */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="org">Org number</Label>
              <Input id="org" value={orgNumber} onChange={(e) => setOrgNumber(e.target.value)} placeholder="556677-8899" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vat">VAT number</Label>
              <Input id="vat" value={vatNumber} onChange={(e) => setVatNumber(e.target.value)} placeholder="SE556677889901" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emp">Employees</Label>
              <Input id="emp" type="number" min="0" value={employeeCount} onChange={(e) => setEmployeeCount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rev">Annual revenue</Label>
              <Input id="rev" type="number" min="0" step="0.01" value={annualRevenue} onChange={(e) => setAnnualRevenue(e.target.value)} placeholder="1000000" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="credit">Credit limit</Label>
              <Input id="credit" type="number" min="0" step="0.01" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} placeholder="50000" />
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={onTagKey}
                placeholder="Type a tag and press Enter"
              />
              <Button type="button" variant="outline" onClick={addTag} disabled={!tagInput.trim()}>Add</Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Relationships */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Parent company</Label>
              <Select value={parentCompanyId || 'none'} onValueChange={(v) => setParentCompanyId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {companies?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Account owner</Label>
              <Select value={accountOwner || 'none'} onValueChange={(v) => setAccountOwner(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {users?.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.full_name || u.email || u.id.slice(0, 8)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional information..." rows={3} />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createCompany.isPending || !name}>
              {createCompany.isPending ? 'Creating...' : 'Create company'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
