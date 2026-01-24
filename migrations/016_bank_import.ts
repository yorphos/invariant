import type { Migration } from '../src/lib/services/database';

// Migration 016: Bank Import
// Adds support for importing bank statements from CSV and QBO files
export const migration016: Migration = {
  id: '016',
  name: 'bank_import',
  up: `
    -- Bank statement import table
    -- Tracks imported bank statement files and their processing status
    CREATE TABLE IF NOT EXISTS bank_statement_import (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id INTEGER NOT NULL,
      import_date TEXT NOT NULL DEFAULT (datetime('now')),
      file_name TEXT NOT NULL,
      file_format TEXT NOT NULL CHECK (file_format IN ('csv', 'qbo', 'ofx')),
      statement_start_date TEXT,
      statement_end_date TEXT,
      opening_balance DECIMAL(15, 2),
      closing_balance DECIMAL(15, 2),
      total_transactions INTEGER NOT NULL DEFAULT 0,
      imported_transactions INTEGER NOT NULL DEFAULT 0,
      matched_transactions INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
      error_message TEXT,
      imported_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES account(id)
    );

    CREATE INDEX idx_bank_import_account ON bank_statement_import(account_id);
    CREATE INDEX idx_bank_import_date ON bank_statement_import(import_date);
    CREATE INDEX idx_bank_import_status ON bank_statement_import(status);

    -- Bank statement transaction table
    -- Individual transactions from imported statements
    CREATE TABLE IF NOT EXISTS bank_statement_transaction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      import_id INTEGER NOT NULL,
      transaction_date TEXT NOT NULL,
      post_date TEXT,
      description TEXT NOT NULL,
      reference_number TEXT,
      check_number TEXT,
      payee TEXT,
      amount DECIMAL(15, 2) NOT NULL,
      balance DECIMAL(15, 2),
      transaction_type TEXT CHECK (transaction_type IN ('debit', 'credit', 'check', 'deposit', 'fee', 'interest', 'withdrawal', 'transfer', 'other')),
      category TEXT,
      memo TEXT,
      -- Matching status
      match_status TEXT NOT NULL DEFAULT 'unmatched' CHECK (match_status IN ('unmatched', 'auto_matched', 'manual_matched', 'imported', 'ignored')),
      matched_journal_entry_id INTEGER,
      matched_confidence REAL,
      -- Suggested categorization
      suggested_account_id INTEGER,
      suggested_contact_id INTEGER,
      suggestion_confidence REAL,
      -- Import tracking
      imported_as_journal_entry_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (import_id) REFERENCES bank_statement_import(id) ON DELETE CASCADE,
      FOREIGN KEY (matched_journal_entry_id) REFERENCES journal_entry(id),
      FOREIGN KEY (imported_as_journal_entry_id) REFERENCES journal_entry(id),
      FOREIGN KEY (suggested_account_id) REFERENCES account(id),
      FOREIGN KEY (suggested_contact_id) REFERENCES contact(id)
    );

    CREATE INDEX idx_bank_txn_import ON bank_statement_transaction(import_id);
    CREATE INDEX idx_bank_txn_date ON bank_statement_transaction(transaction_date);
    CREATE INDEX idx_bank_txn_match_status ON bank_statement_transaction(match_status);
    CREATE INDEX idx_bank_txn_matched_entry ON bank_statement_transaction(matched_journal_entry_id);

    -- Auto-categorization rules
    -- User-defined rules for automatically categorizing imported transactions
    CREATE TABLE IF NOT EXISTS categorization_rule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_name TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      -- Matching conditions (any can be null for "don't care")
      description_pattern TEXT,
      payee_pattern TEXT,
      amount_min DECIMAL(15, 2),
      amount_max DECIMAL(15, 2),
      transaction_type TEXT,
      -- Actions to take when matched
      assign_account_id INTEGER,
      assign_contact_id INTEGER,
      assign_category TEXT,
      notes_template TEXT,
      -- Statistics
      times_applied INTEGER NOT NULL DEFAULT 0,
      last_applied_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (assign_account_id) REFERENCES account(id),
      FOREIGN KEY (assign_contact_id) REFERENCES contact(id)
    );

    CREATE INDEX idx_categorization_rule_active ON categorization_rule(is_active, priority);

    -- Rule application history
    CREATE TABLE IF NOT EXISTS rule_application_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rule_id INTEGER NOT NULL,
      bank_transaction_id INTEGER NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (rule_id) REFERENCES categorization_rule(id) ON DELETE CASCADE,
      FOREIGN KEY (bank_transaction_id) REFERENCES bank_statement_transaction(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_rule_log_rule ON rule_application_log(rule_id);
    CREATE INDEX idx_rule_log_transaction ON rule_application_log(bank_transaction_id);
  `
};
