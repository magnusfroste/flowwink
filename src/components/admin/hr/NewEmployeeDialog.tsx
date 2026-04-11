import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { useCreateEmployee } from "@/hooks/useEmployees";

export function NewEmployeeDialog() {
  const [open, setOpen] = useState(false);
  const create = useCreateEmployee();
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    title: "",
    department: "",
    employment_type: "full_time",
    start_date: "",
    notes: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    create.mutate(
      {
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        title: form.title || null,
        department: form.department || null,
        employment_type: form.employment_type,
        start_date: form.start_date || null,
        notes: form.notes || null,
      },
      {
        onSuccess: () => {
          setOpen(false);
          setForm({ name: "", email: "", phone: "", title: "", department: "", employment_type: "full_time", start_date: "", notes: "" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4 mr-2" /> Add Employee</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Employee</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><Label>Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
            <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Developer" /></div>
            <div><Label>Department</Label><Input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder="e.g. Engineering" /></div>
            <div>
              <Label>Type</Label>
              <Select value={form.employment_type} onValueChange={v => setForm(f => ({ ...f, employment_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_time">Full Time</SelectItem>
                  <SelectItem value="part_time">Part Time</SelectItem>
                  <SelectItem value="contractor">Contractor</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Start Date</Label><Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
          </div>
          <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Saving…" : "Add Employee"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
