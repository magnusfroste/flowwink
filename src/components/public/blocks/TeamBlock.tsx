import { TeamBlockData, TeamMember } from '@/types/cms';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Linkedin, Twitter, Mail, Globe, User } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel';

interface TeamBlockProps {
  data: TeamBlockData;
}

function SocialLinks({ social }: { social?: TeamMember['social'] }) {
  if (!social) return null;

  const links = [
    { url: social.linkedin, icon: Linkedin, label: 'LinkedIn' },
    { url: social.twitter, icon: Twitter, label: 'Twitter' },
    { url: social.email, icon: Mail, label: 'Email', isEmail: true },
    { url: social.website, icon: Globe, label: 'Website' },
  ].filter((link) => link.url);

  if (links.length === 0) return null;

  return (
    <div className="flex items-center justify-center gap-2 mt-3">
      {links.map(({ url, icon: Icon, label, isEmail }) => (
        <a
          key={label}
          href={isEmail ? `mailto:${url}` : url}
          target={isEmail ? undefined : '_blank'}
          rel="noopener noreferrer"
          className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          aria-label={label}
        >
          <Icon className="h-4 w-4" />
        </a>
      ))}
    </div>
  );
}

function TeamMemberCard({
  member,
  variant,
  showBio,
  showSocial,
}: {
  member: TeamMember;
  variant: string;
  showBio: boolean;
  showSocial: boolean;
}) {
  const initials = member.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-4 p-4">
        <Avatar className="h-12 w-12">
          <AvatarImage src={member.photo} alt={member.name} />
          <AvatarFallback className="bg-primary/10 text-primary">
            {initials || <User className="h-5 w-5" />}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h4 className="font-medium truncate">{member.name}</h4>
          <p className="text-sm text-muted-foreground truncate">{member.role}</p>
        </div>
        {showSocial && <SocialLinks social={member.social} />}
      </div>
    );
  }

  if (variant === 'cards') {
    return (
      <Card className="overflow-hidden h-full">
        <CardContent className="p-6 text-center">
          <Avatar className="h-24 w-24 mx-auto mb-4">
            <AvatarImage src={member.photo} alt={member.name} />
            <AvatarFallback className="bg-primary/10 text-primary text-2xl">
              {initials || <User className="h-10 w-10" />}
            </AvatarFallback>
          </Avatar>
          <h4 className="font-semibold text-lg">{member.name}</h4>
          <p className="text-sm text-primary font-medium mt-1">{member.role}</p>
          {showBio && member.bio && (
            <p className="text-sm text-muted-foreground mt-3 line-clamp-3">{member.bio}</p>
          )}
          {showSocial && <SocialLinks social={member.social} />}
        </CardContent>
      </Card>
    );
  }

  // Default variant
  return (
    <div className="text-center">
      <Avatar className="h-32 w-32 mx-auto mb-4 ring-4 ring-background shadow-lg">
        <AvatarImage src={member.photo} alt={member.name} />
        <AvatarFallback className="bg-primary/10 text-primary text-3xl">
          {initials || <User className="h-12 w-12" />}
        </AvatarFallback>
      </Avatar>
      <h4 className="font-semibold text-lg">{member.name}</h4>
      <p className="text-sm text-primary font-medium">{member.role}</p>
      {showBio && member.bio && (
        <p className="text-sm text-muted-foreground mt-2 max-w-xs mx-auto">{member.bio}</p>
      )}
      {showSocial && <SocialLinks social={member.social} />}
    </div>
  );
}

export function TeamBlock({ data }: TeamBlockProps) {
  const {
    title,
    subtitle,
    members = [],
    columns = 3,
    layout = 'grid',
    variant = 'cards',
    showBio = true,
    showSocial = true,
  } = data;

  if (members.length === 0) {
    return null;
  }

  const gridCols = {
    2: 'sm:grid-cols-2',
    3: 'sm:grid-cols-2 lg:grid-cols-3',
    4: 'sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <section className="py-12 md:py-16">
      <div className="container max-w-6xl mx-auto px-4">
        {(title || subtitle) && (
          <div className="text-center mb-10 md:mb-12">
            {title && <h2 className="text-3xl md:text-4xl font-bold">{title}</h2>}
            {subtitle && (
              <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">{subtitle}</p>
            )}
          </div>
        )}

        {layout === 'carousel' ? (
          <Carousel
            opts={{ align: 'start', loop: true }}
            className="w-full"
          >
            <CarouselContent className="-ml-4">
              {members.map((member) => (
                <CarouselItem
                  key={member.id}
                  className={cn(
                    'pl-4',
                    columns === 2 && 'md:basis-1/2',
                    columns === 3 && 'md:basis-1/2 lg:basis-1/3',
                    columns === 4 && 'md:basis-1/2 lg:basis-1/4'
                  )}
                >
                  <TeamMemberCard
                    member={member}
                    variant={variant}
                    showBio={showBio}
                    showSocial={showSocial}
                  />
                </CarouselItem>
              ))}
            </CarouselContent>
            <CarouselPrevious className="hidden md:flex -left-12" />
            <CarouselNext className="hidden md:flex -right-12" />
          </Carousel>
        ) : (
          <div className={cn('grid gap-6 md:gap-8', gridCols[columns])}>
            {members.map((member) => (
              <TeamMemberCard
                key={member.id}
                member={member}
                variant={variant}
                showBio={showBio}
                showSocial={showSocial}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
