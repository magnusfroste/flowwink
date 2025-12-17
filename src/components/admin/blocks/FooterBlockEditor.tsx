import { useState } from 'react';
import { DndContext, DragEndEvent, closestCenter } from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  GripVertical, 
  Phone, 
  Mail, 
  MapPin, 
  Clock, 
  Facebook, 
  Instagram, 
  Linkedin, 
  Twitter, 
  Youtube,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Building2,
  Link2,
  Scale,
} from 'lucide-react';
import { FooterBlockData, FooterSectionId, FooterLegalLink } from '@/types/cms';
import { useBlockEditor } from '@/hooks/useBlockEditor';

interface FooterBlockEditorProps {
  data: FooterBlockData;
  onChange: (data: FooterBlockData) => void;
}

// Sortable section item
function SortableSection({ 
  id, 
  label, 
  icon: Icon, 
  isVisible, 
  onToggle 
}: { 
  id: FooterSectionId; 
  label: string; 
  icon: React.ElementType;
  isVisible: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between p-3 bg-background border rounded-lg"
    >
      <div className="flex items-center gap-3">
        <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
        <Icon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{label}</span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onToggle}
        className={isVisible ? 'text-primary' : 'text-muted-foreground'}
      >
        {isVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </Button>
    </div>
  );
}

const sectionLabels: Record<FooterSectionId, { label: string; icon: React.ElementType }> = {
  brand: { label: 'Brand & Logo', icon: Building2 },
  quickLinks: { label: 'Quick Links', icon: Link2 },
  contact: { label: 'Contact Information', icon: Phone },
  hours: { label: 'Opening Hours', icon: Clock },
};

