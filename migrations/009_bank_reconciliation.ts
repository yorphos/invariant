import type { Migration } from '../src/lib/services/database';

// Migration 009: Bank Reconciliation
export const migration009: Migration = {
  id: '009',
  name: 'bank_reconciliation',
  up: `
    -- Bank reconciliation header table
    -- Tracks each reconciliation for a bank account to a statement
    CREATE TABLE IF NOT EXISTS bank_reconciliation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      statement_date TEXT NOT NULL,
      statement_balance DECIMAL(15, 2) NOT NULL,
      book_balance DECIMAL(15, 2) NOT NULL,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
      completed_at TEXT,
      completed_by TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES account(id)
    );

    CREATE INDEX idx_bank_recon_account ON bank_reconciliation(account_id);
    CREATE INDEX idx_bank_recon_date ON bank_reconciliation(statement_date);
    CREATE INDEX idx_bank_recon_status ON bank_reconciliation(status);

    -- Bank reconciliation items (transactions being reconciled)
    -- Links journal lines to reconciliation records
    CREATE TABLE IF NOT EXISTS bank_reconciliation_item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reconciliation_id INTEGER NOT NULL,
      journal_line_id INTEGER NOT NULL,
      is_cleared INTEGER NOT NULL DEFAULT 1,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (reconciliation_id) REFERENCES bank_reconciliation(id) ON DELETE CASCADE,
      FOREIGN KEY (journal_line_id) REFERENCES journal_line(id),
      UNIQUE (reconciliation_id, journal_line_id)
    );

    CREATE INDEX idx_bank_recon_item_recon ON bank_reconciliation_item(reconciliation_id);
    CREATE INDEX idx_bank_recon_item_line ON bank_reconciliation_item(journal_line_id);

    -- Add reconciliation status to journal_line
    -- NULL = unreconciled, otherwise references the reconciliation
    ALTER TABLE journal_line ADD COLUMN reconciliation_id INTEGER REFERENCES bank_reconciliation(id);
    CREATE INDEX idx_journal_line_reconciliation ON journal_line(reconciliation_id);
  `
};
