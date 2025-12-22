import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { AdminPageHeader } from '@/components/admin/AdminPageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Briefcase, TrendingUp, Trophy, XCircle } from 'lucide-react';
import { useDeals, useUpdateDeal, useDealStats, getDealStageInfo, type DealStage } from '@/hooks/useDeals';
import { formatPrice } from '@/hooks/useProducts';
import { CreateDealDialog } from '@/components/admin/CreateDealDialog';
import { format } from 'date-fns';

export default function DealsPage() {
  const { data: deals = [], isLoading } = useDeals();
  const { data: stats } = useDealStats();
  const updateDeal = useUpdateDeal();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const handleStageChange = (dealId: string, stage: DealStage) => {
    updateDeal.mutate({ id: dealId, stage });
  };

  const activeDeals = deals.filter(d => d.stage === 'proposal' || d.stage === 'negotiation');
  const closedDeals = deals.filter(d => d.stage === 'closed_won' || d.stage === 'closed_lost');

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Deals"
          description="Manage your sales pipeline and opportunities"
        >
          <Button onClick={() => {
            setSelectedLeadId(null);
            setDialogOpen(true);
          }}>
            <Plus className="h-4 w-4 mr-2" />
            New Deal
          </Button>
        </AdminPageHeader>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pipeline Value</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats ? formatPrice(stats.totalPipeline) : <Skeleton className="h-8 w-24" />}
              </div>
              <p className="text-xs text-muted-foreground">
                Active opportunities
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Proposal</CardTitle>
              <Briefcase className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats ? stats.proposal.count : <Skeleton className="h-8 w-12" />}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats ? formatPrice(stats.proposal.value) : ''}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Negotiation</CardTitle>
              <Briefcase className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats ? stats.negotiation.count : <Skeleton className="h-8 w-12" />}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats ? formatPrice(stats.negotiation.value) : ''}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Won This Period</CardTitle>
              <Trophy className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats ? stats.closed_won.count : <Skeleton className="h-8 w-12" />}
              </div>
              <p className="text-xs text-muted-foreground">
                {stats ? formatPrice(stats.closed_won.value) : ''}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Active Deals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Active Deals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : activeDeals.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Briefcase className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p>No active deals</p>
                <p className="text-sm">Create a deal to start tracking opportunities</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Stage</TableHead>
                    <TableHead>Expected Close</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeDeals.map(deal => {
                    const stageInfo = getDealStageInfo(deal.stage);
                    return (
                      <TableRow key={deal.id}>
                        <TableCell className="font-medium">
                          {deal.product?.name || 'Custom deal'}
                        </TableCell>
                        <TableCell>
                          <Link 
                            to={`/admin/leads/${deal.lead_id}`}
                            className="text-primary hover:underline"
                          >
                            View Lead
                          </Link>
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatPrice(deal.value_cents, deal.currency)}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={deal.stage}
                            onValueChange={(value: DealStage) => handleStageChange(deal.id, value)}
                          >
                            <SelectTrigger className="w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="proposal">Proposal</SelectItem>
                              <SelectItem value="negotiation">Negotiation</SelectItem>
                              <SelectItem value="closed_won">Won</SelectItem>
                              <SelectItem value="closed_lost">Lost</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {deal.expected_close 
                            ? format(new Date(deal.expected_close), 'MMM d, yyyy')
                            : '—'
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Closed Deals */}
        {closedDeals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-muted-foreground">
                Closed Deals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Deal</TableHead>
                    <TableHead>Lead</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Result</TableHead>
                    <TableHead>Closed At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {closedDeals.map(deal => {
                    const stageInfo = getDealStageInfo(deal.stage);
                    return (
                      <TableRow key={deal.id} className="opacity-70">
                        <TableCell className="font-medium">
                          {deal.product?.name || 'Custom deal'}
                        </TableCell>
                        <TableCell>
                          <Link 
                            to={`/admin/leads/${deal.lead_id}`}
                            className="text-primary hover:underline"
                          >
                            View Lead
                          </Link>
                        </TableCell>
                        <TableCell className="font-semibold">
                          {formatPrice(deal.value_cents, deal.currency)}
                        </TableCell>
                        <TableCell>
                          <Badge className={stageInfo.color}>
                            {stageInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {deal.closed_at 
                            ? format(new Date(deal.closed_at), 'MMM d, yyyy')
                            : '—'
                          }
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Create Deal Dialog - needs a lead picker */}
      <CreateDealDialogWithLeadPicker
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </AdminLayout>
  );
}

// Extended dialog that includes a lead picker
import { useLeads } from '@/hooks/useLeads';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useProducts } from '@/hooks/useProducts';
import { useCreateDeal } from '@/hooks/useDeals';
import { useForm } from 'react-hook-form';
import { useEffect } from 'react';

interface CreateDealDialogWithLeadPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormData {
  lead_id: string;
  product_id: string;
  value: number;
  expected_close: string;
  notes: string;
}

function CreateDealDialogWithLeadPicker({ open, onOpenChange }: CreateDealDialogWithLeadPickerProps) {
  const { data: leads = [] } = useLeads();
  const { data: products = [] } = useProducts();
  const createDeal = useCreateDeal();

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      lead_id: '',
      product_id: '',
      value: 0,
      expected_close: '',
      notes: '',
    },
  });

  const selectedProductId = watch('product_id');

  useEffect(() => {
    if (selectedProductId) {
      const product = products.find(p => p.id === selectedProductId);
      if (product) {
        setValue('value', product.price_cents / 100);
      }
    }
  }, [selectedProductId, products, setValue]);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const onSubmit = (data: FormData) => {
    createDeal.mutate({
      lead_id: data.lead_id,
      product_id: data.product_id || null,
      value_cents: Math.round(data.value * 100),
      expected_close: data.expected_close || null,
      notes: data.notes || null,
    }, {
      onSuccess: () => {
        onOpenChange(false);
      },
    });
  };

  // Filter leads that are active (not lost/customer)
  const availableLeads = leads.filter(l => l.status === 'lead' || l.status === 'opportunity');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogHeader>
            <DialogTitle>Create New Deal</DialogTitle>
            <DialogDescription>
              Add a new deal to your pipeline
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="lead_id">Lead *</Label>
              <Select
                value={watch('lead_id')}
                onValueChange={(value) => setValue('lead_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a lead" />
                </SelectTrigger>
                <SelectContent>
                  {availableLeads.map(lead => (
                    <SelectItem key={lead.id} value={lead.id}>
                      {lead.name || lead.email} {lead.company ? `(${lead.company})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableLeads.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No active leads available. Create a lead first.
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="product_id">Product</Label>
              <Select
                value={watch('product_id')}
                onValueChange={(value) => setValue('product_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a product (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {products.filter(p => p.is_active).map(product => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} - {formatPrice(product.price_cents, product.currency)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="value">Value (SEK)</Label>
              <Input
                id="value"
                type="number"
                step="0.01"
                min="0"
                {...register('value', { valueAsNumber: true })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="expected_close">Expected Close Date</Label>
              <Input
                id="expected_close"
                type="date"
                {...register('expected_close')}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                placeholder="Additional information..."
                {...register('notes')}
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createDeal.isPending || !watch('lead_id')}
            >
              {createDeal.isPending ? 'Creating...' : 'Create Deal'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
