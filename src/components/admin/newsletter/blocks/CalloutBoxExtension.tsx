import { Node } from '@tiptap/core';
import { NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer, NodeViewContent } from '@tiptap/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Trash2, Settings, Info, AlertTriangle, Lightbulb, CheckCircle } from 'lucide-react';

const CALLOUT_ICONS = [
  { value: 'info', label: 'Info', icon: Info, color: '#3b82f6' },
  { value: 'warning', label: 'Warning', icon: AlertTriangle, color: '#f59e0b' },
  { value: 'tip', label: 'Tip', icon: Lightbulb, color: '#10b981' },
  { value: 'success', label: 'Success', icon: CheckCircle, color: '#22c55e' },
];

const CalloutBoxComponent = ({ node, updateAttributes, deleteNode, selected }: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const { title, icon, backgroundColor, borderColor } = node.attrs;

  const selectedIcon = CALLOUT_ICONS.find(i => i.value === icon) || CALLOUT_ICONS[0];
  const IconComponent = selectedIcon.icon;

  return (
    <NodeViewWrapper>
      <div 
        className="relative group my-4"
        data-drag-handle
      >
        <div
          className="rounded-lg p-4 border-l-4"
          style={{ 
            backgroundColor, 
            borderLeftColor: borderColor,
            outline: selected ? '2px solid hsl(var(--primary))' : 'none',
          }}
        >
          <div className="flex items-start gap-3">
            <IconComponent 
              className="h-5 w-5 mt-0.5 flex-shrink-0" 
              style={{ color: borderColor }}
            />
            <div className="flex-1 min-w-0">
              {title && (
                <div className="font-semibold mb-1" style={{ color: borderColor }}>
                  {title}
                </div>
              )}
              <NodeViewContent className="prose prose-sm max-w-none [&>p]:m-0" />
            </div>
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
              <PopoverContent className="w-72" align="end">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title (optional)</Label>
                    <Input
                      value={title}
                      onChange={(e) => updateAttributes({ title: e.target.value })}
                      placeholder="Note"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Icon Type</Label>
                    <ToggleGroup
                      type="single"
                      value={icon}
                      onValueChange={(value) => {
                        if (value) {
                          const iconData = CALLOUT_ICONS.find(i => i.value === value);
                          updateAttributes({ 
                            icon: value,
                            borderColor: iconData?.color || borderColor
                          });
                        }
                      }}
                      className="justify-start"
                    >
                      {CALLOUT_ICONS.map((item) => (
                        <ToggleGroupItem key={item.value} value={item.value} size="sm">
                          <item.icon className="h-4 w-4" />
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
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
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Accent</Label>
                      <div className="flex gap-2">
                        <input
                          type="color"
                          value={borderColor}
                          onChange={(e) => updateAttributes({ borderColor: e.target.value })}
                          className="w-10 h-10 rounded border cursor-pointer"
                        />
                      </div>
                    </div>
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

export const CalloutBox = Node.create({
  name: 'calloutBox',
  group: 'block',
  content: 'inline*',
  draggable: true,

  addAttributes() {
    return {
      title: { default: '' },
      icon: { default: 'info' },
      backgroundColor: { default: '#eff6ff' },
      borderColor: { default: '#3b82f6' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="callout-box"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const { title, icon, backgroundColor, borderColor } = HTMLAttributes;
    const iconEmoji: Record<string, string> = {
      info: 'ℹ️',
      warning: '⚠️',
      tip: '💡',
      success: '✅',
    };

    return [
      'table',
      {
        style: `margin: 16px 0; border-collapse: collapse; width: 100%;`,
        'data-type': 'callout-box',
      },
      [
        'tr',
        {},
        [
          'td',
          {
            style: `background-color: ${backgroundColor}; border-left: 4px solid ${borderColor}; padding: 16px; border-radius: 0 8px 8px 0;`,
          },
          [
            'table',
            { style: 'border-collapse: collapse;' },
            [
              'tr',
              {},
              [
                'td',
                { style: 'vertical-align: top; padding-right: 12px; font-size: 18px;' },
                iconEmoji[icon] || iconEmoji.info,
              ],
              [
                'td',
                {},
                ...(title
                  ? [
                      [
                        'div',
                        { style: `font-weight: 600; color: ${borderColor}; margin-bottom: 4px;` },
                        title,
                      ],
                    ]
                  : []),
                ['div', { style: 'color: #374151;' }, 0],
              ],
            ],
          ],
        ],
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutBoxComponent);
  },
});
