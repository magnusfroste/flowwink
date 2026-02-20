import { logger } from '@/lib/logger';
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Shield, Download, Trash2, Mail, CheckCircle, AlertTriangle, Loader2 } from "lucide-react";
import { format } from "date-fns";

interface SubscriberData {
  email: string;
  name: string | null;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  unsubscribed_at: string | null;
}

export default function NewsletterManagePage() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [subscriber, setSubscriber] = useState<SubscriberData | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);

  // Check for token or direct unsubscribe action in URL on mount
  useEffect(() => {
    const urlToken = searchParams.get("token");
    const urlEmail = searchParams.get("email");
    const action = searchParams.get("action");
    
    // Handle direct unsubscribe from email link (no token required)
    if (action === "unsubscribe" && urlEmail) {
      handleDirectUnsubscribe(urlEmail);
      return;
    }
    
    if (urlToken && urlEmail) {
      setToken(urlToken);
      setEmail(urlEmail);
      verifyToken(urlEmail, urlToken);
    }
  }, [searchParams]);

  // Handle direct unsubscribe from email link
  const handleDirectUnsubscribe = async (emailToUnsubscribe: string) => {
    setIsLoading(true);
    setEmail(emailToUnsubscribe);
    try {
      const { error } = await supabase
        .from("newsletter_subscribers")
        .update({ 
          status: "unsubscribed",
          unsubscribed_at: new Date().toISOString()
        })
        .eq("email", emailToUnsubscribe);

      if (error) {
        logger.error("Unsubscribe error:", error);
        toast.error("Failed to unsubscribe. Please try again.");
      } else {
        setIsDeleted(true); // Reuse the deleted state to show success message
        toast.success("You have been unsubscribed");
      }
    } catch (err) {
      logger.error("Unsubscribe error:", err);
      toast.error("An error occurred. Please try again later.");
    } finally {
      setIsLoading(false);
    }
  };

  const verifyToken = async (emailToVerify: string, tokenToVerify: string) => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("newsletter-gdpr", {
        body: { action: "verify", email: emailToVerify, token: tokenToVerify },
      });

      if (error) throw error;
      
      if (data.verified) {
        setIsVerified(true);
        setSubscriber(data.subscriber);
        setToken(tokenToVerify);
      }
    } catch (err: any) {
      toast.error("Verification failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("newsletter-gdpr", {
        body: { action: "request", email: email.trim() },
      });

      if (error) throw error;
      
      setRequestSent(true);
      
      // For development: auto-verify if token is returned
      if (data._dev_token) {
        setToken(data._dev_token);
        await verifyToken(email.trim(), data._dev_token);
      }
    } catch (err: any) {
      toast.error(err.message || "Request failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportData = async () => {
    if (!token || !email) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("newsletter-gdpr", {
        body: { action: "export", email, token },
      });

      if (error) throw error;

      // Download as JSON file
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-newsletter-data_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Your data has been downloaded");
    } catch (err: any) {
      toast.error(err.message || "Export failed");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteData = async () => {
    if (!token || !email) return;

    if (!confirm("Are you sure you want to permanently delete all your data? This cannot be undone.")) {
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("newsletter-gdpr", {
        body: { action: "delete", email, token },
      });

      if (error) throw error;

      setIsDeleted(true);
      toast.success("Your data has been permanently deleted");
    } catch (err: any) {
      toast.error(err.message || "Deletion failed");
    } finally {
      setIsLoading(false);
    }
  };

  // Deleted state
  if (isDeleted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardHeader>
            <div className="mx-auto w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <CardTitle>Data Deleted</CardTitle>
            <CardDescription>
              All your newsletter data has been permanently deleted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You have been unsubscribed and all associated data has been removed from our systems.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Verified state - show data management options
  if (isVerified && subscriber) {
    return (
      <div className="min-h-screen bg-background py-12 px-4">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center mb-8">
            <Shield className="h-12 w-12 text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-bold">Manage Your Data</h1>
            <p className="text-muted-foreground mt-2">
              View, export, or delete your newsletter subscription data
            </p>
          </div>

          {/* Subscriber Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Subscription</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium">{subscriber.email}</span>
                </div>
                {subscriber.name && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{subscriber.name}</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Status</span>
                  <Badge variant={subscriber.status === "confirmed" ? "default" : "secondary"}>
                    {subscriber.status}
                  </Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Subscribed</span>
                  <span className="text-sm">
                    {format(new Date(subscriber.created_at), "MMMM d, yyyy")}
                  </span>
                </div>
                {subscriber.confirmed_at && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Confirmed</span>
                    <span className="text-sm">
                      {format(new Date(subscriber.confirmed_at), "MMMM d, yyyy")}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Data Actions</CardTitle>
              <CardDescription>
                Under GDPR, you have the right to access and delete your personal data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={handleExportData}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4 mr-2" />
                  )}
                  Download My Data
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={handleDeleteData}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-2" />
                  )}
                  Delete All My Data
                </Button>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Deleting your data is permanent and cannot be undone. You will be unsubscribed 
                  from the newsletter and all activity data will be removed.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Request access form
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Manage Your Data</CardTitle>
          <CardDescription>
            Enter your email to access, export, or delete your newsletter subscription data
          </CardDescription>
        </CardHeader>
        <CardContent>
          {requestSent && !isVerified ? (
            <div className="text-center py-4">
              <Mail className="h-12 w-12 text-primary mx-auto mb-4" />
              <p className="font-medium">Check your email</p>
              <p className="text-sm text-muted-foreground mt-2">
                If this email is registered, you will receive a verification link to access your data.
              </p>
            </div>
          ) : (
            <form onSubmit={handleRequestAccess} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Access My Data"
                )}
              </Button>
            </form>
          )}

          <Separator className="my-6" />
          
          <p className="text-xs text-center text-muted-foreground">
            This page allows you to exercise your rights under GDPR Article 15 (Right of Access) 
            and Article 17 (Right to Erasure).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
