import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { AlignLeft, AlignCenter, AlignRight, Trash2, Settings } from 'lucide-react';

const CTAButtonComponent = ({ node, updateAttributes, deleteNode, selected }: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const { text, url, backgroundColor, textColor, alignment } = node.attrs;

  const alignmentStyles: Record<string, string> = {
    left: 'justify-start',
    center: 'justify-center',
    right: 'justify-end',
  };

  return (
    <NodeViewWrapper>
      <div 
        className={`relative group my-4 flex ${alignmentStyles[alignment]}`}
        data-drag-handle
      >
        <Popover open={isEditing} onOpenChange={setIsEditing}>
          <PopoverTrigger asChild>
            <button
              className="px-6 py-3 rounded-md font-semibold text-sm transition-all hover:opacity-90 cursor-pointer"
              style={{ 
                backgroundColor, 
                color: textColor,
                border: selected ? '2px solid hsl(var(--primary))' : '2px solid transparent'
              }}
            >
              {text || 'Click Here'}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="center">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Button Text</Label>
                <Input
                  value={text}
                  onChange={(e) => updateAttributes({ text: e.target.value })}
                  placeholder="Click Here"
                />
              </div>
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  value={url}
                  onChange={(e) => updateAttributes({ url: e.target.value })}
                  placeholder="https://example.com"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Background</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={backgroundColor}
                      onChange={(e) => updateAttributes({ backgroundColor: e.target.value })}
                      className="w-10 h-10 rounded border cursor-pointer"
                    />
                    <Input
                      value={backgroundColor}
                      onChange={(e) => updateAttributes({ backgroundColor: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Text Color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={textColor}
                      onChange={(e) => updateAttributes({ textColor: e.target.value })}
                      className="w-10 h-10 rounded border cursor-pointer"
                    />
                    <Input
                      value={textColor}
                      onChange={(e) => updateAttributes({ textColor: e.target.value })}
                      className="flex-1"
                    />
                  </div>
                </div>
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
              <div className="flex justify-end">
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteNode()}
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {selected && !isEditing && (
          <div className="absolute -top-8 left-1/2 -translate-x-1/2 flex gap-1 bg-background border rounded-md shadow-sm p-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEditing(true)}>
              <Settings className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => deleteNode()}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};

export const CTAButton = Node.create({
  name: 'ctaButton',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      text: { default: 'Click Here' },
      url: { default: '' },
      backgroundColor: { default: '#3b82f6' },
      textColor: { default: '#ffffff' },
      alignment: { default: 'center' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="cta-button"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { text, url, backgroundColor, textColor, alignment } = HTMLAttributes;
    const alignMap: Record<string, string> = {
      left: 'left',
      center: 'center',
      right: 'right',
    };

    return [
      'table',
      { 
        align: alignMap[alignment] || 'center',
        style: 'margin: 16px auto; border-collapse: collapse;',
        'data-type': 'cta-button'
      },
      [
        'tr',
        {},
        [
          'td',
          {
            style: `background-color: ${backgroundColor}; padding: 12px 24px; border-radius: 6px;`,
          },
          [
            'a',
            {
              href: url || '#',
              style: `color: ${textColor}; text-decoration: none; font-weight: 600; font-size: 14px;`,
            },
            text || 'Click Here',
          ],
        ],
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CTAButtonComponent);
  },
});
