import { Briefcase, MapPin } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import type { JobListingsBlockData } from '@/components/public/blocks/JobListingsBlock';

interface Props {
  data: JobListingsBlockData;
  onChange: (data: JobListingsBlockData) => void;
  isEditing?: boolean;
}

/** The job-listings block: open roles from the recruitment module, on any page. */
export function JobListingsBlockEditor({ data, onChange, isEditing }: Props) {
  const update = (u: Partial<JobListingsBlockData>) => onChange({ ...data, ...u });

  if (!isEditing) {
    return (
      <div className="py-6">
        {data.title && <h3 className="font-serif text-xl font-semibold">{data.title}</h3>}
        {data.intro && <p className="mt-1 mb-4 text-sm text-muted-foreground">{data.intro}</p>}
        <div className="space-y-3">
          {['Fibre technician', 'Project manager'].map((role) => (
            <div key={role} className="rounded-lg border bg-card p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{role}</span>
                <span className="rounded bg-secondary px-2 py-0.5 text-xs">Full-time</span>
              </div>
              <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> Stockholm</div>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-center gap-1 text-xs text-muted-foreground">
          <Briefcase className="h-3 w-3" /> The site shows the roles published under Recruitment{data.department ? ` in ${data.department}` : ''}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Heading</Label>
        <Input value={data.title ?? ''} onChange={(e) => update({ title: e.target.value })} placeholder="Join the team" />
      </div>
      <div className="space-y-2">
        <Label>Intro</Label>
        <Textarea rows={2} value={data.intro ?? ''} onChange={(e) => update({ intro: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Only this department</Label>
          <Input value={data.department ?? ''} onChange={(e) => update({ department: e.target.value })} placeholder="All departments" />
        </div>
        <div className="space-y-2">
          <Label>Show at most</Label>
          <Input type="number" min={0} value={data.maxItems ?? ''} onChange={(e) => update({ maxItems: e.target.value ? Number(e.target.value) : undefined })} placeholder="All" />
        </div>
      </div>
      <div className="flex items-center justify-between">
        <Label>Department and location filters</Label>
        <Switch checked={data.showFilters !== false} onCheckedChange={(v) => update({ showFilters: v })} />
      </div>
      <p className="text-xs text-muted-foreground">Roles are written and published under Admin → Recruitment; each links to its page with the application form.</p>
    </div>
  );
}
