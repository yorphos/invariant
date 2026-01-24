import { describe, it, expect } from 'vitest';
import { toCSV, formatCurrencyForCSV, formatDateForCSV } from '../../lib/utils/csv-export';

/**
 * CSV Export Utility Tests
 */

describe('CSV Export - Basic Conversion', () => {
  it('should convert simple data to CSV', () => {
    const data = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];

    const csv = toCSV(data);

    expect(csv).toBe('name,age\nAlice,30\nBob,25');
  });

  it('should handle empty array', () => {
    const csv = toCSV([]);

    expect(csv).toBe('');
  });

  it('should use custom headers', () => {
    const data = [
      { first: 'Alice', last: 'Smith' },
      { first: 'Bob', last: 'Jones' },
    ];

    const csv = toCSV(data, ['first', 'last']);

    expect(csv).toBe('first,last\nAlice,Smith\nBob,Jones');
  });

  it('should handle missing values', () => {
    const data = [
      { name: 'Alice', age: 30 },
      { name: 'Bob' }, // age missing
    ];

    const csv = toCSV(data);

    expect(csv).toBe('name,age\nAlice,30\nBob,');
  });
});

describe('CSV Export - Special Characters', () => {
  it('should escape commas', () => {
    const data = [
      { name: 'Smith, John', age: 30 },
    ];

    const csv = toCSV(data);

    expect(csv).toBe('name,age\n"Smith, John",30');
  });

  it('should escape quotes', () => {
    const data = [
      { name: 'John "Johnny" Smith', age: 30 },
    ];

    const csv = toCSV(data);

    expect(csv).toBe('name,age\n"John ""Johnny"" Smith",30');
  });

  it('should escape newlines', () => {
    const data = [
      { name: 'John\nSmith', age: 30 },
    ];

    const csv = toCSV(data);

    expect(csv).toBe('name,age\n"John\nSmith",30');
  });

  it('should handle multiple special characters', () => {
    const data = [
      { description: 'Invoice for "Acme, Inc."\nDue: Jan 1' },
    ];

    const csv = toCSV(data);

    expect(csv).toContain('"Invoice for ""Acme, Inc.""\nDue: Jan 1"');
  });
});

describe('CSV Export - Financial Data', () => {
  it('should export account balances', () => {
    const data = [
      { account: '1000 - Cash', balance: 5000.50 },
      { account: '1100 - Accounts Receivable', balance: 2500.25 },
    ];

    const csv = toCSV(data);

    expect(csv).toContain('1000 - Cash');
    expect(csv).toContain('5000.5');
    expect(csv).toContain('2500.25');
  });

  it('should export trial balance', () => {
    const data = [
      { code: '1000', account: 'Cash', debit: 5000, credit: 0 },
      { code: '3000', account: 'Equity', debit: 0, credit: 5000 },
    ];

    const csv = toCSV(data);

    const lines = csv.split('\n');
    expect(lines[0]).toBe('code,account,debit,credit');
    expect(lines.length).toBe(3); // header + 2 data rows
  });

  it('should export profit & loss', () => {
    const data = [
      { account: 'Sales Revenue', amount: 10000 },
      { account: 'Cost of Goods Sold', amount: 6000 },
      { account: 'Operating Expenses', amount: 2000 },
    ];

    const csv = toCSV(data);

    expect(csv).toContain('Sales Revenue,10000');
  });
});

describe('CSV Export - Formatting Helpers', () => {
  it('should format currency with 2 decimals', () => {
    expect(formatCurrencyForCSV(1234.5)).toBe('1234.50');
    expect(formatCurrencyForCSV(0.1)).toBe('0.10');
    expect(formatCurrencyForCSV(1000)).toBe('1000.00');
  });

  it('should format negative currency', () => {
    expect(formatCurrencyForCSV(-500.75)).toBe('-500.75');
  });

  it('should format very small amounts', () => {
    expect(formatCurrencyForCSV(0.01)).toBe('0.01');
    expect(formatCurrencyForCSV(0.001)).toBe('0.00'); // Rounds to 2 decimals
  });

  it('should format dates from string', () => {
    expect(formatDateForCSV('2026-01-24')).toBe('2026-01-24');
    expect(formatDateForCSV('2026-01-24T10:30:00Z')).toBe('2026-01-24');
  });

  it('should format dates from Date object', () => {
    const date = new Date('2026-01-24T10:30:00Z');
    const formatted = formatDateForCSV(date);
    
    expect(formatted).toBe('2026-01-24');
  });
});

describe('CSV Export - Edge Cases', () => {
  it('should handle null values', () => {
    const data = [
      { name: 'Alice', notes: null },
    ];

    const csv = toCSV(data);

    expect(csv).toBe('name,notes\nAlice,');
  });

  it('should handle undefined values', () => {
    const data = [
      { name: 'Alice', notes: undefined },
    ];

    const csv = toCSV(data);

    expect(csv).toBe('name,notes\nAlice,');
  });

  it('should handle zero values', () => {
    const data = [
      { account: 'Test', balance: 0 },
    ];

    const csv = toCSV(data);

    expect(csv).toBe('account,balance\nTest,0');
  });

  it('should handle boolean values', () => {
    const data = [
      { name: 'Account', is_active: true },
      { name: 'Another', is_active: false },
    ];

    const csv = toCSV(data);

    expect(csv).toContain('true');
    expect(csv).toContain('false');
  });

  it('should handle large numbers', () => {
    const data = [
      { amount: 1000000.50 },
    ];

    const csv = toCSV(data);

    expect(csv).toContain('1000000.5');
  });
});
