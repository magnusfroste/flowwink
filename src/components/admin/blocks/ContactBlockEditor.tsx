import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { ContactBlockData } from '@/types/cms';
import { Phone, Mail, MapPin, Clock, Plus, X } from 'lucide-react';

interface ContactBlockEditorProps {
  data: ContactBlockData;
  onChange: (data: ContactBlockData) => void;
  isEditing: boolean;
}

export function ContactBlockEditor({ data, onChange, isEditing }: ContactBlockEditorProps) {
  const [localData, setLocalData] = useState<ContactBlockData>(data);

  const handleChange = (updates: Partial<ContactBlockData>) => {
    const newData = { ...localData, ...updates };
    setLocalData(newData);
    onChange(newData);
  };

  const addHours = () => {
    handleChange({
      hours: [...(localData.hours || []), { day: '', time: '' }],
    });
  };

  const updateHours = (index: number, field: 'day' | 'time', value: string) => {
    const newHours = [...(localData.hours || [])];
    newHours[index] = { ...newHours[index], [field]: value };
    handleChange({ hours: newHours });
  };

  const removeHours = (index: number) => {
    handleChange({
      hours: (localData.hours || []).filter((_, i) => i !== index),
    });
  };

  if (isEditing) {
    return (
      <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
        <div className="space-y-2">
          <Label htmlFor="contact-title">Title</Label>
          <Input
            id="contact-title"
            value={localData.title || ''}
            onChange={(e) => handleChange({ title: e.target.value })}
            placeholder="Contact us"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="contact-phone">Phone</Label>
            <Input
              id="contact-phone"
              value={localData.phone || ''}
              onChange={(e) => handleChange({ phone: e.target.value })}
              placeholder="+1 234 567 890"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-email">Email</Label>
            <Input
              id="contact-email"
              value={localData.email || ''}
              onChange={(e) => handleChange({ email: e.target.value })}
              placeholder="info@example.com"
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-address">Address</Label>
          <Input
            id="contact-address"
            value={localData.address || ''}
            onChange={(e) => handleChange({ address: e.target.value })}
            placeholder="123 Main Street, City, Country"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Opening hours</Label>
            <Button type="button" variant="outline" size="sm" onClick={addHours}>
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </div>
          {(localData.hours || []).map((hour, index) => (
            <div key={index} className="flex gap-2">
              <Input
                value={hour.day}
                onChange={(e) => updateHours(index, 'day', e.target.value)}
                placeholder="Monday-Friday"
                className="flex-1"
              />
              <Input
                value={hour.time}
                onChange={(e) => updateHours(index, 'time', e.target.value)}
                placeholder="08:00-17:00"
                className="flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeHours(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Preview mode
  return (
    <div className="rounded-lg border bg-card p-6">
      <h3 className="text-xl font-bold mb-4">{localData.title || 'Kontakt'}</h3>
      <div className="grid gap-3 text-sm">
        {localData.phone && (
          <div className="flex items-center gap-3">
            <Phone className="h-4 w-4 text-primary" />
            <span>{localData.phone}</span>
          </div>
        )}
        {localData.email && (
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-primary" />
            <span>{localData.email}</span>
          </div>
        )}
        {localData.address && (
          <div className="flex items-center gap-3">
            <MapPin className="h-4 w-4 text-primary" />
            <span>{localData.address}</span>
          </div>
        )}
        {localData.hours && localData.hours.length > 0 && (
          <div className="flex items-start gap-3">
            <Clock className="h-4 w-4 text-primary mt-0.5" />
            <div className="space-y-1">
              {localData.hours.map((hour, index) => (
                <div key={index}>
                  <span className="font-medium">{hour.day}:</span> {hour.time}
                </div>
              ))}
            </div>
          </div>
        )}
        {!localData.phone && !localData.email && !localData.address && (
          <p className="text-muted-foreground">Add contact information</p>
        )}
      </div>
    </div>
  );
}
