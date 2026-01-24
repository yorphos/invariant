import type { Migration } from '../src/lib/services/database';

// Migration 001: Core ledger schema
export const migration001: Migration = {
  id: '001',
  name: 'create_core_ledger_schema',
  up: `
    -- Settings table
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Insert default settings
    INSERT OR IGNORE INTO settings (key, value) VALUES 
      ('mode', 'beginner'),
      ('locale', 'CA'),
      ('fiscal_year_start', '01-01');

    -- Account table (Chart of Accounts)
    CREATE TABLE IF NOT EXISTS account (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
      parent_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES account(id)
    );

    CREATE INDEX idx_account_type ON account(type);
    CREATE INDEX idx_account_parent ON account(parent_id);

    -- Audit log table
    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'post', 'void')),
      user_id TEXT,
      changes TEXT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
    CREATE INDEX idx_audit_timestamp ON audit_log(timestamp);

    -- Transaction event table (high-level business events)
    CREATE TABLE IF NOT EXISTS transaction_event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      description TEXT NOT NULL,
      reference TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_by TEXT,
      metadata TEXT
    );

    CREATE INDEX idx_event_type ON transaction_event(event_type);
    CREATE INDEX idx_event_created ON transaction_event(created_at);

    -- Journal entry header
    CREATE TABLE IF NOT EXISTS journal_entry (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER,
      entry_date DATE NOT NULL,
      description TEXT NOT NULL,
      reference TEXT,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'void')),
      posted_at TEXT,
      posted_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES transaction_event(id)
    );

    CREATE INDEX idx_journal_status ON journal_entry(status);
    CREATE INDEX idx_journal_date ON journal_entry(entry_date);
    CREATE INDEX idx_journal_event ON journal_entry(event_id);

    -- Journal line (debit/credit entries)
    CREATE TABLE IF NOT EXISTS journal_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      journal_entry_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      debit_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      credit_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      description TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES account(id),
      CHECK ((debit_amount > 0 AND credit_amount = 0) OR (credit_amount > 0 AND debit_amount = 0))
    );

    CREATE INDEX idx_journal_line_entry ON journal_line(journal_entry_id);
    CREATE INDEX idx_journal_line_account ON journal_line(account_id);
  `
};
