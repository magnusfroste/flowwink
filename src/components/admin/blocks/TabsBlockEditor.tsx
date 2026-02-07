import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { useBlockEditor } from '@/hooks/useBlockEditor';
import { Plus, Trash2, GripVertical, Layers, Bold, Italic, List, ListOrdered } from 'lucide-react';
import { IconPicker } from '../IconPicker';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { TabsBlockData, TabItem } from '@/components/public/blocks/TabsBlock';
import type { TiptapDocument } from '@/types/cms';
import { AITiptapToolbar } from '../AITiptapToolbar';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';

interface TabsBlockEditorProps {
  data: TabsBlockData;
  onChange: (data: TabsBlockData) => void;
  isEditing: boolean;
}

function TabItemEditor({
  tab,
  onUpdate,
  onDelete,
}: {
  tab: TabItem;
  onUpdate: (tab: TabItem) => void;
  onDelete: () => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: typeof tab.content === 'string' ? tab.content : tab.content,
    onUpdate: ({ editor }) => {
      onUpdate({ ...tab, content: editor.getJSON() as TiptapDocument });
    },
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <GripVertical className="h-5 w-5 text-muted-foreground/50 cursor-grab" />
        <div className="flex-1 grid grid-cols-2 gap-3">
          <Input
            value={tab.title}
            onChange={(e) => onUpdate({ ...tab, title: e.target.value })}
            placeholder="Tab title"
          />
          <IconPicker
            value={tab.icon || ''}
            onChange={(icon) => onUpdate({ ...tab, icon })}
          />
        </div>
        <Button variant="ghost" size="icon" onClick={onDelete}>
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <div className="border rounded-lg overflow-hidden">
        {editor && (
          <div className="border-b px-2 py-1.5 flex items-center gap-1 bg-muted/30">
            <Toggle size="sm" pressed={editor.isActive('bold')} onPressedChange={() => editor.chain().focus().toggleBold().run()}>
              <Bold className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle size="sm" pressed={editor.isActive('italic')} onPressedChange={() => editor.chain().focus().toggleItalic().run()}>
              <Italic className="h-3.5 w-3.5" />
            </Toggle>
            <Separator orientation="vertical" className="h-5 mx-1" />
            <Toggle size="sm" pressed={editor.isActive('bulletList')} onPressedChange={() => editor.chain().focus().toggleBulletList().run()}>
              <List className="h-3.5 w-3.5" />
            </Toggle>
            <Toggle size="sm" pressed={editor.isActive('orderedList')} onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}>
              <ListOrdered className="h-3.5 w-3.5" />
            </Toggle>
            <Separator orientation="vertical" className="h-5 mx-1" />
            <AITiptapToolbar editor={editor} context="tab content" />
          </div>
        )}
        <EditorContent editor={editor} className="tiptap prose prose-sm max-w-none p-3 min-h-[100px]" />
      </div>
    </Card>
  );
}

export function TabsBlockEditor({ data, onChange, isEditing }: TabsBlockEditorProps) {
  const { data: blockData, updateField } = useBlockEditor({
    initialData: data,
    onChange,
  });

  const addTab = () => {
    const newTab: TabItem = {
      id: `tab-${Date.now()}`,
      title: `Tab ${(blockData.tabs?.length || 0) + 1}`,
      content: '',
    };
    updateField('tabs', [...(blockData.tabs || []), newTab]);
  };

  const updateTab = (index: number, tab: TabItem) => {
    const newTabs = [...(blockData.tabs || [])];
    newTabs[index] = tab;
    updateField('tabs', newTabs);
  };

  const deleteTab = (index: number) => {
    const newTabs = (blockData.tabs || []).filter((_, i) => i !== index);
    updateField('tabs', newTabs);
  };

  if (isEditing) {
    return (
      <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Title (optional)</Label>
            <Input
              value={blockData.title || ''}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="Section title"
            />
          </div>
          <div className="space-y-2">
            <Label>Subtitle (optional)</Label>
            <Input
              value={blockData.subtitle || ''}
              onChange={(e) => updateField('subtitle', e.target.value)}
              placeholder="Section subtitle"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Orientation</Label>
            <Select
              value={blockData.orientation || 'horizontal'}
              onValueChange={(value) => updateField('orientation', value as 'horizontal' | 'vertical')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="horizontal">Horizontal</SelectItem>
                <SelectItem value="vertical">Vertical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Variant</Label>
            <Select
              value={blockData.variant || 'underline'}
              onValueChange={(value) => updateField('variant', value as 'underline' | 'pills' | 'boxed')}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="underline">Underline</SelectItem>
                <SelectItem value="pills">Pills</SelectItem>
                <SelectItem value="boxed">Boxed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Tabs</Label>
            <Button variant="outline" size="sm" onClick={addTab}>
              <Plus className="h-4 w-4 mr-1" />
              Add Tab
            </Button>
          </div>
          
          {(blockData.tabs || []).map((tab, index) => (
            <TabItemEditor
              key={tab.id}
              tab={tab}
              onUpdate={(updated) => updateTab(index, updated)}
              onDelete={() => deleteTab(index)}
            />
          ))}

          {(!blockData.tabs || blockData.tabs.length === 0) && (
            <div className="text-center py-8 text-muted-foreground border-2 border-dashed rounded-lg">
              No tabs yet. Click "Add Tab" to create one.
            </div>
          )}
        </div>
      </div>
    );
  }

  // Preview mode
  if (!blockData.tabs || blockData.tabs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 bg-muted/50 rounded-lg border-2 border-dashed border-muted-foreground/30">
        <Layers className="h-10 w-10 text-muted-foreground/50 mb-2" />
        <p className="text-sm text-muted-foreground">No tabs configured</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex gap-2 border-b pb-2 mb-4">
        {blockData.tabs.map((tab, index) => (
          <div
            key={tab.id}
            className={`px-3 py-1.5 text-sm rounded-t ${index === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
          >
            {tab.title}
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {blockData.tabs.length} tab{blockData.tabs.length !== 1 ? 's' : ''} configured
      </p>
    </div>
  );
}
