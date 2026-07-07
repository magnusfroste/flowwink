import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Users, Send, Plus, Trash2, Eye, Edit2, Calendar, BarChart3, Link2, Download, Shield, Clock, Workflow, X } from "lucide-react";
import { logger } from "@/lib/logger";

import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageContainer } from "@/components/admin/AdminPageContainer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";

import { toast } from "sonner";
import { format } from "date-fns";
import { useIsResendConfigured } from "@/hooks/useIntegrationStatus";
import { IntegrationWarning } from "@/components/admin/IntegrationWarning";
import { NewsletterEditor } from "@/components/admin/NewsletterEditor";

interface Subscriber {
  id: string;
  email: string;
  name: string | null;
  status: string;
  created_at: string;
  confirmed_at: string | null;
}

interface Newsletter {
  id: string;
  subject: string;
  content_html: string | null;
  status: string;
  sent_at: string | null;
  scheduled_at: string | null;
  sent_count: number;
  unique_opens: number | null;
  open_count: number | null;
  unique_clicks: number | null;
  click_count: number | null;
  created_at: string;
}


interface EmailOpen {
  id: string;
  recipient_email: string;
  opened_at: string | null;
  opens_count: number;
  user_agent: string | null;
}

interface LinkClick {
  id: string;
  recipient_email: string;
  original_url: string;
  clicked_at: string | null;
  click_count: number;
}

