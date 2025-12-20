import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Users, Send, Plus, Trash2, Eye, Edit2, Calendar, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { format } from "date-fns";

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
  sent_count: number;
  unique_opens: number | null;
  open_count: number | null;
  created_at: string;
}

interface EmailOpen {
  id: string;
  recipient_email: string;
  opened_at: string | null;
  opens_count: number;
  user_agent: string | null;
}

export default function NewsletterPage() {
  const queryClient = useQueryClient();
  const [newNewsletter, setNewNewsletter] = useState({ subject: "", content_html: "" });
  const [editingNewsletter, setEditingNewsletter] = useState<Newsletter | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedNewsletterForStats, setSelectedNewsletterForStats] = useState<Newsletter | null>(null);

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

  // Create newsletter
  const createMutation = useMutation({
    mutationFn: async (data: { subject: string; content_html: string }) => {
      const { error } = await supabase.from("newsletters").insert(data);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["newsletters"] });
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

      const response = await supabase.functions.invoke("newsletter-send", {
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

  // Delete subscriber
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
      <div className="space-y-8">
        <AdminPageHeader
          title="Newsletter"
          description="Manage subscribers and send email campaigns"
        />

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
                <DialogContent className="sm:max-w-lg">
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
                      <label className="text-sm font-medium">Content (HTML)</label>
                      <Textarea
                        value={newNewsletter.content_html}
                        onChange={(e) =>
                          setNewNewsletter((prev) => ({ ...prev, content_html: e.target.value }))
                        }
                        placeholder="<h1>Hello!</h1><p>Newsletter content...</p>"
                        className="min-h-[200px] font-mono text-sm"
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
                    <TableHead>Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingNewsletters ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : newsletters.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No newsletters yet
                      </TableCell>
                    </TableRow>
                  ) : (
                    newsletters.map((newsletter) => {
                      const openRate = newsletter.sent_count > 0 && newsletter.unique_opens
                        ? Math.round((newsletter.unique_opens / newsletter.sent_count) * 100)
                        : 0;
                      return (
                      <TableRow key={newsletter.id}>
                        <TableCell className="font-medium">{newsletter.subject}</TableCell>
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
                            <div className="flex items-center gap-2 min-w-[120px]">
                              <Progress value={openRate} className="h-2 w-16" />
                              <span className="text-sm text-muted-foreground">
                                {openRate}% ({newsletter.unique_opens || 0})
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
                                  <DialogContent className="sm:max-w-lg">
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
                                          <label className="text-sm font-medium">Content (HTML)</label>
                                          <Textarea
                                            value={editingNewsletter.content_html || ""}
                                            onChange={(e) =>
                                              setEditingNewsletter((prev) =>
                                                prev
                                                  ? { ...prev, content_html: e.target.value }
                                                  : null
                                              )
                                            }
                                            className="min-h-[200px] font-mono text-sm"
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
                              </>
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
        </Tabs>

        {/* Open Stats Dialog */}
        <Dialog 
          open={!!selectedNewsletterForStats} 
          onOpenChange={(open) => !open && setSelectedNewsletterForStats(null)}
        >
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                Open Statistics: {selectedNewsletterForStats?.subject}
              </DialogTitle>
            </DialogHeader>
            {selectedNewsletterForStats && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
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
                        Unique Opens
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <span className="text-2xl font-bold text-green-600">
                        {selectedNewsletterForStats.unique_opens || 0}
                      </span>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        Open Rate
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <span className="text-2xl font-bold">
                        {selectedNewsletterForStats.sent_count > 0
                          ? Math.round(
                              ((selectedNewsletterForStats.unique_opens || 0) /
                                selectedNewsletterForStats.sent_count) *
                                100
                            )
                          : 0}
                        %
                      </span>
                    </CardContent>
                  </Card>
                </div>

                <div className="max-h-[300px] overflow-auto">
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
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
