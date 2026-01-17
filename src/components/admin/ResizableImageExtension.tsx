import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { AlignLeft, AlignCenter, AlignRight, Trash2, GripHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';

function ResizableImageComponent({ node, updateAttributes, deleteNode, selected }: NodeViewProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const src = node.attrs.src as string;
  const alt = node.attrs.alt as string | undefined;
  const width = node.attrs.width as number | undefined;
  const align = (node.attrs.align as 'left' | 'center' | 'right') || 'center';

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    startXRef.current = e.clientX;
    startWidthRef.current = imageRef.current?.offsetWidth || 300;
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isResizing) return;
    
    const diff = e.clientX - startXRef.current;
    const newWidth = Math.max(100, Math.min(800, startWidthRef.current + diff));
    updateAttributes({ width: newWidth });
  }, [isResizing, updateAttributes]);

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizing, handleMouseMove, handleMouseUp]);

  const alignmentClass = {
    left: 'mr-auto',
    center: 'mx-auto',
    right: 'ml-auto',
  }[align];

  return (
    <NodeViewWrapper className="relative my-4">
      <div
        ref={containerRef}
        className={`relative inline-block ${alignmentClass}`}
        style={{ display: 'block', textAlign: align }}
        onMouseEnter={() => setShowControls(true)}
        onMouseLeave={() => !isResizing && setShowControls(false)}
      >
        <div 
          className={`relative inline-block transition-shadow ${
            selected || showControls ? 'ring-2 ring-primary ring-offset-2 rounded-lg' : ''
          }`}
          style={{ width: width ? `${width}px` : 'auto', maxWidth: '100%' }}
        >
          <img
            ref={imageRef}
            src={src}
            alt={alt || ''}
            className="max-w-full h-auto rounded-lg block"
            style={{ width: '100%' }}
            draggable={false}
          />
          
          {/* Resize handle */}
          {(selected || showControls) && (
            <div
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2 w-4 h-12 bg-primary rounded-full cursor-ew-resize flex items-center justify-center shadow-lg hover:bg-primary/90 transition-colors"
              onMouseDown={handleMouseDown}
            >
              <GripHorizontal className="h-3 w-3 text-primary-foreground rotate-90" />
            </div>
          )}
          
          {/* Controls toolbar */}
          {(selected || showControls) && (
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-popover border rounded-lg shadow-lg p-1">
              <Button
                variant={align === 'left' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => updateAttributes({ align: 'left' })}
              >
                <AlignLeft className="h-4 w-4" />
              </Button>
              <Button
                variant={align === 'center' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => updateAttributes({ align: 'center' })}
              >
                <AlignCenter className="h-4 w-4" />
              </Button>
              <Button
                variant={align === 'right' ? 'secondary' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => updateAttributes({ align: 'right' })}
              >
                <AlignRight className="h-4 w-4" />
              </Button>
              <div className="w-px h-6 bg-border mx-1" />
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={deleteNode}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const ResizableImage = Node.create({
  name: 'image',
  
  group: 'block',
  
  atom: true,
  
  draggable: true,
  
  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      width: {
        default: null,
      },
      align: {
        default: 'center',
      },
    };
  },
  
  parseHTML() {
    return [
      {
        tag: 'img[src]',
      },
    ];
  },
  
  renderHTML({ HTMLAttributes }) {
    const { align, width, ...rest } = HTMLAttributes;
    const style = [
      width ? `width: ${width}px` : '',
      'max-width: 100%',
      'height: auto',
    ].filter(Boolean).join('; ');
    
    const wrapperStyle = align === 'center' ? 'text-align: center' : 
                         align === 'right' ? 'text-align: right' : '';
    
    return ['div', { style: wrapperStyle }, ['img', mergeAttributes(rest, { style })]];
  },
  
  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageComponent);
  },
});