export default function NewsletterPage() {
  const queryClient = useQueryClient();
  const [newNewsletter, setNewNewsletter] = useState({ subject: "", content_html: "" });
  const [editingNewsletter, setEditingNewsletter] = useState<Newsletter | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedNewsletterForStats, setSelectedNewsletterForStats] = useState<Newsletter | null>(null);
  const isResendConfigured = useIsResendConfigured();
  // Fetch subscribers
  const { data: subscribers = [], isLoading: loadingSubscribers } = useQuery({
    queryKey: ["newsletter-subscribers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newsletter_subscribers")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Subscriber[];
    },
  });

  // Fetch newsletters
  const { data: newsletters = [], isLoading: loadingNewsletters } = useQuery({
    queryKey: ["newsletters"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("newsletters")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Newsletter[];
    },
  });

  // Fetch email opens for selected newsletter
  const { data: emailOpens = [] } = useQuery({
    queryKey: ["newsletter-opens", selectedNewsletterForStats?.id],
    queryFn: async () => {
      if (!selectedNewsletterForStats) return [];
      const { data, error } = await supabase
        .from("newsletter_email_opens")
        .select("*")
        .eq("newsletter_id", selectedNewsletterForStats.id)
        .order("opened_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as EmailOpen[];
    },
    enabled: !!selectedNewsletterForStats,
  });

  // Fetch link clicks for selected newsletter
  const { data: linkClicks = [] } = useQuery({
    queryKey: ["newsletter-clicks", selectedNewsletterForStats?.id],
    queryFn: async () => {
      if (!selectedNewsletterForStats) return [];
      const { data, error } = await supabase
        .from("newsletter_link_clicks")
        .select("*")
        .eq("newsletter_id", selectedNewsletterForStats.id)
        .order("clicked_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data as LinkClick[];
    },
    enabled: !!selectedNewsletterForStats,
  });

  // Create newsletter
  const createMutation = useMutation({
    mutationFn: async (data: { subject: string; content_html: string }) => {
      const { error } = await supabase.from("newsletters").insert(data);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      setNewNewsletter({ subject: "", content_html: "" });
      setIsCreateOpen(false);
      toast.success("Newsletter created");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Update newsletter
  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; subject: string; content_html: string }) => {
      const { error } = await supabase
        .from("newsletters")
        .update({ subject: data.subject, content_html: data.content_html })
        .eq("id", data.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      setEditingNewsletter(null);
      toast.success("Newsletter updated");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete newsletter
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("newsletters").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      toast.success("Newsletter deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Send newsletter
  const sendMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const response = await supabase.functions.invoke("newsletter/send", {
        body: { newsletter_id: id },
      });

      if (response.error) throw response.error;
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      toast.success(`Newsletter sent to ${data.sent_count} subscribers`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Schedule newsletter
  const scheduleMutation = useMutation({
    mutationFn: async ({ id, scheduled_at }: { id: string; scheduled_at: string }) => {
      const { error } = await supabase
        .from("newsletters")
        .update({ status: "scheduled", scheduled_at })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      toast.success("Newsletter scheduled");
    },
    onError: (e: Error) => {
      logger.error("Schedule failed", e);
      toast.error(e.message);
    },
  });

  // Cancel schedule
  const cancelScheduleMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("newsletters")
        .update({ status: "draft", scheduled_at: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
      toast.success("Schedule cancelled");
    },
    onError: (e: Error) => toast.error(e.message),
  });


  const deleteSubscriberMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("newsletter_subscribers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletter-subscribers"] });
      toast.success("Subscriber removed");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Delete all subscribers (GDPR)
  const deleteAllSubscribersMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("newsletter_subscribers").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletter-subscribers"] });
      toast.success("All subscriber data deleted");
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Export subscribers
  const handleExportSubscribers = async (format: "csv" | "json") => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("Not authenticated");
        return;
      }

      const response = await supabase.functions.invoke("newsletter/export", {
        method: "GET",
      });

      if (response.error) throw response.error;

      // Create and download file
      const blob = format === "json" 
        ? new Blob([JSON.stringify(response.data, null, 2)], { type: "application/json" })
        : new Blob([response.data], { type: "text/csv" });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `subscribers_${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Exported ${subscribers.length} subscribers`);
    } catch (error: any) {
      toast.error(error.message || "Export failed");
    }
  };

  const confirmedCount = subscribers.filter((s) => s.status === "confirmed").length;
  const pendingCount = subscribers.filter((s) => s.status === "pending").length;

  const statusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return <Badge className="bg-green-500">Confirmed</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      case "unsubscribed":
        return <Badge variant="outline">Unsubscribed</Badge>;
      case "draft":
        return <Badge variant="secondary">Draft</Badge>;
      case "scheduled":
        return <Badge variant="outline" className="border-primary text-primary"><Clock className="h-3 w-3 mr-1" />Scheduled</Badge>;

      case "sent":
        return <Badge className="bg-green-500">Sent</Badge>;
      case "sending":
        return <Badge className="bg-blue-500">Sending...</Badge>;
      case "failed":
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AdminLayout>
      <AdminPageContainer>
        <AdminPageHeader
          title="Newsletter"
          description="Manage subscribers and send email campaigns"
        />

        {isResendConfigured === false && (
          <IntegrationWarning integration="resend" />
        )}

        {/* Stats */}
        <div className="grid sm:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Confirmed Subscribers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                <span className="text-2xl font-bold">{confirmedCount}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Confirmation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-yellow-500" />
                <span className="text-2xl font-bold">{pendingCount}</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Newsletters Sent
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Send className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">
                  {newsletters.filter((n) => n.status === "sent").length}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="newsletters" className="space-y-4">
          <TabsList>
            <TabsTrigger value="newsletters">Newsletters</TabsTrigger>
            <TabsTrigger value="subscribers">Subscribers</TabsTrigger>
            <TabsTrigger value="flows">Flows</TabsTrigger>
          </TabsList>


          {/* Newsletters Tab */}
          <TabsContent value="newsletters" className="space-y-4">
            <div className="flex justify-end">
              <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Newsletter
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Newsletter</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Subject</label>
                      <Input
                        value={newNewsletter.subject}
                        onChange={(e) =>
                          setNewNewsletter((prev) => ({ ...prev, subject: e.target.value }))
                        }
                        placeholder="Newsletter subject..."
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Content</label>
                      <NewsletterEditor
                        content={newNewsletter.content_html}
                        onChange={(html) =>
                          setNewNewsletter((prev) => ({ ...prev, content_html: html }))
                        }
                        placeholder="Write your newsletter content..."
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() => createMutation.mutate(newNewsletter)}
                      disabled={!newNewsletter.subject || createMutation.isPending}
                    >
                      {createMutation.isPending ? "Creating..." : "Create"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Open Rate</TableHead>
                    <TableHead>CTR</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingNewsletters ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : newsletters.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No newsletters yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    newsletters.map((newsletter) => {
                      const openRate = newsletter.sent_count > 0 && newsletter.unique_opens
                        ? Math.round((newsletter.unique_opens / newsletter.sent_count) * 100)
                        : 0;
                      const clickRate = newsletter.sent_count > 0 && newsletter.unique_clicks
                        ? Math.round((newsletter.unique_clicks / newsletter.sent_count) * 100)
                        : 0;
                      return (
                      <TableRow key={newsletter.id}>
                        <TableCell className="font-medium">
                          <div>{newsletter.subject}</div>
                          {newsletter.status === "scheduled" && newsletter.scheduled_at && (
                            <div className="text-xs text-muted-foreground font-normal mt-0.5 flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {format(new Date(newsletter.scheduled_at), "MMM d, yyyy 'at' HH:mm")}
                            </div>
                          )}
                        </TableCell>

                        <TableCell>{statusBadge(newsletter.status)}</TableCell>
                        <TableCell>
                          {newsletter.sent_count > 0 && (
                            <span className="text-sm text-muted-foreground">
                              {newsletter.sent_count} emails
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {newsletter.status === "sent" && newsletter.sent_count > 0 ? (
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <Progress value={openRate} className="h-2 w-12" />
                              <span className="text-sm text-muted-foreground">
                                {openRate}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {newsletter.status === "sent" && newsletter.sent_count > 0 ? (
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <Progress value={clickRate} className="h-2 w-12" />
                              <span className="text-sm text-muted-foreground">
                                {clickRate}%
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(newsletter.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {newsletter.status === "sent" && newsletter.sent_count > 0 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => setSelectedNewsletterForStats(newsletter)}
                                title="View open stats"
                              >
                                <BarChart3 className="h-4 w-4" />
                              </Button>
                            )}
                            {newsletter.status === "draft" && (
                              <>
                                <Dialog
                                  open={editingNewsletter?.id === newsletter.id}
                                  onOpenChange={(open) =>
                                    setEditingNewsletter(open ? newsletter : null)
                                  }
                                >
                                  <DialogTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                  </DialogTrigger>
                                  <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                                    <DialogHeader>
                                      <DialogTitle>Edit Newsletter</DialogTitle>
                                    </DialogHeader>
                                    {editingNewsletter && (
                                      <div className="space-y-4">
                                        <div>
                                          <label className="text-sm font-medium">Subject</label>
                                          <Input
                                            value={editingNewsletter.subject}
                                            onChange={(e) =>
                                              setEditingNewsletter((prev) =>
                                                prev ? { ...prev, subject: e.target.value } : null
                                              )
                                            }
                                          />
                                        </div>
                                        <div>
                                          <label className="text-sm font-medium">Content</label>
                                          <NewsletterEditor
                                            content={editingNewsletter.content_html || ""}
                                            onChange={(html) =>
                                              setEditingNewsletter((prev) =>
                                                prev
                                                  ? { ...prev, content_html: html }
                                                  : null
                                              )
                                            }
                                          />
                                        </div>
                                      </div>
                                    )}
                                    <DialogFooter>
                                      <Button
                                        onClick={() =>
                                          editingNewsletter &&
                                          updateMutation.mutate({
                                            id: editingNewsletter.id,
                                            subject: editingNewsletter.subject,
                                            content_html: editingNewsletter.content_html || "",
                                          })
                                        }
                                        disabled={updateMutation.isPending}
                                      >
                                        {updateMutation.isPending ? "Saving..." : "Save"}
                                      </Button>
                                    </DialogFooter>
                                  </DialogContent>
                                </Dialog>

                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button variant="default" size="sm">
                                      <Send className="h-4 w-4 mr-1" />
                                      Send
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Send Newsletter?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        This will send "{newsletter.subject}" to {confirmedCount}{" "}
                                        confirmed subscribers. This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction
                                        onClick={() => sendMutation.mutate(newsletter.id)}
                                        disabled={sendMutation.isPending}
                                      >
                                        {sendMutation.isPending ? "Sending..." : "Send Now"}
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>

                                <ScheduleDialog
                                  newsletter={newsletter}
                                  onSchedule={(iso) =>
                                    scheduleMutation.mutate({ id: newsletter.id, scheduled_at: iso })
                                  }
                                  pending={scheduleMutation.isPending}
                                />
                              </>
                            )}

                            {newsletter.status === "scheduled" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => cancelScheduleMutation.mutate(newsletter.id)}
                                disabled={cancelScheduleMutation.isPending}
                              >
                                <X className="h-4 w-4 mr-1" />
                                Cancel schedule
                              </Button>
                            )}


                            {newsletter.status !== "sent" && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete Newsletter?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This will permanently delete this newsletter.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteMutation.mutate(newsletter.id)}
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Subscribers Tab */}
          <TabsContent value="subscribers" className="space-y-4">
            {/* GDPR Actions */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Shield className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">GDPR Data Management</CardTitle>
                </div>
                <CardDescription>
                  Export or delete subscriber data to comply with GDPR requirements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  <Button
                    variant="outline"
                    onClick={() => handleExportSubscribers("csv")}
                    disabled={subscribers.length === 0}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export CSV
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleExportSubscribers("json")}
                    disabled={subscribers.length === 0}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export JSON
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="destructive"
                        disabled={subscribers.length === 0}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete All Data
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete All Subscriber Data?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete all {subscribers.length} subscribers and their data.
                          This action cannot be undone and is typically used for GDPR compliance.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => deleteAllSubscribersMutation.mutate()}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Delete All
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>

            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Subscribed</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingSubscribers ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : subscribers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No subscribers yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    subscribers.map((subscriber) => (
                      <TableRow key={subscriber.id}>
                        <TableCell className="font-medium">{subscriber.email}</TableCell>
                        <TableCell>{subscriber.name || "-"}</TableCell>
                        <TableCell>{statusBadge(subscriber.status)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(subscriber.created_at), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-right">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Subscriber?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will remove {subscriber.email} from your newsletter list.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteSubscriberMutation.mutate(subscriber.id)}
                                >
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* Flows Tab */}
          <TabsContent value="flows" className="space-y-4">
            <FlowsTab />
          </TabsContent>
        </Tabs>


        {/* Stats Dialog */}
        <Dialog 
          open={!!selectedNewsletterForStats} 
          onOpenChange={(open) => !open && setSelectedNewsletterForStats(null)}
        >
          <DialogContent className="sm:max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Statistics: {selectedNewsletterForStats?.subject}
              </DialogTitle>
            </DialogHeader>
            {selectedNewsletterForStats && (
              <div className="space-y-6">
                {/* Stats cards */}
                <div className="grid grid-cols-4 gap-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Sent
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <span className="text-2xl font-bold">
                        {selectedNewsletterForStats.sent_count}
                      </span>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Opens
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <span className="text-2xl font-bold text-green-600">
                        {selectedNewsletterForStats.unique_opens || 0}
                      </span>
                      <span className="text-sm text-muted-foreground ml-1">
                        ({selectedNewsletterForStats.sent_count > 0
                          ? Math.round(
                              ((selectedNewsletterForStats.unique_opens || 0) /
                                selectedNewsletterForStats.sent_count) *
                                100
                            )
                          : 0}%)
                      </span>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Clicks
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <span className="text-2xl font-bold text-blue-600">
                        {selectedNewsletterForStats.unique_clicks || 0}
                      </span>
                      <span className="text-sm text-muted-foreground ml-1">
                        ({selectedNewsletterForStats.sent_count > 0
                          ? Math.round(
                              ((selectedNewsletterForStats.unique_clicks || 0) /
                                selectedNewsletterForStats.sent_count) *
                                100
                            )
                          : 0}%)
                      </span>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Total Clicks
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <span className="text-2xl font-bold">
                        {selectedNewsletterForStats.click_count || 0}
                      </span>
                    </CardContent>
                  </Card>
                </div>

                <Tabs defaultValue="opens" className="w-full">
                  <TabsList>
                    <TabsTrigger value="opens" className="flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      Opens ({emailOpens.filter(o => o.opened_at).length})
                    </TabsTrigger>
                    <TabsTrigger value="clicks" className="flex items-center gap-1">
                      <Link2 className="h-4 w-4" />
                      Link Clicks ({linkClicks.filter(c => c.clicked_at).length})
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="opens" className="mt-4">
                    <div className="max-h-[250px] overflow-auto border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Opened</TableHead>
                            <TableHead>Opens</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {emailOpens.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center py-4 text-muted-foreground">
                                No opens recorded yet
                              </TableCell>
                            </TableRow>
                          ) : (
                            emailOpens.map((open) => (
                              <TableRow key={open.id}>
                                <TableCell className="font-medium">{open.recipient_email}</TableCell>
                                <TableCell>
                                  {open.opened_at ? (
                                    <span className="text-green-600">
                                      {format(new Date(open.opened_at), "MMM d, HH:mm")}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">Not opened</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {open.opens_count > 0 ? (
                                    <Badge variant="secondary">{open.opens_count}x</Badge>
                                  ) : (
                                    "-"
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>

                  <TabsContent value="clicks" className="mt-4">
                    <div className="max-h-[250px] overflow-auto border rounded-md">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Email</TableHead>
                            <TableHead>Link</TableHead>
                            <TableHead>Clicked</TableHead>
                            <TableHead>Clicks</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {linkClicks.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                                No link clicks recorded yet
                              </TableCell>
                            </TableRow>
                          ) : (
                            linkClicks.map((click) => (
                              <TableRow key={click.id}>
                                <TableCell className="font-medium">{click.recipient_email}</TableCell>
                                <TableCell>
                                  <a 
                                    href={click.original_url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:underline max-w-[200px] truncate block"
                                    title={click.original_url}
                                  >
                                    {new URL(click.original_url).pathname || click.original_url}
                                  </a>
                                </TableCell>
                                <TableCell>
                                  {click.clicked_at ? (
                                    <span className="text-green-600">
                                      {format(new Date(click.clicked_at), "MMM d, HH:mm")}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground">-</span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {click.click_count > 0 ? (
                                    <Badge variant="secondary">{click.click_count}x</Badge>
                                  ) : (
                                    "-"
                                  )}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AdminPageContainer>
    </AdminLayout>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Schedule dialog (draft newsletters)
// ─────────────────────────────────────────────────────────────────────────

function ScheduleDialog({
  newsletter,
  onSchedule,
  pending,
}: {
  newsletter: Newsletter;
  onSchedule: (isoUtc: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  // datetime-local default: 30 minutes from now, in the user's local time.
  const defaultLocal = () => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const [when, setWhen] = useState(defaultLocal);

  const localDate = when ? new Date(when) : null;
  const isFuture = !!localDate && !isNaN(localDate.getTime()) && localDate.getTime() > Date.now();

  const submit = () => {
    if (!isFuture || !localDate) {
      toast.error("Schedule time must be in the future");
      return;
    }
    onSchedule(localDate.toISOString());
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Calendar className="h-4 w-4 mr-1" />
          Schedule
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule "{newsletter.subject}"</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <label className="text-sm font-medium">Send at (your local time)</label>
          <Input
            type="datetime-local"
            value={when}
            onChange={(e) => setWhen(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            A background dispatcher checks every 5 minutes and sends any newsletters whose
            scheduled time has passed.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!isFuture || pending}>
            {pending ? "Scheduling…" : "Schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Flows tab — lead_nurture_sequence automations
// ─────────────────────────────────────────────────────────────────────────

interface Automation {
  id: string;
  name: string;
  trigger_type: string;
  trigger_config: any;
  skill_name: string;
  skill_arguments: any;
  enabled: boolean;
  executor: string;
  created_at: string;
}

const FLOW_PRESETS: Record<
  string,
  { label: string; name: string; trigger_type: "event" | "cron"; trigger_config: any; sequence_type: string; description: string }
> = {
  welcome: {
    label: "Welcome",
    name: "Welcome sequence",
    trigger_type: "event",
    trigger_config: { event: "lead.created" },
    sequence_type: "welcome",
    description: "Triggers on lead.created — introduces new subscribers to your brand.",
  },
  re_engage: {
    label: "Re-engage",
    name: "Re-engagement sequence",
    trigger_type: "cron",
    trigger_config: { schedule: "0 9 * * 1" },
    sequence_type: "re_engage",
    description: "Runs every Monday at 09:00 — wakes up cold subscribers.",
  },
  upsell: {
    label: "Upsell",
    name: "Post-purchase upsell",
    trigger_type: "event",
    trigger_config: { event: "order.completed" },
    sequence_type: "upsell",
    description: "Triggers on order.completed — offers related products.",
  },
};

function FlowsTab() {
  const qc = useQueryClient();
  const [newOpen, setNewOpen] = useState(false);
  const [preset, setPreset] = useState<keyof typeof FLOW_PRESETS>("welcome");

  const { data: flows = [], isLoading } = useQuery({
    queryKey: ["newsletter-flows"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_automations")
        .select("*")
        .eq("skill_name", "lead_nurture_sequence")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Automation[];
    },
  });

  const toggleEnabled = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("agent_automations")
        .update({ enabled })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["newsletter-flows"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createFlow = useMutation({
    mutationFn: async (presetKey: keyof typeof FLOW_PRESETS) => {
      const p = FLOW_PRESETS[presetKey];
      const { error } = await supabase.from("agent_automations").insert({
        name: p.name,
        trigger_type: p.trigger_type,
        trigger_config: p.trigger_config,
        skill_name: "lead_nurture_sequence",
        skill_arguments: { sequence_type: p.sequence_type },
        executor: "platform",
        enabled: false,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["newsletter-flows"] });
      setNewOpen(false);
      toast.success("Flow created (disabled — enable to activate)");
    },
    onError: (e: Error) => {
      logger.error("Create flow failed", e);
      toast.error(e.message);
    },
  });

  const deleteFlow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agent_automations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["newsletter-flows"] });
      toast.success("Flow removed");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const describeTrigger = (a: Automation): string => {
    if (a.trigger_type === "event") return `event: ${a.trigger_config?.event ?? "—"}`;
    if (a.trigger_type === "cron") return `cron: ${a.trigger_config?.schedule ?? "—"}`;
    return a.trigger_type;
  };

  return (
    <>
      <div className="flex justify-end">
        <Dialog open={newOpen} onOpenChange={setNewOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              New flow
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New automation flow</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Pick a preset. Flows are created disabled — review and enable them
                consciously.
              </p>
              <div className="space-y-2">
                {(Object.keys(FLOW_PRESETS) as Array<keyof typeof FLOW_PRESETS>).map((k) => {
                  const p = FLOW_PRESETS[k];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setPreset(k)}
                      className={`w-full text-left rounded-md border px-3 py-2 hover:bg-accent transition-colors ${
                        preset === k ? "border-primary bg-accent/50" : ""
                      }`}
                    >
                      <div className="font-medium text-sm">{p.label}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {p.description}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setNewOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createFlow.mutate(preset)}
                disabled={createFlow.isPending}
              >
                {createFlow.isPending ? "Creating…" : "Create flow"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Sequence</TableHead>
              <TableHead className="text-right">Enabled</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8">
                  Loading…
                </TableCell>
              </TableRow>
            ) : flows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  <Workflow className="h-6 w-6 mx-auto mb-2 opacity-60" />
                  No flows yet. Use "New flow" to add one.
                </TableCell>
              </TableRow>
            ) : (
              flows.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground font-mono">
                    {describeTrigger(f)}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {f.skill_arguments?.sequence_type ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Switch
                      checked={f.enabled}
                      onCheckedChange={(v) => toggleEnabled.mutate({ id: f.id, enabled: v })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteFlow.mutate(f.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
