import { Node } from '@tiptap/core';
import { NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2, Settings, Image as ImageIcon, User } from 'lucide-react';
import { MediaLibraryPicker } from '@/components/admin/MediaLibraryPicker';

const AuthorBlockComponent = ({ node, updateAttributes, deleteNode, selected }: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const { name, role, imageUrl, bio } = node.attrs;

  return (
    <NodeViewWrapper>
      <div 
        className="relative group my-6"
        data-drag-handle
      >
        <div
          className="flex items-start gap-4 p-4 rounded-lg bg-muted/30"
          style={{ 
            outline: selected ? '2px solid hsl(var(--primary))' : 'none',
          }}
        >
          <div className="flex-shrink-0">
            {imageUrl ? (
              <img 
                src={imageUrl} 
                alt={name || 'Author'} 
                className="w-16 h-16 rounded-full object-cover"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                <User className="h-8 w-8 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-lg">{name || 'Author Name'}</div>
            {role && <div className="text-sm text-muted-foreground">{role}</div>}
            {bio && <div className="text-sm mt-2 text-muted-foreground">{bio}</div>}
          </div>
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
                    <Label>Photo</Label>
                    <div className="flex items-center gap-3">
                      {imageUrl ? (
                        <img 
                          src={imageUrl} 
                          alt="Author" 
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                          <User className="h-6 w-6 text-muted-foreground" />
                        </div>
                      )}
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setMediaOpen(true)}
                      >
                        <ImageIcon className="h-4 w-4 mr-1" />
                        Choose Image
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input
                      value={name}
                      onChange={(e) => updateAttributes({ name: e.target.value })}
                      placeholder="Jane Doe"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role / Title</Label>
                    <Input
                      value={role}
                      onChange={(e) => updateAttributes({ role: e.target.value })}
                      placeholder="CEO & Founder"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Bio (optional)</Label>
                    <Textarea
                      value={bio}
                      onChange={(e) => updateAttributes({ bio: e.target.value })}
                      placeholder="A short bio..."
                      rows={3}
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
              <DialogTitle>Select Author Photo</DialogTitle>
            </DialogHeader>
            <MediaLibraryPicker
              open={mediaOpen}
              onOpenChange={setMediaOpen}
              onSelect={(url) => {
                updateAttributes({ imageUrl: url });
                setMediaOpen(false);
              }}
            />
          </DialogContent>
        </Dialog>
      </div>
    </NodeViewWrapper>
  );
};

export const AuthorBlock = Node.create({
  name: 'authorBlock',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      name: { default: '' },
      role: { default: '' },
      imageUrl: { default: '' },
      bio: { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="author-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { name, role, imageUrl, bio } = HTMLAttributes;

    return [
      'table',
      {
        style: 'margin: 24px 0; border-collapse: collapse; width: 100%;',
        'data-type': 'author-block',
      },
      [
        'tr',
        {},
        [
          'td',
          { style: 'background-color: #f9fafb; padding: 16px; border-radius: 8px;' },
          [
            'table',
            { style: 'border-collapse: collapse;' },
            [
              'tr',
              {},
              [
                'td',
                { style: 'vertical-align: top; padding-right: 16px;' },
                imageUrl
                  ? [
                      'img',
                      {
                        src: imageUrl,
                        alt: name || 'Author',
                        style: 'width: 64px; height: 64px; border-radius: 50%; object-fit: cover;',
                      },
                    ]
                  : [
                      'div',
                      {
                        style: 'width: 64px; height: 64px; border-radius: 50%; background-color: #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: 24px; color: #9ca3af;',
                      },
                      '👤',
                    ],
              ],
              [
                'td',
                { style: 'vertical-align: top;' },
                [
                  'div',
                  { style: 'font-weight: 600; font-size: 18px; color: #111827;' },
                  name || 'Author Name',
                ],
                ...(role
                  ? [
                      [
                        'div',
                        { style: 'font-size: 14px; color: #6b7280;' },
                        role,
                      ],
                    ]
                  : []),
                ...(bio
                  ? [
                      [
                        'div',
                        { style: 'font-size: 14px; color: #6b7280; margin-top: 8px;' },
                        bio,
                      ],
                    ]
                  : []),
              ],
            ],
          ],
        ],
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(AuthorBlockComponent);
  },
});
