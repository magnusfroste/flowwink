import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from '@/components/ui/dialog';
import { useProjects, useCreateProject, useProjectMembers, useAddProjectMember, useRemoveProjectMember, type Project } from '@/hooks/useTimesheets';
import { Plus, FolderKanban, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

const COLORS = ['#6366f1', '#f43f5e', '#10b981', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];

function MembersDialog({ project, open, onClose }: { project: Project; open: boolean; onClose: () => void }) {
  const { data: members = [], isLoading } = useProjectMembers(open ? project.id : undefined);
  const addMember = useAddProjectMember();
  const removeMember = useRemoveProjectMember();
  const [selectedUserId, setSelectedUserId] = useState('');

  // Load all profiles for the dropdown
  const { data: profiles = [] } = useQuery({
    queryKey: ['all-profiles'],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, full_name, email').order('full_name');
      return data || [];
    },
  });

  const memberUserIds = new Set(members.map(m => m.user_id));
  const availableProfiles = profiles.filter(p => !memberUserIds.has(p.id));

  const handleAdd = async () => {
    if (!selectedUserId) return;
    await addMember.mutateAsync({ project_id: project.id, user_id: selectedUserId });
    setSelectedUserId('');
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: project.color }} />
            {project.name} — Members
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Add member */}
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
            >
              <option value="">Add team member…</option>
              {availableProfiles.map(p => (
                <option key={p.id} value={p.id}>
                  {p.full_name || p.email}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={!selectedUserId || addMember.isPending} onClick={handleAdd}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {/* Members list */}
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No members assigned. Add team members who should log time on this project.</p>
          ) : (
            <div className="divide-y">
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between py-2">
                  <div>
                    <span className="text-sm font-medium">{m.profiles?.full_name || m.profiles?.email || 'Unknown'}</span>
                    <span className="text-xs text-muted-foreground ml-2">{m.role}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => removeMember.mutate({ id: m.id, project_id: project.id })}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ProjectsTab() {
  const { data: projects = [], isLoading } = useProjects(false);
  const createProject = useCreateProject();
  const [open, setOpen] = useState(false);
  const [membersProject, setMembersProject] = useState<Project | null>(null);

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
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMembersProject(p)}>
                      <Users className="h-4 w-4" />
                    </Button>
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

      {/* Members dialog */}
      {membersProject && (
        <MembersDialog
          project={membersProject}
          open={!!membersProject}
          onClose={() => setMembersProject(null)}
        />
      )}

      {/* Create project dialog */}
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
