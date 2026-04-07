import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useProjects, useCreateProject } from '@/hooks/useTimesheets';
import { Plus, FolderKanban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const COLORS = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

export function ProjectsTab() {
  const { data: projects = [], isLoading } = useProjects(false);
  const createProject = useCreateProject();
  const [open, setOpen] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [rate, setRate] = useState('');
  const [isBillable, setIsBillable] = useState(true);

  const handleCreate = async () => {
    await createProject.mutateAsync({
      name,
      client_name: clientName || undefined,
      color,
      hourly_rate_cents: Math.round(parseFloat(rate || '0') * 100),
      is_billable: isBillable,
    } as any);
    setOpen(false);
    setName('');
    setClientName('');
    setRate('');
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Projects
          </CardTitle>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Project
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : projects.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No projects yet. Create one to start tracking time.</p>
          ) : (
            <div className="divide-y">
              {projects.map((p) => (
                <div key={p.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: p.color }} />
                    <div>
                      <span className="font-medium text-sm">{p.name}</span>
                      {p.client_name && (
                        <span className="text-xs text-muted-foreground ml-2">— {p.client_name}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.is_billable && p.hourly_rate_cents > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {(p.hourly_rate_cents / 100).toFixed(0)} {p.currency}/h
                      </Badge>
                    )}
                    {!p.is_active && (
                      <Badge variant="outline" className="text-xs">Inactive</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Project Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Website Redesign" />
            </div>
            <div className="space-y-1.5">
              <Label>Client</Label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Acme Corp" />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex gap-2">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${color === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setColor(c)}
                  />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Hourly Rate (SEK)</Label>
                <Input type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0" />
              </div>
              <div className="flex items-end pb-1 gap-2">
                <Switch checked={isBillable} onCheckedChange={setIsBillable} id="billable" />
                <Label htmlFor="billable" className="cursor-pointer">Billable</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
            <Button onClick={handleCreate} disabled={!name.trim() || createProject.isPending}>
              {createProject.isPending ? 'Creating…' : 'Create Project'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
