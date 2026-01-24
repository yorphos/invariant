import type { Migration } from '../src/lib/services/database';

// Migration 007: System Accounts Configuration
// Creates the system_account table for mapping logical roles to actual accounts.
// NOTE: System account mappings are now seeded in seed.ts AFTER accounts exist.
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

    CREATE INDEX IF NOT EXISTS idx_system_account_role ON system_account(role);
  `
};
