import { describe, it, expect } from 'vitest';
import { parseCSV, generateCSV, LeadCsvRow, leadCsvHeaderMap, leadCsvColumns } from './csv-utils';

describe('parseCSV', () => {
  const requiredFields: (keyof LeadCsvRow)[] = ['email'];

  it('parses valid CSV with headers', () => {
    const csv = `Email,Name,Phone
john@example.com,John Doe,123456
jane@example.com,Jane Doe,789012`;

    const result = parseCSV<LeadCsvRow>(csv, leadCsvHeaderMap, requiredFields);

    expect(result.errors).toHaveLength(0);
    expect(result.data).toHaveLength(2);
    expect(result.data[0].email).toBe('john@example.com');
    expect(result.data[0].name).toBe('John Doe');
    expect(result.data[1].email).toBe('jane@example.com');
  });

  it('handles Swedish headers', () => {
    const csv = `E-post,Namn,Telefon
test@example.com,Test Person,555-1234`;

    const result = parseCSV<LeadCsvRow>(csv, leadCsvHeaderMap, requiredFields);

    expect(result.errors).toHaveLength(0);
    expect(result.data).toHaveLength(1);
    expect(result.data[0].email).toBe('test@example.com');
    expect(result.data[0].name).toBe('Test Person');
  });

  it('reports error for empty CSV', () => {
    const csv = '';
    const result = parseCSV<LeadCsvRow>(csv, leadCsvHeaderMap, requiredFields);

    expect(result.errors).toContain('CSV file is empty or has no data rows');
    expect(result.data).toHaveLength(0);
  });

  it('reports error for missing required columns', () => {
    const csv = `Name,Phone
John,123456`;

    const result = parseCSV<LeadCsvRow>(csv, leadCsvHeaderMap, requiredFields);

    expect(result.errors.some(e => e.includes('Missing required columns'))).toBe(true);
    expect(result.data).toHaveLength(0);
  });

  it('reports error for rows missing required values', () => {
    const csv = `Email,Name
john@example.com,John
,Jane`;

    const result = parseCSV<LeadCsvRow>(csv, leadCsvHeaderMap, requiredFields);

    expect(result.data).toHaveLength(1);
    expect(result.errors.some(e => e.includes('Row 3'))).toBe(true);
  });

  it('handles quoted values with commas', () => {
    const csv = `Email,Name
john@example.com,"Doe, John"`;

    const result = parseCSV<LeadCsvRow>(csv, leadCsvHeaderMap, requiredFields);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('Doe, John');
  });

  it('handles escaped quotes', () => {
    const csv = `Email,Name
john@example.com,"John ""Johnny"" Doe"`;

    const result = parseCSV<LeadCsvRow>(csv, leadCsvHeaderMap, requiredFields);

    expect(result.data).toHaveLength(1);
    expect(result.data[0].name).toBe('John "Johnny" Doe');
  });

  it('handles Windows line endings', () => {
    const csv = "Email,Name\r\njohn@example.com,John\r\njane@example.com,Jane";

    const result = parseCSV<LeadCsvRow>(csv, leadCsvHeaderMap, requiredFields);

    expect(result.data).toHaveLength(2);
  });
});

describe('generateCSV', () => {
  it('generates CSV from data array', () => {
    const data = [
      { email: 'john@example.com', name: 'John', phone: '123', source: 'web', status: 'lead' },
      { email: 'jane@example.com', name: 'Jane', phone: '456', source: 'form', status: 'customer' },
    ];

    const csv = generateCSV(data, leadCsvColumns);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('Email,Name,Phone,Source,Status');
    expect(lines[1]).toContain('john@example.com');
    expect(lines[2]).toContain('jane@example.com');
  });

  it('escapes values with commas', () => {
    const data = [
      { email: 'test@example.com', name: 'Doe, John', phone: null, source: null, status: null },
    ];

    const csv = generateCSV(data, leadCsvColumns);

    expect(csv).toContain('"Doe, John"');
  });

  it('escapes values with quotes', () => {
    const data = [
      { email: 'test@example.com', name: 'John "Johnny" Doe', phone: null, source: null, status: null },
    ];

    const csv = generateCSV(data, leadCsvColumns);

    expect(csv).toContain('"John ""Johnny"" Doe"');
  });

  it('handles null values', () => {
    const data = [
      { email: 'test@example.com', name: null, phone: null, source: null, status: null },
    ];

    const csv = generateCSV(data, leadCsvColumns);
    const lines = csv.split('\n');

    expect(lines[1]).toBe('test@example.com,,,,');
  });

  it('generates empty CSV for empty data', () => {
    const csv = generateCSV([], leadCsvColumns);

    expect(csv).toBe('Email,Name,Phone,Source,Status');
  });
});
