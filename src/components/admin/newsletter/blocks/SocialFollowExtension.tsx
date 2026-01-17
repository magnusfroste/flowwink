import { Node } from '@tiptap/core';
import { NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Trash2, Settings, Plus, X, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';

const SOCIAL_PLATFORMS = [
  { id: 'twitter', name: 'X / Twitter', icon: '𝕏', color: '#000000' },
  { id: 'facebook', name: 'Facebook', icon: 'f', color: '#1877F2' },
  { id: 'instagram', name: 'Instagram', icon: '📷', color: '#E4405F' },
  { id: 'linkedin', name: 'LinkedIn', icon: 'in', color: '#0A66C2' },
  { id: 'youtube', name: 'YouTube', icon: '▶', color: '#FF0000' },
  { id: 'tiktok', name: 'TikTok', icon: '♪', color: '#000000' },
  { id: 'threads', name: 'Threads', icon: '@', color: '#000000' },
  { id: 'bluesky', name: 'Bluesky', icon: '🦋', color: '#0085FF' },
];

interface SocialLink {
  platform: string;
  url: string;
}

const SocialFollowComponent = ({ node, updateAttributes, deleteNode, selected }: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const { links, style, alignment } = node.attrs;

  const parsedLinks: SocialLink[] = typeof links === 'string' ? JSON.parse(links || '[]') : links || [];

  const updateLinks = (newLinks: SocialLink[]) => {
    updateAttributes({ links: JSON.stringify(newLinks) });
  };

  const addPlatform = (platformId: string) => {
    const newLinks = [...parsedLinks, { platform: platformId, url: '' }];
    updateLinks(newLinks);
  };

  const removePlatform = (index: number) => {
    const newLinks = parsedLinks.filter((_, i) => i !== index);
    updateLinks(newLinks);
  };

  const updatePlatformUrl = (index: number, url: string) => {
    const newLinks = [...parsedLinks];
    newLinks[index].url = url;
    updateLinks(newLinks);
  };

  const alignmentStyles: Record<string, string> = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  };

  const availablePlatforms = SOCIAL_PLATFORMS.filter(
    p => !parsedLinks.some(l => l.platform === p.id)
  );

  return (
    <NodeViewWrapper>
      <div 
        className="relative group my-4"
        data-drag-handle
      >
        <div
          className={`flex gap-3 ${alignmentStyles[alignment]} p-4 rounded-lg`}
          style={{ 
            outline: selected ? '2px solid hsl(var(--primary))' : 'none',
          }}
        >
          {parsedLinks.length === 0 ? (
            <div className="text-sm text-muted-foreground py-2">
              Add social platforms to display
            </div>
          ) : (
            parsedLinks.map((link, index) => {
              const platform = SOCIAL_PLATFORMS.find(p => p.id === link.platform);
              if (!platform) return null;

              if (style === 'buttons') {
                return (
                  <a
                    key={index}
                    href={link.url || '#'}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-white text-sm font-medium"
                    style={{ backgroundColor: platform.color }}
                  >
                    <span>{platform.icon}</span>
                    <span>{platform.name}</span>
                  </a>
                );
              } else if (style === 'minimal') {
                return (
                  <a
                    key={index}
                    href={link.url || '#'}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {platform.name}
                  </a>
                );
              } else {
                // icons (default)
                return (
                  <a
                    key={index}
                    href={link.url || '#'}
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white text-lg font-bold"
                    style={{ backgroundColor: platform.color }}
                    title={platform.name}
                  >
                    {platform.icon}
                  </a>
                );
              }
            })
          )}
        </div>

        {selected && (
          <div className="absolute -top-8 right-0 flex gap-1 bg-background border rounded-md shadow-sm p-1">
            <Popover open={isEditing} onOpenChange={setIsEditing}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Settings className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80" align="end">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Style</Label>
                    <ToggleGroup
                      type="single"
                      value={style}
                      onValueChange={(value) => value && updateAttributes({ style: value })}
                      className="justify-start"
                    >
                      <ToggleGroupItem value="icons" size="sm">Icons</ToggleGroupItem>
                      <ToggleGroupItem value="buttons" size="sm">Buttons</ToggleGroupItem>
                      <ToggleGroupItem value="minimal" size="sm">Minimal</ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <div className="space-y-2">
                    <Label>Alignment</Label>
                    <ToggleGroup
                      type="single"
                      value={alignment}
                      onValueChange={(value) => value && updateAttributes({ alignment: value })}
                      className="justify-start"
                    >
                      <ToggleGroupItem value="left" size="sm">
                        <AlignLeft className="h-4 w-4" />
                      </ToggleGroupItem>
                      <ToggleGroupItem value="center" size="sm">
                        <AlignCenter className="h-4 w-4" />
                      </ToggleGroupItem>
                      <ToggleGroupItem value="right" size="sm">
                        <AlignRight className="h-4 w-4" />
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </div>
                  <div className="space-y-2">
                    <Label>Platforms</Label>
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {parsedLinks.map((link, index) => {
                        const platform = SOCIAL_PLATFORMS.find(p => p.id === link.platform);
                        return (
                          <div key={index} className="flex items-center gap-2">
                            <div 
                              className="w-6 h-6 rounded flex items-center justify-center text-white text-xs"
                              style={{ backgroundColor: platform?.color }}
                            >
                              {platform?.icon}
                            </div>
                            <Input
                              value={link.url}
                              onChange={(e) => updatePlatformUrl(index, e.target.value)}
                              placeholder={`${platform?.name} URL`}
                              className="flex-1 h-8 text-sm"
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => removePlatform(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                    {availablePlatforms.length > 0 && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="w-full">
                            <Plus className="h-4 w-4 mr-1" />
                            Add Platform
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-48 p-2" align="start">
                          <div className="space-y-1">
                            {availablePlatforms.map((platform) => (
                              <Button
                                key={platform.id}
                                variant="ghost"
                                size="sm"
                                className="w-full justify-start"
                                onClick={() => addPlatform(platform.id)}
                              >
                                <span 
                                  className="w-5 h-5 rounded flex items-center justify-center text-white text-xs mr-2"
                                  style={{ backgroundColor: platform.color }}
                                >
                                  {platform.icon}
                                </span>
                                {platform.name}
                              </Button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteNode()}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const SocialFollow = Node.create({
  name: 'socialFollow',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      links: { default: '[]' },
      style: { default: 'icons' },
      alignment: { default: 'center' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="social-follow"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { links, style, alignment } = HTMLAttributes;
    const parsedLinks: SocialLink[] = typeof links === 'string' ? JSON.parse(links || '[]') : links || [];

    const alignMap: Record<string, string> = {
      left: 'left',
      center: 'center',
      right: 'right',
    };

    const socialContent = parsedLinks.map((link) => {
      const platform = SOCIAL_PLATFORMS.find(p => p.id === link.platform);
      if (!platform) return '';

      if (style === 'buttons') {
        return [
          'a',
          {
            href: link.url || '#',
            style: `display: inline-block; padding: 8px 16px; margin: 0 4px; background-color: ${platform.color}; color: white; text-decoration: none; border-radius: 20px; font-size: 14px; font-weight: 500;`,
          },
          `${platform.icon} ${platform.name}`,
        ];
      } else if (style === 'minimal') {
        return [
          'a',
          {
            href: link.url || '#',
            style: 'display: inline-block; margin: 0 8px; color: #6b7280; text-decoration: none; font-size: 14px;',
          },
          platform.name,
        ];
      } else {
        return [
          'a',
          {
            href: link.url || '#',
            style: `display: inline-block; width: 40px; height: 40px; margin: 0 4px; background-color: ${platform.color}; color: white; text-decoration: none; border-radius: 50%; text-align: center; line-height: 40px; font-size: 18px;`,
            title: platform.name,
          },
          platform.icon,
        ];
      }
    });

    return [
      'table',
      {
        style: 'margin: 16px 0; border-collapse: collapse; width: 100%;',
        'data-type': 'social-follow',
      },
      [
        'tr',
        {},
        [
          'td',
          { style: `text-align: ${alignMap[alignment] || 'center'}; padding: 16px 0;` },
          ...socialContent,
        ],
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SocialFollowComponent);
  },
});
