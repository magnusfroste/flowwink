// CSV parsing and generation utilities

export interface CsvParseResult<T> {
  data: T[];
  errors: string[];
  rowCount: number;
}

export function parseCSV<T>(
  csvText: string,
  headerMap: Record<string, keyof T>,
  requiredFields: (keyof T)[]
): CsvParseResult<T> {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) {
    return { data: [], errors: ['CSV file is empty or has no data rows'], rowCount: 0 };
  }

  const headers = parseCSVLine(lines[0]);
  const errors: string[] = [];
  const data: T[] = [];

  // Map CSV headers to object keys
  const columnMap: Map<number, keyof T> = new Map();
  headers.forEach((header, index) => {
    const normalizedHeader = header.toLowerCase().trim();
    const mappedKey = headerMap[normalizedHeader];
    if (mappedKey) {
      columnMap.set(index, mappedKey);
    }
  });

  // Check if required fields are present
  const mappedKeys = new Set(columnMap.values());
  const missingRequired = requiredFields.filter(field => !mappedKeys.has(field));
  if (missingRequired.length > 0) {
    errors.push(`Missing required columns: ${missingRequired.join(', ')}`);
    return { data: [], errors, rowCount: 0 };
  }

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row: Partial<T> = {};
    
    columnMap.forEach((key, colIndex) => {
      const value = values[colIndex]?.trim() ?? '';
      (row as Record<string, unknown>)[key as string] = value || null;
    });

    // Validate required fields have values
    const rowMissingFields = requiredFields.filter(
      field => !row[field] || (row[field] as string).trim() === ''
    );
    
    if (rowMissingFields.length > 0) {
      errors.push(`Row ${i + 1}: Missing required values for ${rowMissingFields.join(', ')}`);
      continue;
    }

    data.push(row as T);
  }

  return { data, errors, rowCount: lines.length - 1 };
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

export function generateCSV<T extends Record<string, unknown>>(
  data: T[],
  columns: { key: keyof T; header: string }[]
): string {
  const headers = columns.map(col => escapeCSVValue(col.header));
  const rows = data.map(item =>
    columns.map(col => escapeCSVValue(String(item[col.key] ?? '')))
  );
  
  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Lead CSV config
export const leadCsvHeaderMap: Record<string, keyof LeadCsvRow> = {
  'email': 'email',
  'e-post': 'email',
  'name': 'name',
  'namn': 'name',
  'phone': 'phone',
  'telefon': 'phone',
  'source': 'source',
  'källa': 'source',
  'status': 'status',
};

export interface LeadCsvRow {
  email: string;
  name: string | null;
  phone: string | null;
  source: string | null;
  status: string | null;
}

export const leadCsvColumns: { key: keyof LeadCsvRow; header: string }[] = [
  { key: 'email', header: 'Email' },
  { key: 'name', header: 'Name' },
  { key: 'phone', header: 'Phone' },
  { key: 'source', header: 'Source' },
  { key: 'status', header: 'Status' },
];

// Company CSV config
export const companyCsvHeaderMap: Record<string, keyof CompanyCsvRow> = {
  'name': 'name',
  'namn': 'name',
  'company': 'name',
  'företag': 'name',
  'domain': 'domain',
  'domän': 'domain',
  'industry': 'industry',
  'bransch': 'industry',
  'size': 'size',
  'storlek': 'size',
  'website': 'website',
  'webbplats': 'website',
  'phone': 'phone',
  'telefon': 'phone',
  'address': 'address',
  'adress': 'address',
};

export interface CompanyCsvRow {
  name: string;
  domain: string | null;
  industry: string | null;
  size: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
}

export const companyCsvColumns: { key: keyof CompanyCsvRow; header: string }[] = [
  { key: 'name', header: 'Name' },
  { key: 'domain', header: 'Domain' },
  { key: 'industry', header: 'Industry' },
  { key: 'size', header: 'Size' },
  { key: 'website', header: 'Website' },
  { key: 'phone', header: 'Phone' },
  { key: 'address', header: 'Address' },
];
