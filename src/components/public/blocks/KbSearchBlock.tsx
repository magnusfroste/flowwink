import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface KbSearchBlockData {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  buttonText?: string;
  variant?: 'default' | 'minimal' | 'hero';
  showButton?: boolean;
  kbPageSlug?: string;
}

interface KbSearchBlockProps {
  data: KbSearchBlockData;
}

export function KbSearchBlock({ data }: KbSearchBlockProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  
  const {
    title,
    subtitle,
    placeholder = 'Search for answers...',
    buttonText = 'Search',
    variant = 'default',
    showButton = true,
    kbPageSlug,
  } = data;

  // Use configured slug, or derive from current URL
  const kbSlug = kbPageSlug || location.pathname.split('/')[1] || 'help';

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/${kbSlug}?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch(e);
    }
  };

  if (variant === 'hero') {
    return (
      <div className="text-center space-y-6">
        {title && (
          <h2 className="text-3xl md:text-4xl font-bold text-foreground">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {subtitle}
          </p>
        )}
        <form onSubmit={handleSearch} className="max-w-2xl mx-auto">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              type="search"
              placeholder={placeholder}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              className="pl-12 pr-4 h-14 text-lg rounded-full border-2 focus-visible:ring-primary"
            />
            {showButton && (
              <Button
                type="submit"
                size="lg"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full"
              >
                {buttonText}
              </Button>
            )}
          </div>
        </form>
      </div>
    );
  }

  if (variant === 'minimal') {
    return (
      <form onSubmit={handleSearch} className="w-full">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-10 pr-4"
          />
        </div>
      </form>
    );
  }

  // Default variant
  return (
    <div className="space-y-4">
      {title && (
        <h3 className="text-xl font-semibold text-foreground">
          {title}
        </h3>
      )}
      {subtitle && (
        <p className="text-muted-foreground">
          {subtitle}
        </p>
      )}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder={placeholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-10"
          />
        </div>
        {showButton && (
          <Button type="submit">
            {buttonText}
          </Button>
        )}
      </form>
    </div>
  );
}
