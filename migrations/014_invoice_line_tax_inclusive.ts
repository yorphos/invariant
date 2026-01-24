import type { Migration } from '../src/lib/services/database';

// Migration 014: Add tax inclusive flag to invoice lines
export const migration014: Migration = {
  id: '014',
  name: 'invoice_line_tax_inclusive',
  up: `
    ALTER TABLE invoice_line
    ADD COLUMN is_tax_inclusive INTEGER NOT NULL DEFAULT 0;
  `
};