export function FooterBlockEditor({ data, onChange }: FooterBlockEditorProps) {
  const { 
    data: footerData, 
    updateField, 
    addArrayItem, 
    removeArrayItem, 
    updateArrayItem,
    dndSensors,
  } = useBlockEditor<FooterBlockData>({
    initialData: data,
    onChange,
  });

  const sectionOrder = footerData.sectionOrder || ['brand', 'quickLinks', 'contact', 'hours'];

  const handleSectionReorder = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sectionOrder.indexOf(active.id as FooterSectionId);
      const newIndex = sectionOrder.indexOf(over.id as FooterSectionId);
      const newOrder = arrayMove(sectionOrder, oldIndex, newIndex);
      updateField('sectionOrder', newOrder);
    }
  };

  const toggleSectionVisibility = (section: FooterSectionId) => {
    const visibilityKey = `show${section.charAt(0).toUpperCase()}${section.slice(1)}` as keyof FooterBlockData;
    updateField(visibilityKey, !(footerData[visibilityKey] ?? true));
  };

  const getSectionVisibility = (section: FooterSectionId): boolean => {
    switch (section) {
      case 'brand': return footerData.showBrand ?? true;
      case 'quickLinks': return footerData.showQuickLinks ?? true;
      case 'contact': return footerData.showContact ?? true;
      case 'hours': return footerData.showHours ?? true;
      default: return true;
    }
  };

  const addLegalLink = () => {
    const newLink: FooterLegalLink = {
      id: `link-${Date.now()}`,
      label: 'New Link',
      url: '/',
      enabled: true,
    };
    addArrayItem('legalLinks', newLink);
  };

  return (
    <Tabs defaultValue="layout" className="w-full">
      <TabsList className="grid w-full grid-cols-4">
        <TabsTrigger value="layout">Layout</TabsTrigger>
        <TabsTrigger value="contact">Contact</TabsTrigger>
        <TabsTrigger value="social">Social</TabsTrigger>
        <TabsTrigger value="legal">Legal Links</TabsTrigger>
      </TabsList>

      {/* Layout Tab */}
      <TabsContent value="layout" className="space-y-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Section Order & Visibility</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground mb-4">
              Drag sections to reorder. Click the eye icon to show/hide.
            </p>
            <DndContext
              sensors={dndSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSectionReorder}
            >
              <SortableContext items={sectionOrder} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {sectionOrder.map((sectionId) => {
                    const section = sectionLabels[sectionId];
                    return (
                      <SortableSection
                        key={sectionId}
                        id={sectionId}
                        label={section.label}
                        icon={section.icon}
                        isVisible={getSectionVisibility(sectionId)}
                        onToggle={() => toggleSectionVisibility(sectionId)}
                      />
                    );
                  })}
                </div>
              </SortableContext>
            </DndContext>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Contact Tab */}
      <TabsContent value="contact" className="space-y-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Phone className="h-4 w-4" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={footerData.phone || ''}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="+46 70 123 45 67"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={footerData.email || ''}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="info@example.com"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={footerData.address || ''}
                onChange={(e) => updateField('address', e.target.value)}
                placeholder="Street Address 123"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="postalCode">Postal Code & City</Label>
              <Input
                id="postalCode"
                value={footerData.postalCode || ''}
                onChange={(e) => updateField('postalCode', e.target.value)}
                placeholder="123 45 Stockholm"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Opening Hours
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="weekdayHours">Weekday Hours</Label>
              <Input
                id="weekdayHours"
                value={footerData.weekdayHours || ''}
                onChange={(e) => updateField('weekdayHours', e.target.value)}
                placeholder="08:00 - 17:00"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="weekendHours">Weekend Hours</Label>
              <Input
                id="weekendHours"
                value={footerData.weekendHours || ''}
                onChange={(e) => updateField('weekendHours', e.target.value)}
                placeholder="Closed"
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Social Tab */}
      <TabsContent value="social" className="space-y-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Social Media Links</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="facebook" className="flex items-center gap-2">
                <Facebook className="h-4 w-4" /> Facebook
              </Label>
              <Input
                id="facebook"
                value={footerData.facebook || ''}
                onChange={(e) => updateField('facebook', e.target.value)}
                placeholder="https://facebook.com/yourpage"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="instagram" className="flex items-center gap-2">
                <Instagram className="h-4 w-4" /> Instagram
              </Label>
              <Input
                id="instagram"
                value={footerData.instagram || ''}
                onChange={(e) => updateField('instagram', e.target.value)}
                placeholder="https://instagram.com/yourpage"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="linkedin" className="flex items-center gap-2">
                <Linkedin className="h-4 w-4" /> LinkedIn
              </Label>
              <Input
                id="linkedin"
                value={footerData.linkedin || ''}
                onChange={(e) => updateField('linkedin', e.target.value)}
                placeholder="https://linkedin.com/company/yourcompany"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="twitter" className="flex items-center gap-2">
                <Twitter className="h-4 w-4" /> Twitter / X
              </Label>
              <Input
                id="twitter"
                value={footerData.twitter || ''}
                onChange={(e) => updateField('twitter', e.target.value)}
                placeholder="https://twitter.com/yourhandle"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="youtube" className="flex items-center gap-2">
                <Youtube className="h-4 w-4" /> YouTube
              </Label>
              <Input
                id="youtube"
                value={footerData.youtube || ''}
                onChange={(e) => updateField('youtube', e.target.value)}
                placeholder="https://youtube.com/@yourchannel"
              />
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* Legal Links Tab */}
      <TabsContent value="legal" className="space-y-6 mt-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Scale className="h-4 w-4" />
              Legal Links
            </CardTitle>
            <Button variant="outline" size="sm" onClick={addLegalLink}>
              <Plus className="h-4 w-4 mr-2" />
              Add Link
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {(footerData.legalLinks || []).map((link, index) => (
              <div key={link.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <Input
                    value={link.label}
                    onChange={(e) => updateArrayItem('legalLinks', index, { ...link, label: e.target.value })}
                    placeholder="Link Label"
                  />
                  <Input
                    value={link.url}
                    onChange={(e) => updateArrayItem('legalLinks', index, { ...link, url: e.target.value })}
                    placeholder="/page-slug"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={link.enabled}
                    onCheckedChange={(checked) => updateArrayItem('legalLinks', index, { ...link, enabled: checked })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeArrayItem('legalLinks', index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {(!footerData.legalLinks || footerData.legalLinks.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">
                No legal links configured. Click "Add Link" to create one.
              </p>
            )}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
