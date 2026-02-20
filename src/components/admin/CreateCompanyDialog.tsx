import { logger } from '@/lib/logger';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Sparkles, Loader2 } from 'lucide-react';
import { useCreateCompany } from '@/hooks/useCompanies';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const COMPANY_SIZES = [
  { value: '1-10', label: '1-10 employees' },
  { value: '11-50', label: '11-50 employees' },
  { value: '51-200', label: '51-200 employees' },
  { value: '201-500', label: '201-500 employees' },
  { value: '501-1000', label: '501-1000 employees' },
  { value: '1000+', label: '1000+ employees' },
];

const INDUSTRIES = [
  'Technology',
  'Finance',
  'Healthcare',
  'Manufacturing',
  'Retail',
  'Consulting',
  'Education',
  'Media',
  'Real Estate',
  'Transportation',
  'Other',
];

interface CreateCompanyDialogProps {
  trigger?: React.ReactNode;
  onCreated?: (companyId: string) => void;
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
  const [isEnriching, setIsEnriching] = useState(false);

  const createCompany = useCreateCompany();

  const handleEnrich = async () => {
    if (!domain) {
      toast.error('Enter a domain first');
      return;
    }

    setIsEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-company', {
        body: { domain }
      });

      if (error) throw error;

      if (data?.success && data?.data) {
        const enrichment = data.data;
        
        // Update fields with enriched data (only if currently empty)
        if (enrichment.industry && !industry) setIndustry(enrichment.industry);
        if (enrichment.size && !size) setSize(enrichment.size);
        if (enrichment.phone && !phone) setPhone(enrichment.phone);
        if (enrichment.website && !website) setWebsite(enrichment.website);
        if (enrichment.address && !address) setAddress(enrichment.address);
        if (enrichment.description && !notes) setNotes(enrichment.description);

        toast.success('Company information fetched');
      } else {
        toast.error('Could not fetch company information');
      }
    } catch (error) {
      logger.error('Enrichment error:', error);
      toast.error('Could not fetch company information');
    } finally {
      setIsEnriching(false);
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
    });

    if (result) {
      onCreated?.(result.id);
      setOpen(false);
      resetForm();
    }
  };

  const resetForm = () => {
    setName('');
    setDomain('');
    setIndustry('');
    setSize('');
    setPhone('');
    setWebsite('');
    setAddress('');
    setNotes('');
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
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create new company</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Company name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="domain">Domain</Label>
            <div className="flex gap-2">
              <Input
                id="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="acme.com"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleEnrich}
                disabled={!domain || isEnriching}
                className="shrink-0"
              >
                {isEnriching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-1" />
                    Enrich
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Enter a domain and click "Enrich" to automatically fetch company information
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Website</Label>
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://acme.com"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="size">Size</Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger>
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  {COMPANY_SIZES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 555 123 4567"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="New York, USA"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional information..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createCompany.isPending || !name}>
              {createCompany.isPending ? 'Creating...' : 'Create company'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
