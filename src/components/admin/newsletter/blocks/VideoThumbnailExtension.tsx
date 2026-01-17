import { Node } from '@tiptap/core';
import { NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2, Settings, Play, Image as ImageIcon } from 'lucide-react';
import { MediaLibraryPicker } from '@/components/admin/MediaLibraryPicker';

const extractYouTubeThumbnail = (url: string): string | null => {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (match) {
    return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
  }
  return null;
};

const VideoThumbnailComponent = ({ node, updateAttributes, deleteNode, selected }: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const { thumbnailUrl, videoUrl, caption } = node.attrs;

  const handleVideoUrlChange = (url: string) => {
    updateAttributes({ videoUrl: url });
    // Auto-generate thumbnail from YouTube
    if (!thumbnailUrl) {
      const ytThumb = extractYouTubeThumbnail(url);
      if (ytThumb) {
        updateAttributes({ thumbnailUrl: ytThumb });
      }
    }
  };

  return (
    <NodeViewWrapper>
      <div 
        className="relative group my-4"
        data-drag-handle
      >
        <div
          className="relative rounded-lg overflow-hidden"
          style={{ 
            outline: selected ? '2px solid hsl(var(--primary))' : 'none',
          }}
        >
          {thumbnailUrl ? (
            <div className="relative aspect-video bg-muted">
              <img 
                src={thumbnailUrl} 
                alt={caption || 'Video thumbnail'} 
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-black/70 flex items-center justify-center">
                  <Play className="h-8 w-8 text-white ml-1" />
                </div>
              </div>
            </div>
          ) : (
            <div className="aspect-video bg-muted flex flex-col items-center justify-center gap-2">
              <Play className="h-12 w-12 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Add video thumbnail</span>
            </div>
          )}
          {caption && (
            <div className="p-2 text-center text-sm text-muted-foreground bg-muted/50">
              {caption}
            </div>
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
                    <Label>Video URL</Label>
                    <Input
                      value={videoUrl}
                      onChange={(e) => handleVideoUrlChange(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                    />
                    <p className="text-xs text-muted-foreground">
                      YouTube links auto-generate thumbnails
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Thumbnail</Label>
                    <div className="flex items-center gap-2">
                      {thumbnailUrl && (
                        <img 
                          src={thumbnailUrl} 
                          alt="Thumbnail" 
                          className="w-16 h-10 object-cover rounded"
                        />
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setMediaOpen(true)}
                      >
                        <ImageIcon className="h-4 w-4 mr-1" />
                        Choose
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Caption (optional)</Label>
                    <Input
                      value={caption}
                      onChange={(e) => updateAttributes({ caption: e.target.value })}
                      placeholder="Watch the full video"
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteNode()}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}

        <Dialog open={mediaOpen} onOpenChange={setMediaOpen}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Select Thumbnail</DialogTitle>
            </DialogHeader>
            <MediaLibraryPicker
              open={mediaOpen}
              onOpenChange={setMediaOpen}
              onSelect={(url) => {
                updateAttributes({ thumbnailUrl: url });
                setMediaOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </NodeViewWrapper>
  );
};

export const VideoThumbnail = Node.create({
  name: 'videoThumbnail',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      thumbnailUrl: { default: '' },
      videoUrl: { default: '' },
      caption: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="video-thumbnail"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { thumbnailUrl, videoUrl, caption } = HTMLAttributes;

    return [
      'table',
      {
        style: 'margin: 16px auto; border-collapse: collapse; width: 100%;',
        'data-type': 'video-thumbnail',
      },
      [
        'tr',
        {},
        [
          'td',
          { style: 'text-align: center;' },
          [
            'a',
            { 
              href: videoUrl || '#', 
              target: '_blank',
              style: 'text-decoration: none; display: block;'
            },
            [
              'div',
              { style: 'position: relative; display: inline-block;' },
              thumbnailUrl
                ? [
                    'img',
                    {
                      src: thumbnailUrl,
                      alt: caption || 'Video thumbnail',
                      style: 'max-width: 100%; height: auto; border-radius: 8px;',
                    },
                  ]
                : [
                    'div',
                    {
                      style: 'width: 560px; height: 315px; background-color: #f3f4f6; border-radius: 8px; display: flex; align-items: center; justify-content: center;',
                    },
                    '▶️',
                  ],
              [
                'div',
                {
                  style: 'position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); width: 64px; height: 64px; background-color: rgba(0,0,0,0.7); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 24px;',
                },
                '▶',
              ],
            ],
          ],
        ],
      ],
      ...(caption
        ? [
            [
              'tr',
              {},
              [
                'td',
                { style: 'text-align: center; padding-top: 8px; color: #6b7280; font-size: 14px;' },
                caption,
              ],
            ],
          ]
        : []),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoThumbnailComponent);
  },
});
