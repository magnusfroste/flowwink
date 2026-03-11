import { useState, useRef } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Plus,
  Pencil,
  Trash2,
  Users,
  Search,
  FileUser,
  Upload,
  Loader2,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

/**
 * Extract text from a PDF ArrayBuffer using pdf.js CDN.
 */
async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  try {
    // Dynamically load pdf.js from CDN
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjsLib = await (Function('return import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs")')() as Promise<any>);
    pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";
    
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const pages: string[] = [];
    
    for (let i = 1; i <= Math.min(pdf.numPages, 30); i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const text = content.items
        .map((item: { str?: string }) => item.str || "")
        .join(" ");
      pages.push(text);
    }
    
    return pages.join("\n\n");
  } catch (err) {
    console.warn("pdf.js failed, trying basic extraction:", err);
    // Basic fallback: extract readable strings from binary
    const bytes = new Uint8Array(arrayBuffer);
    const decoder = new TextDecoder("utf-8", { fatal: false });
    const raw = decoder.decode(bytes);
    const matches = raw.match(/\(([^)]+)\)/g);
    if (matches) {
      return matches.map(m => m.slice(1, -1)).join(" ");
    }
    return "";
  }
}

type ConsultantProfile = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  skills: string[];
  experience_years: number | null;
  summary: string | null;
  bio: string | null;
  availability: string | null;
  is_active: boolean;
  hourly_rate_cents: number | null;
  currency: string;
  languages: string[] | null;
  certifications: string[] | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileFormData = {
  name: string;
  title: string;
  email: string;
  phone: string;
  skills: string;
  experience_years: number;
  summary: string;
  bio: string;
  availability: string;
  is_active: boolean;
  hourly_rate_cents: number;
  currency: string;
  languages: string;
  certifications: string;
  linkedin_url: string;
  portfolio_url: string;
};

const emptyForm: ProfileFormData = {
  name: "",
  title: "",
  email: "",
  phone: "",
  skills: "",
  experience_years: 0,
  summary: "",
  bio: "",
  availability: "available",
  is_active: true,
  hourly_rate_cents: 0,
  currency: "SEK",
  languages: "",
  certifications: "",
  linkedin_url: "",
  portfolio_url: "",
};

function profileToForm(p: ConsultantProfile): ProfileFormData {
  return {
    name: p.name,
    title: p.title || "",
    email: p.email || "",
    phone: p.phone || "",
    skills: (p.skills || []).join(", "),
    experience_years: p.experience_years || 0,
    summary: p.summary || "",
    bio: p.bio || "",
    availability: p.availability || "available",
    is_active: p.is_active,
    hourly_rate_cents: p.hourly_rate_cents || 0,
    currency: p.currency || "SEK",
    languages: (p.languages || []).join(", "),
    certifications: (p.certifications || []).join(", "),
    linkedin_url: p.linkedin_url || "",
    portfolio_url: p.portfolio_url || "",
  };
}

function formToPayload(form: ProfileFormData) {
  return {
    name: form.name,
    title: form.title || null,
    email: form.email || null,
    phone: form.phone || null,
    skills: form.skills.split(",").map(s => s.trim()).filter(Boolean),
    experience_years: form.experience_years,
    summary: form.summary || null,
    bio: form.bio || null,
    availability: form.availability,
    is_active: form.is_active,
    hourly_rate_cents: form.hourly_rate_cents || null,
    currency: form.currency,
    languages: form.languages.split(",").map(s => s.trim()).filter(Boolean),
    certifications: form.certifications.split(",").map(s => s.trim()).filter(Boolean),
    linkedin_url: form.linkedin_url || null,
    portfolio_url: form.portfolio_url || null,
  };
}

function useConsultantProfiles() {
  return useQuery({
    queryKey: ["consultant-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consultant_profiles")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as ConsultantProfile[];
    },
  });
}

