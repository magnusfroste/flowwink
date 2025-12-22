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
  { value: '1-10', label: '1-10 anställda' },
  { value: '11-50', label: '11-50 anställda' },
  { value: '51-200', label: '51-200 anställda' },
  { value: '201-500', label: '201-500 anställda' },
  { value: '501-1000', label: '501-1000 anställda' },
  { value: '1000+', label: '1000+ anställda' },
];

const INDUSTRIES = [
  'Teknik',
  'Finans',
  'Hälsovård',
  'Tillverkning',
  'Detaljhandel',
  'Konsulting',
  'Utbildning',
  'Media',
  'Fastigheter',
  'Transport',
  'Övrigt',
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
      toast.error('Ange en domän först');
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

        toast.success('Företagsinformation hämtad');
      } else {
        toast.error('Kunde inte hämta företagsinformation');
      }
    } catch (error) {
      console.error('Enrichment error:', error);
      toast.error('Kunde inte hämta företagsinformation');
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
            Nytt företag
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Skapa nytt företag</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Företagsnamn *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme AB"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="domain">Domän</Label>
            <div className="flex gap-2">
              <Input
                id="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="acme.se"
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
                    Berika
                  </>
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Ange domän och klicka "Berika" för att automatiskt hämta företagsinformation
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="website">Webbplats</Label>
            <Input
              id="website"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              placeholder="https://acme.se"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="industry">Bransch</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj bransch" />
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
              <Label htmlFor="size">Storlek</Label>
              <Select value={size} onValueChange={setSize}>
                <SelectTrigger>
                  <SelectValue placeholder="Välj storlek" />
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
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+46 8 123 456"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Adress</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Stockholm, Sverige"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Anteckningar</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Övrig information..."
              rows={3}
            />
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button type="submit" disabled={createCompany.isPending || !name}>
              {createCompany.isPending ? 'Skapar...' : 'Skapa företag'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
