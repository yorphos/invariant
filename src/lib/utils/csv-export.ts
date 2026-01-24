/**
 * CSV Export Utility
 * 
 * Provides functions to export financial data to CSV format
 */

export interface CSVRow {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Convert an array of objects to CSV string
 */
export function toCSV(data: CSVRow[], headers?: string[]): string {
  if (data.length === 0) {
    return '';
  }

  // If headers not provided, use keys from first row
  const cols = headers || Object.keys(data[0]);

  // Create header row
  const csvRows: string[] = [cols.join(',')];

  // Create data rows
  for (const row of data) {
    const values = cols.map(col => {
      const value = row[col];
      
      // Handle undefined/null
      if (value === undefined || value === null) {
        return '';
      }

      // Convert to string
      const str = String(value);

      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }

      return str;
    });

    csvRows.push(values.join(','));
  }

  return csvRows.join('\n');
}

/**
 * Download CSV string as a file
 */
export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
}

/**
 * Format a number as currency string for CSV
 */
export function formatCurrencyForCSV(amount: number): string {
  return amount.toFixed(2);
}

/**
 * Format a date as ISO string for CSV
 */
export function formatDateForCSV(date: string | Date): string {
  if (typeof date === 'string') {
    return date.split('T')[0]; // Extract YYYY-MM-DD
  }
  return date.toISOString().split('T')[0];
}
