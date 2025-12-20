import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

interface NewsletterBlockData {
  title?: string;
  description?: string;
  buttonText?: string;
  successMessage?: string;
  variant?: "default" | "card" | "minimal";
  showNameField?: boolean;
}

interface NewsletterBlockEditorProps {
  data: NewsletterBlockData;
  onChange: (data: NewsletterBlockData) => void;
}

export function NewsletterBlockEditor({ data, onChange }: NewsletterBlockEditorProps) {
  const update = (updates: Partial<NewsletterBlockData>) => {
    onChange({ ...data, ...updates });
  };

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
            <SelectItem value="default">Default (with background)</SelectItem>
            <SelectItem value="card">Card</SelectItem>
            <SelectItem value="minimal">Minimal (inline)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Title</Label>
        <Input
          value={data.title || ""}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="Subscribe to our newsletter"
        />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea
          value={data.description || ""}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Get the latest updates delivered to your inbox."
          rows={2}
        />
      </div>

      <div className="space-y-2">
        <Label>Button Text</Label>
        <Input
          value={data.buttonText || ""}
          onChange={(e) => update({ buttonText: e.target.value })}
          placeholder="Subscribe"
        />
      </div>

      <div className="space-y-2">
        <Label>Success Message</Label>
        <Textarea
          value={data.successMessage || ""}
          onChange={(e) => update({ successMessage: e.target.value })}
          placeholder="Thanks for subscribing! Please check your email to confirm."
          rows={2}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label>Show Name Field</Label>
        <Switch
          checked={data.showNameField || false}
          onCheckedChange={(checked) => update({ showNameField: checked })}
        />
      </div>
    </div>
  );
}
