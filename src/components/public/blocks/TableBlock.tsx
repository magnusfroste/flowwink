import { cn } from '@/lib/utils';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export interface TableColumn {
  id: string;
  header: string;
  align?: 'left' | 'center' | 'right';
}

export interface TableBlockData {
  title?: string;
  caption?: string;
  columns: TableColumn[];
  rows: Record<string, string>[];
  variant: 'default' | 'striped' | 'bordered' | 'minimal';
  size: 'sm' | 'md' | 'lg';
  stickyHeader?: boolean;
  highlightOnHover?: boolean;
}

interface TableBlockProps {
  data: TableBlockData;
}

export function TableBlock({ data }: TableBlockProps) {
  const {
    title,
    caption,
    columns = [],
    rows = [],
    variant = 'default',
    size = 'md',
    stickyHeader = false,
    highlightOnHover = true,
  } = data;

  if (columns.length === 0) {
    return (
      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 text-center text-muted-foreground">
          Lägg till kolumner för att visa tabellen
        </div>
      </section>
    );
  }

  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  const cellPaddingClasses = {
    sm: 'px-3 py-2',
    md: 'px-4 py-3',
    lg: 'px-6 py-4',
  };

  const getAlignClass = (align?: 'left' | 'center' | 'right') => {
    switch (align) {
      case 'center':
        return 'text-center';
      case 'right':
        return 'text-right';
      default:
        return 'text-left';
    }
  };

  return (
    <section className="py-12">
      <div className="max-w-6xl mx-auto px-4">
        {title && (
          <h2 className="text-2xl md:text-3xl font-serif font-medium mb-6 text-center">
            {title}
          </h2>
        )}

        <div
          className={cn(
            'relative w-full overflow-auto rounded-lg',
            variant === 'bordered' && 'border',
            stickyHeader && 'max-h-[500px]'
          )}
        >
          <Table className={cn(sizeClasses[size])}>
            {caption && (
              <caption className="mt-4 text-sm text-muted-foreground">
                {caption}
              </caption>
            )}
            <TableHeader
              className={cn(
                stickyHeader && 'sticky top-0 z-10',
                variant === 'default' && 'bg-muted/50',
                variant === 'striped' && 'bg-muted/50',
                variant === 'bordered' && 'bg-muted/30',
                variant === 'minimal' && 'border-b-2'
              )}
            >
              <TableRow className={cn(variant === 'bordered' && 'border-b')}>
                {columns.map((column) => (
                  <TableHead
                    key={column.id}
                    className={cn(
                      cellPaddingClasses[size],
                      getAlignClass(column.align),
                      'font-semibold'
                    )}
                  >
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, rowIndex) => (
                <TableRow
                  key={rowIndex}
                  className={cn(
                    highlightOnHover && 'hover:bg-muted/50',
                    variant === 'striped' && rowIndex % 2 === 1 && 'bg-muted/30',
                    variant === 'bordered' && 'border-b'
                  )}
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      className={cn(
                        cellPaddingClasses[size],
                        getAlignClass(column.align)
                      )}
                    >
                      {row[column.id] || ''}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="text-center text-muted-foreground py-8"
                  >
                    Inga rader tillagda
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </section>
  );
}
