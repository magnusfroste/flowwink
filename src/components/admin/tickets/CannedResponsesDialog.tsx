import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MessageSquareQuote, Pencil, Plus, X } from "lucide-react";
import {
  type CannedResponse,
  useCannedResponses,
  useCreateCannedResponse,
  useUpdateCannedResponse,
} from "@/hooks/useCannedResponses";

interface FormState {
  id?: string;
  title: string;
  shortcut: string;
  category: string;
  body_md: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  title: "",
  shortcut: "",
  category: "",
  body_md: "",
  is_active: true,
};

export function CannedResponsesDialog() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState(false);
  const { data: items = [], isLoading } = useCannedResponses();
  const create = useCreateCannedResponse();
  const update = useUpdateCannedResponse();

  const reset = () => {
    setForm(emptyForm);
    setEditing(false);
  };

  const startEdit = (r: CannedResponse) => {
    setForm({
      id: r.id,
      title: r.title,
      shortcut: r.shortcut ?? "",
      category: r.category ?? "",
      body_md: r.body_md,
      is_active: r.is_active,
    });
    setEditing(true);
  };

  const submit = () => {
    if (!form.title.trim() || !form.body_md.trim()) return;
    const payload = {
      title: form.title.trim(),
      shortcut: form.shortcut.trim() || null,
      category: form.category.trim() || null,
      body_md: form.body_md,
      is_active: form.is_active,
    };
    if (form.id) {
      update.mutate({ id: form.id, ...payload }, { onSuccess: reset });
    } else {
      create.mutate(payload, { onSuccess: reset });
    }
  };

  const toggleActive = (r: CannedResponse) => {
    update.mutate({ id: r.id, is_active: !r.is_active });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <MessageSquareQuote className="h-3.5 w-3.5" />
          Canned responses
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[720px] p-0 max-h-[85vh] flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>Canned responses</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 flex-1 min-h-0">
          {/* List */}
          <ScrollArea className="border-r px-6 py-4 max-h-[65vh]">
            {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
            {!isLoading && items.length === 0 && (
              <p className="text-xs text-muted-foreground">No canned responses yet.</p>
            )}
            <ul className="space-y-2">
              {items.map((r) => (
                <li
                  key={r.id}
                  className={`rounded-md border p-2 text-sm ${form.id === r.id ? "border-primary" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{r.title}</span>
                        {!r.is_active && (
                          <Badge variant="outline" className="text-[10px]">Inactive</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground flex gap-2 mt-0.5">
                        {r.category && <span>{r.category}</span>}
                        {r.shortcut && <code className="bg-muted px-1 rounded">/{r.shortcut}</code>}
                        <span>{r.usage_count} uses</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => startEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Switch checked={r.is_active} onCheckedChange={() => toggleActive(r)} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>

          {/* Form */}
          <div className="px-6 py-4 space-y-3 overflow-y-auto max-h-[65vh]">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-medium">
                {editing ? "Edit response" : "New response"}
              </h4>
              {editing && (
                <Button size="sm" variant="ghost" onClick={reset} className="h-7 gap-1">
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Title</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Refund confirmed"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Shortcut</Label>
                <Input
                  value={form.shortcut}
                  onChange={(e) => setForm({ ...form, shortcut: e.target.value })}
                  placeholder="refund"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Category</Label>
                <Input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="billing"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Body (markdown)</Label>
              <Textarea
                value={form.body_md}
                onChange={(e) => setForm({ ...form, body_md: e.target.value })}
                rows={8}
                className="text-sm resize-none"
                placeholder="Hi {{name}},&#10;&#10;Thanks for reaching out…"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                id="canned-active"
              />
              <Label htmlFor="canned-active" className="text-xs">Active</Label>
            </div>
            <Separator />
            <div className="flex justify-end">
              <Button
                size="sm"
                onClick={submit}
                disabled={!form.title.trim() || !form.body_md.trim() || create.isPending || update.isPending}
              >
                <Plus className="h-3.5 w-3.5 mr-1" />
                {editing ? "Save" : "Create"}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t">
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
