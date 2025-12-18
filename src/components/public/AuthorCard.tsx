import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { AuthorProfile } from "@/types/cms";

interface AuthorCardProps {
  author: AuthorProfile;
  variant?: "inline" | "card";
  showBio?: boolean;
}

export function AuthorCard({ author, variant = "card", showBio = true }: AuthorCardProps) {
  const initials = author.full_name
    ?.split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "?";

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={author.avatar_url || undefined} alt={author.full_name || ""} />
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <div>
          <p className="font-medium">{author.full_name || author.email}</p>
          {author.title && (
            <p className="text-sm text-muted-foreground">{author.title}</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <Avatar className="h-16 w-16">
            <AvatarImage src={author.avatar_url || undefined} alt={author.full_name || ""} />
            <AvatarFallback className="text-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-lg">{author.full_name || author.email}</p>
            {author.title && (
              <p className="text-sm text-muted-foreground mb-2">{author.title}</p>
            )}
            {showBio && author.bio && (
              <p className="text-sm text-muted-foreground line-clamp-3">{author.bio}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}