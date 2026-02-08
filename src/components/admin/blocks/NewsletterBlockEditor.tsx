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

  // Preview mode — match public NewsletterBlock
  if (!isEditing) {
    const variant = data.variant || 'default';
    const title = data.title || 'Subscribe to our newsletter';
    const description = data.description || 'Get the latest updates delivered to your inbox.';
    const buttonText = data.buttonText || 'Subscribe';

    const formMockup = (
      <div className="space-y-3 max-w-md mx-auto">
        {data.showNameField && (
          <div className="h-10 rounded-md border border-input bg-background px-3 flex items-center">
            <span className="text-sm text-muted-foreground">Your name (optional)</span>
          </div>
        )}
        <div className="flex gap-2">
          <div className="h-10 flex-1 rounded-md border border-input bg-background px-3 flex items-center">
            <span className="text-sm text-muted-foreground">Enter your email</span>
          </div>
          <div className="h-10 px-5 rounded-md bg-primary text-primary-foreground text-sm font-medium flex items-center">
            {buttonText}
          </div>
        </div>
      </div>
    );

    if (variant === 'card') {
      return (
        <div className="py-6">
          <div className="max-w-lg mx-auto rounded-lg border bg-card p-6 text-center">
            <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-accent/50 flex items-center justify-center">
              <Mail className="h-6 w-6 text-accent-foreground" />
            </div>
            <h3 className="font-serif text-xl font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-4">{description}</p>
            {formMockup}
          </div>
        </div>
      );
    }

    if (variant === 'minimal') {
      return (
        <div className="py-6 max-w-lg mx-auto text-center">
          <h3 className="font-serif text-xl font-semibold">{title}</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">{description}</p>
          {formMockup}
        </div>
      );
    }

    // Default variant
    return (
      <div className="py-6 bg-muted/30 rounded-lg text-center px-6">
        <h3 className="font-serif text-2xl font-bold">{title}</h3>
        <p className="text-sm text-muted-foreground mt-1 mb-5 max-w-md mx-auto">{description}</p>
        {formMockup}
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
