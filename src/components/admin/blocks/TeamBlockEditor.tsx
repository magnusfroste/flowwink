import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Trash2, GripVertical, User, Linkedin, Twitter, Mail, Globe } from 'lucide-react';
import { TeamBlockData, TeamMember } from '@/types/cms';
import { ImagePickerField } from '../ImagePickerField';

interface TeamBlockEditorProps {
  data: TeamBlockData;
  onChange: (data: TeamBlockData) => void;
  isEditing: boolean;
}

export function TeamBlockEditor({ data, onChange, isEditing }: TeamBlockEditorProps) {
  const [expandedMember, setExpandedMember] = useState<string | null>(null);

  const members = data.members || [];
  const columns = data.columns || 3;
  const layout = data.layout || 'grid';
  const variant = data.variant || 'cards';
  const showBio = data.showBio ?? true;
  const showSocial = data.showSocial ?? true;

  const addMember = () => {
    const newMember: TeamMember = {
      id: `member-${Date.now()}`,
      name: 'New Team Member',
      role: 'Role',
      bio: '',
      photo: '',
      social: {},
    };
    onChange({ ...data, members: [...members, newMember] });
    setExpandedMember(newMember.id);
  };

  const updateMember = (id: string, updates: Partial<TeamMember>) => {
    onChange({
      ...data,
      members: members.map((m) => (m.id === id ? { ...m, ...updates } : m)),
    });
  };

  const removeMember = (id: string) => {
    onChange({ ...data, members: members.filter((m) => m.id !== id) });
  };

  if (!isEditing) {
    return (
      <div className="p-6 bg-muted/30 rounded-lg">
        <div className="text-center mb-6">
          {data.title && <h3 className="text-xl font-semibold">{data.title}</h3>}
          {data.subtitle && <p className="text-muted-foreground mt-1">{data.subtitle}</p>}
        </div>
        <div className={`grid gap-4 grid-cols-${columns}`}>
          {members.length === 0 ? (
            <p className="text-muted-foreground col-span-full text-center py-8">
              No team members added yet
            </p>
          ) : (
            members.map((member) => (
              <div key={member.id} className="p-4 bg-card rounded-lg border text-center">
                <div className="w-16 h-16 mx-auto rounded-full bg-muted flex items-center justify-center mb-3 overflow-hidden">
                  {member.photo ? (
                    <img src={member.photo} alt={member.name} className="w-full h-full object-cover" />
                  ) : (
                    <User className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <h4 className="font-medium">{member.name}</h4>
                <p className="text-sm text-muted-foreground">{member.role}</p>
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Meet Our Team"
          />
        </div>
        <div className="space-y-2">
          <Label>Subtitle</Label>
          <Input
            value={data.subtitle || ''}
            onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            placeholder="The people behind our success"
          />
        </div>
      </div>

      {/* Layout Settings */}
      <div className="grid grid-cols-4 gap-4">
        <div className="space-y-2">
          <Label>Columns</Label>
          <Select value={String(columns)} onValueChange={(v) => onChange({ ...data, columns: Number(v) as 2 | 3 | 4 })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2">2 Columns</SelectItem>
              <SelectItem value="3">3 Columns</SelectItem>
              <SelectItem value="4">4 Columns</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Layout</Label>
          <Select value={layout} onValueChange={(v) => onChange({ ...data, layout: v as 'grid' | 'carousel' })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="grid">Grid</SelectItem>
              <SelectItem value="carousel">Carousel</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Variant</Label>
          <Select value={variant} onValueChange={(v) => onChange({ ...data, variant: v as 'default' | 'cards' | 'compact' })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Default</SelectItem>
              <SelectItem value="cards">Cards</SelectItem>
              <SelectItem value="compact">Compact</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between">
            <Label>Show Bio</Label>
            <Switch checked={showBio} onCheckedChange={(v) => onChange({ ...data, showBio: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label>Show Social</Label>
            <Switch checked={showSocial} onCheckedChange={(v) => onChange({ ...data, showSocial: v })} />
          </div>
        </div>
      </div>

      {/* Team Members */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Team Members</Label>
          <Button variant="outline" size="sm" onClick={addMember}>
            <Plus className="h-4 w-4 mr-1" />
            Add Member
          </Button>
        </div>

        {members.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center border rounded-lg bg-muted/30">
            No team members yet. Click "Add Member" to get started.
          </p>
        )}

        <div className="space-y-2">
          {members.map((member, index) => (
            <Card key={member.id} className="overflow-hidden">
              <CardHeader
                className="p-3 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => setExpandedMember(expandedMember === member.id ? null : member.id)}
              >
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                    {member.photo ? (
                      <img src={member.photo} alt={member.name} className="w-full h-full object-cover" />
                    ) : (
                      <User className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-sm font-medium">{member.name}</CardTitle>
                    <p className="text-xs text-muted-foreground truncate">{member.role}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeMember(member.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              {expandedMember === member.id && (
                <CardContent className="p-4 pt-0 space-y-4 border-t">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input
                        value={member.name}
                        onChange={(e) => updateMember(member.id, { name: e.target.value })}
                        placeholder="John Doe"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Role</Label>
                      <Input
                        value={member.role}
                        onChange={(e) => updateMember(member.id, { role: e.target.value })}
                        placeholder="CEO & Founder"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Photo</Label>
                    <ImagePickerField
                      value={member.photo || ''}
                      onChange={(url) => updateMember(member.id, { photo: url })}
                      placeholder="Team member photo URL"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Bio</Label>
                    <Textarea
                      value={member.bio || ''}
                      onChange={(e) => updateMember(member.id, { bio: e.target.value })}
                      placeholder="A short biography..."
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Social Links</Label>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center gap-2">
                        <Linkedin className="h-4 w-4 text-muted-foreground" />
                        <Input
                          value={member.social?.linkedin || ''}
                          onChange={(e) =>
                            updateMember(member.id, {
                              social: { ...member.social, linkedin: e.target.value },
                            })
                          }
                          placeholder="LinkedIn URL"
                          className="h-9"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Twitter className="h-4 w-4 text-muted-foreground" />
                        <Input
                          value={member.social?.twitter || ''}
                          onChange={(e) =>
                            updateMember(member.id, {
                              social: { ...member.social, twitter: e.target.value },
                            })
                          }
                          placeholder="Twitter/X URL"
                          className="h-9"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-4 w-4 text-muted-foreground" />
                        <Input
                          value={member.social?.email || ''}
                          onChange={(e) =>
                            updateMember(member.id, {
                              social: { ...member.social, email: e.target.value },
                            })
                          }
                          placeholder="Email address"
                          className="h-9"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <Input
                          value={member.social?.website || ''}
                          onChange={(e) =>
                            updateMember(member.id, {
                              social: { ...member.social, website: e.target.value },
                            })
                          }
                          placeholder="Website URL"
                          className="h-9"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
