import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Mail } from "lucide-react";

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
  isEditing?: boolean;
}

export function NewsletterBlockEditor({ data, onChange, isEditing }: NewsletterBlockEditorProps) {
  const update = (updates: Partial<NewsletterBlockData>) => {
    onChange({ ...data, ...updates });
  };

  // Preview mode
  if (!isEditing) {
    return (
      <div className="p-6 text-center border-2 border-dashed rounded-lg bg-muted/30">
        <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h3 className="font-medium text-lg">{data.title || "Subscribe to our newsletter"}</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          {data.description || "Get the latest updates delivered to your inbox."}
        </p>
        <div className="mt-4 flex justify-center gap-2 max-w-sm mx-auto">
          {data.showNameField && (
            <div className="h-9 w-24 rounded-md border bg-background" />
          )}
          <div className="h-9 flex-1 rounded-md border bg-background" />
          <div className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm flex items-center">
            {data.buttonText || "Subscribe"}
          </div>
        </div>
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