export default function ConsultantProfilesPage() {
  const { data: profiles = [], isLoading } = useConsultantProfiles();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ProfileFormData>(emptyForm);
  const [isParsing, setIsParsing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const saveMutation = useMutation({
    mutationFn: async (data: { id?: string; payload: ReturnType<typeof formToPayload> }) => {
      if (data.id) {
        const { error } = await supabase
          .from("consultant_profiles")
          .update(data.payload)
          .eq("id", data.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("consultant_profiles")
          .insert(data.payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultant-profiles"] });
      toast({ title: "Saved", description: "Consultant profile updated." });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Error", description: "Could not save profile.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("consultant_profiles")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consultant-profiles"] });
      toast({ title: "Deleted", description: "Profile removed." });
      setDeleteId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Could not delete profile.", variant: "destructive" });
    },
  });

  const handlePdfImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Reset input so same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      toast({ title: "Invalid file", description: "Please select a PDF file.", variant: "destructive" });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "File too large", description: "Maximum file size is 10 MB.", variant: "destructive" });
      return;
    }

    setIsParsing(true);
    try {
      // Extract text from PDF using browser
      const arrayBuffer = await file.arrayBuffer();
      const text = await extractTextFromPdf(arrayBuffer);

      if (!text || text.length < 20) {
        toast({ title: "Could not read PDF", description: "The PDF appears to be empty or image-only. Try a text-based resume.", variant: "destructive" });
        return;
      }

      // Send to AI for structured extraction
      const { data, error } = await supabase.functions.invoke("parse-resume", {
        body: { resume_text: text },
      });

      if (error || !data?.success) {
        toast({ title: "Parsing failed", description: data?.error || "Could not parse the resume.", variant: "destructive" });
        return;
      }

      const p = data.profile;
      setEditingId(null);
      setForm({
        name: p.name || "",
        title: p.title || "",
        email: p.email || "",
        phone: p.phone || "",
        skills: (p.skills || []).join(", "),
        experience_years: p.experience_years || 0,
        summary: p.summary || "",
        bio: p.bio || "",
        availability: "available",
        is_active: true,
        hourly_rate_cents: 0,
        currency: "SEK",
        languages: (p.languages || []).join(", "),
        certifications: (p.certifications || []).join(", "),
        linkedin_url: p.linkedin_url || "",
        portfolio_url: p.portfolio_url || "",
      });
      setDialogOpen(true);
      toast({ title: "Resume parsed", description: `Extracted profile for ${p.name || "consultant"}. Review and save.` });
    } catch (err) {
      console.error("PDF import error:", err);
      toast({ title: "Import failed", description: "An error occurred while processing the PDF.", variant: "destructive" });
    } finally {
      setIsParsing(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (profile: ConsultantProfile) => {
    setEditingId(profile.id);
    setForm(profileToForm(profile));
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    saveMutation.mutate({
      id: editingId || undefined,
      payload: formToPayload(form),
    });
  };

  const filtered = profiles.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.title || "").toLowerCase().includes(search.toLowerCase()) ||
    p.skills.some(s => s.toLowerCase().includes(search.toLowerCase()))
  );

  const activeCount = profiles.filter(p => p.is_active).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <AdminPageHeader
          title="Consultant Profiles"
          description="Manage consultants for AI-powered resume matching and cover letter generation."
        >
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handlePdfImport}
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isParsing}
            >
              {isParsing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Upload className="h-4 w-4 mr-2" />
              )}
              {isParsing ? "Parsing..." : "Import PDF"}
            </Button>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Add Consultant
            </Button>
          </div>
        </AdminPageHeader>

        {/* Summary */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{profiles.length}</p>
                  <p className="text-sm text-muted-foreground">Total profiles</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileUser className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{activeCount}</p>
                  <p className="text-sm text-muted-foreground">Active</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center">
                  <FileUser className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{profiles.length - activeCount}</p>
                  <p className="text-sm text-muted-foreground">Inactive</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, title, or skill..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {profiles.length === 0
                ? "No consultant profiles yet. Add your first consultant to get started."
                : "No profiles match your search."}
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Consultant</TableHead>
                  <TableHead className="hidden md:table-cell">Skills</TableHead>
                  <TableHead className="hidden sm:table-cell">Experience</TableHead>
                  <TableHead className="hidden lg:table-cell">Availability</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((profile) => (
                  <TableRow key={profile.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarImage src={profile.avatar_url || undefined} />
                          <AvatarFallback className="text-xs">
                            {profile.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium text-sm">{profile.name}</p>
                          {profile.title && (
                            <p className="text-xs text-muted-foreground">{profile.title}</p>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="flex flex-wrap gap-1 max-w-[250px]">
                        {profile.skills.slice(0, 4).map((skill) => (
                          <Badge key={skill} variant="secondary" className="text-[10px] px-1.5 py-0">
                            {skill}
                          </Badge>
                        ))}
                        {profile.skills.length > 4 && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            +{profile.skills.length - 4}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                      {profile.experience_years ? `${profile.experience_years} yr` : "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge
                        variant={profile.availability === "available" ? "default" : "secondary"}
                        className="text-xs capitalize"
                      >
                        {profile.availability || "unknown"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={profile.is_active ? "default" : "outline"}
                        className={`text-xs ${profile.is_active ? "bg-green-600" : ""}`}
                      >
                        {profile.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openEdit(profile)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(profile.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Consultant" : "New Consultant"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Full name"
                />
              </div>
              <div className="space-y-2">
                <Label>Title</Label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Senior Developer"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Skills (comma-separated)</Label>
              <Input
                value={form.skills}
                onChange={(e) => setForm({ ...form, skills: e.target.value })}
                placeholder="React, TypeScript, Node.js, AWS"
              />
            </div>

            <div className="space-y-2">
              <Label>Summary</Label>
              <Textarea
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="Brief professional summary..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Bio</Label>
              <Textarea
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="Detailed biography..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Experience (years)</Label>
                <Input
                  type="number"
                  value={form.experience_years}
                  onChange={(e) => setForm({ ...form, experience_years: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Hourly rate (cents)</Label>
                <Input
                  type="number"
                  value={form.hourly_rate_cents}
                  onChange={(e) => setForm({ ...form, hourly_rate_cents: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="space-y-2">
                <Label>Currency</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEK">SEK</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="NOK">NOK</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Availability</Label>
                <Select value={form.availability} onValueChange={(v) => setForm({ ...form, availability: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="partially_available">Partially Available</SelectItem>
                    <SelectItem value="unavailable">Unavailable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 flex items-end gap-3 pb-1">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={form.is_active}
                    onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                  />
                  <Label>Active</Label>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Languages (comma-separated)</Label>
              <Input
                value={form.languages}
                onChange={(e) => setForm({ ...form, languages: e.target.value })}
                placeholder="Swedish, English"
              />
            </div>

            <div className="space-y-2">
              <Label>Certifications (comma-separated)</Label>
              <Input
                value={form.certifications}
                onChange={(e) => setForm({ ...form, certifications: e.target.value })}
                placeholder="AWS Solutions Architect, PMP"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>LinkedIn URL</Label>
                <Input
                  value={form.linkedin_url}
                  onChange={(e) => setForm({ ...form, linkedin_url: e.target.value })}
                  placeholder="https://linkedin.com/in/..."
                />
              </div>
              <div className="space-y-2">
                <Label>Portfolio URL</Label>
                <Input
                  value={form.portfolio_url}
                  onChange={(e) => setForm({ ...form, portfolio_url: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancel</Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending || !form.name.trim()}>
              {saveMutation.isPending ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete consultant profile?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this profile from the matching system. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
}
