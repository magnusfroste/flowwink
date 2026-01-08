import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import type { TableBlockData, TableColumn } from '@/components/public/blocks/TableBlock';

interface TableBlockEditorProps {
  data: TableBlockData;
  onChange: (data: TableBlockData) => void;
  isEditing: boolean;
}

export function TableBlockEditor({ data, onChange, isEditing }: TableBlockEditorProps) {
  const columns = data.columns || [];
  const rows = data.rows || [];

  const addColumn = () => {
    const newColumn: TableColumn = {
      id: `col-${Date.now()}`,
      header: `Kolumn ${columns.length + 1}`,
      align: 'left',
    };
    onChange({ ...data, columns: [...columns, newColumn] });
  };

  const updateColumn = (index: number, updates: Partial<TableColumn>) => {
    const updated = columns.map((col, i) =>
      i === index ? { ...col, ...updates } : col
    );
    onChange({ ...data, columns: updated });
  };

  const removeColumn = (index: number) => {
    const columnId = columns[index].id;
    const updatedColumns = columns.filter((_, i) => i !== index);
    const updatedRows = rows.map((row) => {
      const newRow = { ...row };
      delete newRow[columnId];
      return newRow;
    });
    onChange({ ...data, columns: updatedColumns, rows: updatedRows });
  };

  const addRow = () => {
    const newRow: Record<string, string> = {};
    columns.forEach((col) => {
      newRow[col.id] = '';
    });
    onChange({ ...data, rows: [...rows, newRow] });
  };

  const updateCell = (rowIndex: number, columnId: string, value: string) => {
    const updated = rows.map((row, i) =>
      i === rowIndex ? { ...row, [columnId]: value } : row
    );
    onChange({ ...data, rows: updated });
  };

  const removeRow = (index: number) => {
    onChange({ ...data, rows: rows.filter((_, i) => i !== index) });
  };

  if (!isEditing) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p className="font-medium">{data.title || 'Tabell'}</p>
        <p className="text-sm">{columns.length} kolumner, {rows.length} rader</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Basic Settings */}
      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="title">Rubrik (valfri)</Label>
          <Input
            id="title"
            value={data.title || ''}
            onChange={(e) => onChange({ ...data, title: e.target.value })}
            placeholder="Tabellrubrik..."
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="caption">Beskrivning (valfri)</Label>
          <Input
            id="caption"
            value={data.caption || ''}
            onChange={(e) => onChange({ ...data, caption: e.target.value })}
            placeholder="Tabellbeskrivning under tabellen..."
          />
        </div>
      </div>

      {/* Style Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>Variant</Label>
          <Select
            value={data.variant || 'default'}
            onValueChange={(value: 'default' | 'striped' | 'bordered' | 'minimal') =>
              onChange({ ...data, variant: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="default">Standard</SelectItem>
              <SelectItem value="striped">Striped</SelectItem>
              <SelectItem value="bordered">Bordered</SelectItem>
              <SelectItem value="minimal">Minimal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>Size</Label>
          <Select
            value={data.size || 'md'}
            onValueChange={(value: 'sm' | 'md' | 'lg') =>
              onChange({ ...data, size: value })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="sm">Liten</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Stor</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Toggle Options */}
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <Switch
            checked={data.stickyHeader || false}
            onCheckedChange={(checked) => onChange({ ...data, stickyHeader: checked })}
          />
          <Label>Fast rubrikrad</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={data.highlightOnHover !== false}
            onCheckedChange={(checked) => onChange({ ...data, highlightOnHover: checked })}
          />
          <Label>Markera vid hover</Label>
        </div>
      </div>

      {/* Columns */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium">Kolumner</Label>
          <Button variant="outline" size="sm" onClick={addColumn}>
            <Plus className="h-4 w-4 mr-1" />
            Lägg till kolumn
          </Button>
        </div>

        {columns.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
            Lägg till kolumner för att skapa tabellen
          </p>
        ) : (
          <div className="space-y-2">
            {columns.map((column, index) => (
              <div
                key={column.id}
                className="flex items-center gap-2 p-2 border rounded-lg bg-card"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={column.header}
                  onChange={(e) => updateColumn(index, { header: e.target.value })}
                  placeholder="Kolumnnamn..."
                  className="flex-1"
                />
                <Select
                  value={column.align || 'left'}
                  onValueChange={(value: 'left' | 'center' | 'right') =>
                    updateColumn(index, { align: value })
                  }
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">Vänster</SelectItem>
                    <SelectItem value="center">Center</SelectItem>
                    <SelectItem value="right">Höger</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeColumn(index)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rows */}
      {columns.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Rader</Label>
            <Button variant="outline" size="sm" onClick={addRow}>
              <Plus className="h-4 w-4 mr-1" />
              Lägg till rad
            </Button>
          </div>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-lg">
              Lägg till rader för att fylla tabellen med data
            </p>
          ) : (
            <div className="space-y-3 overflow-x-auto">
              {rows.map((row, rowIndex) => (
                <div
                  key={rowIndex}
                  className="flex items-start gap-2 p-3 border rounded-lg bg-card"
                >
                  <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
                    {columns.map((column) => (
                      <div key={column.id}>
                        <Label className="text-xs text-muted-foreground mb-1 block">
                          {column.header}
                        </Label>
                        <Input
                          value={row[column.id] || ''}
                          onChange={(e) => updateCell(rowIndex, column.id, e.target.value)}
                          placeholder="..."
                        />
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(rowIndex)}
                    className="text-destructive hover:text-destructive mt-5"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
