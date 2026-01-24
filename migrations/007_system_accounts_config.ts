import type { Migration } from '../src/lib/services/database';

// Migration 007: System Accounts Configuration
export const migration007: Migration = {
  id: '007',
  name: 'system_accounts_config',
  up: `
    -- System accounts configuration table
    -- Maps logical account roles to actual account IDs
    CREATE TABLE IF NOT EXISTS system_account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL UNIQUE,
      account_id INTEGER NOT NULL,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES account(id)
    );

    CREATE INDEX idx_system_account_role ON system_account(role);

    -- Seed default system account mappings
    INSERT INTO system_account (role, account_id, description)
    SELECT 'accounts_receivable', a.id, 'Primary A/R account for customer invoices'
    FROM account a
    WHERE a.code = '1100'
    LIMIT 1;

    INSERT INTO system_account (role, account_id, description)
    SELECT 'accounts_payable', a.id, 'Primary A/P account for vendor bills'
    FROM account a
    WHERE a.code = '2000'
    LIMIT 1;

    INSERT INTO system_account (role, account_id, description)
    SELECT 'sales_tax_payable', a.id, 'Sales tax collected (HST/GST/PST)'
    FROM account a
    WHERE a.code = '2220'
    LIMIT 1;

    INSERT INTO system_account (role, account_id, description)
    SELECT 'retained_earnings', a.id, 'Retained earnings from prior periods'
    FROM account a
    WHERE a.code = '3100'
    LIMIT 1;

    INSERT INTO system_account (role, account_id, description)
    SELECT 'current_year_earnings', a.id, 'Net income for current fiscal year'
    FROM account a
    WHERE a.code = '3900'
    LIMIT 1;
  `
};
