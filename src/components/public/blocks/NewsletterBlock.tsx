import { useState } from "react";
import { Mail, CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface NewsletterBlockData {
  title?: string;
  description?: string;
  buttonText?: string;
  successMessage?: string;
  variant?: "default" | "card" | "minimal";
  showNameField?: boolean;
}

interface NewsletterBlockProps {
  data: NewsletterBlockData;
}

export function NewsletterBlock({ data }: NewsletterBlockProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    title = "Subscribe to our newsletter",
    description = "Get the latest updates delivered to your inbox.",
    buttonText = "Subscribe",
    successMessage = "Thanks for subscribing! Please check your email to confirm.",
    variant = "default",
    showNameField = false,
  } = data;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/newsletter-subscribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, name: name || undefined }),
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Failed to subscribe");
      }

      setIsSuccess(true);
      setEmail("");
      setName("");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className={`py-8 ${variant === "minimal" ? "" : "bg-muted/30 rounded-xl px-6"}`}>
        <div className="flex flex-col items-center text-center gap-3">
          <CheckCircle className="h-12 w-12 text-green-500" />
          <p className="text-lg font-medium">{successMessage}</p>
        </div>
      </div>
    );
  }

  if (variant === "minimal") {
    return (
      <form onSubmit={handleSubmit} className="py-6">
        <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
          <Input
            type="email"
            placeholder="Enter your email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="flex-1"
          />
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : buttonText}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive text-center mt-2">{error}</p>}
      </form>
    );
  }

  if (variant === "card") {
    return (
      <Card className="max-w-lg mx-auto">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-3">
            {showNameField && (
              <Input
                type="text"
                placeholder="Your name (optional)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            )}
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Subscribing...
                </>
              ) : (
                buttonText
              )}
            </Button>
            {error && <p className="text-sm text-destructive text-center">{error}</p>}
          </form>
        </CardContent>
      </Card>
    );
  }

  // Default variant
  return (
    <div className="py-12 px-6 bg-gradient-to-br from-primary/5 to-primary/10 rounded-2xl">
      <div className="max-w-xl mx-auto text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
          <Mail className="h-7 w-7 text-primary" />
        </div>
        <h3 className="text-2xl font-bold mb-2">{title}</h3>
        <p className="text-muted-foreground mb-6">{description}</p>
        
        <form onSubmit={handleSubmit} className="space-y-3">
          {showNameField && (
            <Input
              type="text"
              placeholder="Your name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="max-w-md mx-auto"
            />
          )}
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="flex-1"
            />
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Subscribing...
                </>
              ) : (
                buttonText
              )}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>
        
        <p className="text-xs text-muted-foreground mt-4">
          We respect your privacy. Unsubscribe at any time.
        </p>
      </div>
    </div>
  );
}
