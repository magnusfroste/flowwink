import { StarterTemplate } from "@/data/starter-templates";
import { cn } from "@/lib/utils";
import { getTemplateThumbnail, getTemplateHero } from "@/lib/template-helpers";
import { Eye, Sparkles, BookOpen, Rss, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

interface TemplateVisualCardProps {
  template: StarterTemplate;
  onPreview: (template: StarterTemplate) => void;
  onSelect: (template: StarterTemplate) => void;
}

export function TemplateVisualCard({ template, onPreview, onSelect }: TemplateVisualCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  const thumbnail = getTemplateThumbnail(template);
  const heroData = getTemplateHero(template);
  const primaryColor = template.branding?.primaryColor || '#6366f1';
  
  // Feature indicators
  const hasKb = (template.kbCategories?.length || 0) > 0;
  const hasBlog = (template.blogPosts?.length || 0) > 0;
  const hasChat = template.chatSettings?.enabled !== false;
  
  // Get hero content for display
  const heroTitle = heroData?.title || template.name;
  const heroSubtitle = heroData?.subtitle || template.tagline;

  return (
    <div
      className={cn(
        "group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300",
        "bg-card border shadow-sm",
        isHovered 
          ? "shadow-2xl scale-[1.02] border-primary/50" 
          : "hover:shadow-lg"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onPreview(template)}
    >
      {/* Main visual preview - 4:3 aspect ratio */}
      <div className="aspect-[4/3] relative overflow-hidden">
        {/* Background - hero image or gradient */}
        <div 
          className="absolute inset-0"
          style={thumbnail.type === 'image' 
            ? { 
                backgroundImage: `url(${thumbnail.value})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }
            : { background: thumbnail.value }
          }
        />
        
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10" />
        
        {/* Feature indicators - top right corner */}
        <div className={cn(
          "absolute top-3 right-3 flex gap-1.5 transition-opacity duration-200",
          isHovered ? "opacity-0" : "opacity-100"
        )}>
          {hasChat && (
            <div 
              className="h-7 w-7 rounded-full flex items-center justify-center bg-white/90 backdrop-blur-sm shadow-sm"
              title="AI Chat"
            >
              <MessageSquare className="h-3.5 w-3.5 text-cyan-600" />
            </div>
          )}
          {hasKb && (
            <div 
              className="h-7 w-7 rounded-full flex items-center justify-center bg-white/90 backdrop-blur-sm shadow-sm"
              title="Knowledge Base"
            >
              <BookOpen className="h-3.5 w-3.5 text-indigo-600" />
            </div>
          )}
          {hasBlog && (
            <div 
              className="h-7 w-7 rounded-full flex items-center justify-center bg-white/90 backdrop-blur-sm shadow-sm"
              title="Blog"
            >
              <Rss className="h-3.5 w-3.5 text-orange-500" />
            </div>
          )}
        </div>
        
        {/* Live preview content - hero simulation */}
        <div className="absolute inset-0 flex flex-col justify-end p-6">
          <div className="space-y-2">
            <h3 className="text-white font-bold text-2xl md:text-3xl line-clamp-2 drop-shadow-lg">
              {heroTitle}
            </h3>
            <p className="text-white/80 text-sm md:text-base line-clamp-2 max-w-md">
              {heroSubtitle}
            </p>
          </div>
          
          {/* CTA buttons preview */}
          {heroData?.primaryButton && (
            <div className="flex gap-2 mt-4">
              <div 
                className="px-4 py-2 rounded-lg text-white text-sm font-medium shadow-lg"
                style={{ backgroundColor: primaryColor }}
              >
                {heroData.primaryButton.text}
              </div>
              {heroData.secondaryButton && (
                <div className="px-4 py-2 rounded-lg bg-white/20 backdrop-blur-sm text-white text-sm font-medium">
                  {heroData.secondaryButton.text}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Hover overlay with actions */}
        <div className={cn(
          "absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center gap-3 transition-all duration-200",
          isHovered ? "opacity-100" : "opacity-0 pointer-events-none"
        )}>
          <Button 
            size="lg"
            variant="secondary"
            className="shadow-lg"
            onClick={(e) => {
              e.stopPropagation();
              onPreview(template);
            }}
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview
          </Button>
          <Button 
            size="lg"
            className="shadow-lg"
            onClick={(e) => {
              e.stopPropagation();
              onSelect(template);
            }}
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Use
          </Button>
        </div>
      </div>
      
      {/* Template name - minimal footer */}
      <div className="p-4 bg-card">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-base truncate">
            {template.name}
          </h4>
          {/* Expanded feature info on hover */}
          <div className={cn(
            "flex items-center gap-2 text-xs text-muted-foreground transition-opacity duration-200",
            isHovered ? "opacity-100" : "opacity-0"
          )}>
            <span>{template.pages?.length || 0} pages</span>
            {hasKb && <span>• KB</span>}
            {hasBlog && <span>• Blog</span>}
            {hasChat && <span>• AI</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
