import { Editor } from '@tiptap/react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { 
  Plus, 
  MousePointerClick, 
  MessageSquareQuote, 
  Minus, 
  User,
  Play,
  Share2,
} from 'lucide-react';

interface NewsletterBlockSelectorProps {
  editor: Editor;
}

const BLOCKS = [
  {
    category: 'Content',
    items: [
      {
        name: 'CTA Button',
        icon: MousePointerClick,
        description: 'Call-to-action button',
        action: (editor: Editor) => {
          editor.chain().focus().insertContent({
            type: 'ctaButton',
            attrs: {
              text: 'Click Here',
              url: '',
              backgroundColor: '#3b82f6',
              textColor: '#ffffff',
              alignment: 'center',
            },
          }).run();
        },
      },
      {
        name: 'Callout Box',
        icon: MessageSquareQuote,
        description: 'Highlight important info',
        action: (editor: Editor) => {
          editor.chain().focus().insertContent({
            type: 'calloutBox',
            attrs: {
              title: '',
              icon: 'info',
              backgroundColor: '#eff6ff',
              borderColor: '#3b82f6',
            },
            content: [{ type: 'text', text: 'Your callout text here...' }],
          }).run();
        },
      },
      {
        name: 'Video',
        icon: Play,
        description: 'Video thumbnail with link',
        action: (editor: Editor) => {
          editor.chain().focus().insertContent({
            type: 'videoThumbnail',
            attrs: {
              thumbnailUrl: '',
              videoUrl: '',
              caption: '',
            },
          }).run();
        },
      },
    ],
  },
  {
    category: 'Layout',
    items: [
      {
        name: 'Divider',
        icon: Minus,
        description: 'Visual separator',
        action: (editor: Editor) => {
          editor.chain().focus().insertContent({
            type: 'styledDivider',
            attrs: {
              style: 'solid',
              color: '#e5e7eb',
              width: '100',
              spacing: 'medium',
            },
          }).run();
        },
      },
    ],
  },
  {
    category: 'Signature & Social',
    items: [
      {
        name: 'Author Block',
        icon: User,
        description: 'Sign-off with photo',
        action: (editor: Editor) => {
          editor.chain().focus().insertContent({
            type: 'authorBlock',
            attrs: {
              name: '',
              role: '',
              imageUrl: '',
              bio: '',
            },
          }).run();
        },
      },
      {
        name: 'Social Follow',
        icon: Share2,
        description: 'Social media links',
        action: (editor: Editor) => {
          editor.chain().focus().insertContent({
            type: 'socialFollow',
            attrs: {
              links: '[]',
              style: 'icons',
              alignment: 'center',
            },
          }).run();
        },
      },
    ],
  },
];

export function NewsletterBlockSelector({ editor }: NewsletterBlockSelectorProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          <Plus className="h-4 w-4" />
          Block
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        {BLOCKS.map((category, categoryIndex) => (
          <div key={category.category}>
            {categoryIndex > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              {category.category}
            </DropdownMenuLabel>
            {category.items.map((block) => (
              <DropdownMenuItem
                key={block.name}
                onClick={() => block.action(editor)}
                className="flex items-center gap-2 cursor-pointer"
              >
                <block.icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <div className="font-medium">{block.name}</div>
                  <div className="text-xs text-muted-foreground">{block.description}</div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
