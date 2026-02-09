import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Video, Calendar, Users } from "lucide-react";

interface WebinarBlockData {
  title?: string;
  description?: string;
  maxItems?: number;
  showPast?: boolean;
  variant?: "default" | "card" | "minimal";
}

interface WebinarBlockEditorProps {
  data: WebinarBlockData;
  onChange: (data: WebinarBlockData) => void;
  isEditing?: boolean;
}

export function WebinarBlockEditor({ data, onChange, isEditing }: WebinarBlockEditorProps) {
  const update = (updates: Partial<WebinarBlockData>) => {
    onChange({ ...data, ...updates });
  };

  if (!isEditing) {
    const title = data.title || 'Upcoming Webinars';
    const description = data.description || 'Join our live sessions and watch recordings';

    return (
      <div className="py-6 text-center">
        <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
          <Video className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-serif text-xl font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-4">{description}</p>
        <div className="max-w-md mx-auto space-y-3">
          <div className="rounded-lg border bg-card p-4 text-left">
            <div className="flex items-start gap-3">
              <div className="bg-primary/10 rounded-lg p-2 text-center w-12">
                <div className="text-[10px] font-medium text-primary uppercase">Mar</div>
                <div className="text-lg font-bold text-primary">15</div>
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm">Example Webinar</div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> 14:00 (60 min)</span>
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" /> 0 registered</span>
                </div>
              </div>
            </div>
          </div>
          {data.showPast && (
            <div className="text-xs text-muted-foreground">+ Past webinars with recordings</div>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Showing up to {data.maxItems || 5} webinars
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Variant</Label>
        <Select
          value={data.variant || "default"}
          onValueChange={(value: "default" | "card" | "minimal") => update({ variant: value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="default">Default</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="minimal">Minimal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={data.title || ""}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Upcoming Webinars"
        />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={data.description || ""}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Join our live sessions and watch recordings"
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Max Items</Label>
        <Input
          type="number"
          min={1}
          max={20}
          value={data.maxItems || 5}
          onChange={(e) => update({ maxItems: parseInt(e.target.value) || 5 })}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Show Past Webinars</Label>
        <Switch
          checked={data.showPast ?? true}
          onCheckedChange={(checked) => update({ showPast: checked })}
        />
      </div>
    </div>
  );
}
