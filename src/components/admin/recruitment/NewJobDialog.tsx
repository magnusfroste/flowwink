import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateJobPosting } from '@/hooks/useRecruitment';
import { Plus } from 'lucide-react';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

export function NewJobDialog() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [department, setDepartment] = useState('');
  const [location, setLocation] = useState('');
  const [employmentType, setEmploymentType] = useState<'full_time' | 'part_time' | 'contractor' | 'internship'>(
    'full_time',
  );
  const [description, setDescription] = useState('');
  const create = useCreateJobPosting();

  const onTitleChange = (v: string) => {
    setTitle(v);
    if (!slug || slug === slugify(title)) setSlug(slugify(v));
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !slug) return;
    await create.mutateAsync({
      title,
      slug,
      department: department || undefined,
      location: location || undefined,
      employment_type: employmentType,
      description: description || undefined,
    });
    setOpen(false);
    setTitle('');
    setSlug('');
    setDepartment('');
    setLocation('');
    setDescription('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New job
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Open a new role</DialogTitle>
            <DialogDescription>Create a job posting. You can publish it later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Senior Frontend Engineer"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(slugify(e.target.value))}
                placeholder="senior-frontend-engineer"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="department">Department</Label>
                <Input id="department" value={department} onChange={(e) => setDepartment(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Remote / Stockholm" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="employment_type">Employment type</Label>
              <Select value={employmentType} onValueChange={(v) => setEmploymentType(v as typeof employmentType)}>
                <SelectTrigger id="employment_type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full-time</SelectItem>
                  <SelectItem value="part_time">Part-time</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                  <SelectItem value="internship">Internship</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (Markdown)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={5}
                placeholder="What you'll do, who you are, what we offer…"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
