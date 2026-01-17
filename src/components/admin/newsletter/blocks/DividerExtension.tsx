import { Node } from '@tiptap/core';
import { NodeViewWrapper, NodeViewProps, ReactNodeViewRenderer } from '@tiptap/react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Trash2, Settings, Minus, MoreHorizontal } from 'lucide-react';

const DIVIDER_STYLES = [
  { value: 'solid', label: 'Solid' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'dotted', label: 'Dotted' },
];

const DIVIDER_WIDTHS = [
  { value: '50', label: '50%' },
  { value: '75', label: '75%' },
  { value: '100', label: '100%' },
];

const DIVIDER_SPACINGS = [
  { value: 'small', label: 'S', py: 'py-2' },
  { value: 'medium', label: 'M', py: 'py-4' },
  { value: 'large', label: 'L', py: 'py-8' },
];

const DividerComponent = ({ node, updateAttributes, deleteNode, selected }: NodeViewProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const { style, color, width, spacing } = node.attrs;

  const spacingClass = DIVIDER_SPACINGS.find(s => s.value === spacing)?.py || 'py-4';

  return (
    <NodeViewWrapper>
      <div 
        className={`relative group ${spacingClass}`}
        data-drag-handle
      >
        <div className="flex justify-center">
          <hr
            className="border-t-2"
            style={{
              width: `${width}%`,
              borderStyle: style,
              borderColor: color,
              outline: selected ? '2px solid hsl(var(--primary))' : 'none',
              outlineOffset: '4px',
            }}
          />
        </div>

        {selected && (
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 flex gap-1 bg-background border rounded-md shadow-sm p-1">
            <Popover open={isEditing} onOpenChange={setIsEditing}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  <Settings className="h-3 w-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64" align="center">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Style</Label>
                    <ToggleGroup
                      type="single"
                      value={style}
                      onValueChange={(value) => value && updateAttributes({ style: value })}
                      className="justify-start"
                    >
                      {DIVIDER_STYLES.map((item) => (
                        <ToggleGroupItem key={item.value} value={item.value} size="sm">
                          {item.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                  <div className="space-y-2">
                    <Label>Width</Label>
                    <ToggleGroup
                      type="single"
                      value={width}
                      onValueChange={(value) => value && updateAttributes({ width: value })}
                      className="justify-start"
                    >
                      {DIVIDER_WIDTHS.map((item) => (
                        <ToggleGroupItem key={item.value} value={item.value} size="sm">
                          {item.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                  <div className="space-y-2">
                    <Label>Spacing</Label>
                    <ToggleGroup
                      type="single"
                      value={spacing}
                      onValueChange={(value) => value && updateAttributes({ spacing: value })}
                      className="justify-start"
                    >
                      {DIVIDER_SPACINGS.map((item) => (
                        <ToggleGroupItem key={item.value} value={item.value} size="sm">
                          {item.label}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                  </div>
                  <div className="space-y-2">
                    <Label>Color</Label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => updateAttributes({ color: e.target.value })}
                        className="w-10 h-10 rounded border cursor-pointer"
                      />
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

export const Divider = Node.create({
  name: 'styledDivider',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      style: { default: 'solid' },
      color: { default: '#e5e7eb' },
      width: { default: '100' },
      spacing: { default: 'medium' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="styled-divider"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const { style, color, width, spacing } = HTMLAttributes;
    const paddingMap: Record<string, string> = {
      small: '8px 0',
      medium: '16px 0',
      large: '32px 0',
    };

    return [
      'table',
      {
        style: `margin: 0 auto; border-collapse: collapse; width: 100%; padding: ${paddingMap[spacing] || paddingMap.medium};`,
        'data-type': 'styled-divider',
      },
      [
        'tr',
        {},
        [
          'td',
          { style: 'text-align: center;' },
          [
            'hr',
            {
              style: `border: none; border-top: 2px ${style} ${color}; width: ${width}%; margin: 0 auto;`,
            },
          ],
        ],
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DividerComponent);
  },
});
