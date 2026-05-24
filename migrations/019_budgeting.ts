import type { Migration } from '../src/lib/services/database';

// Migration 019: Budgeting
export const migration019: Migration = {
  id: '019',
  name: 'budgeting',
  up: `
    -- Budget periods (fiscal periods budgets apply to)
    CREATE TABLE IF NOT EXISTS budget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fiscal_year INTEGER NOT NULL,
      name TEXT NOT NULL,
      period_type TEXT NOT NULL CHECK (period_type IN ('monthly', 'quarterly', 'yearly')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_budget_fiscal_year ON budget(fiscal_year);

    -- Budget line items (one per account per period)
    CREATE TABLE IF NOT EXISTS budget_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      budget_id INTEGER NOT NULL,
      account_id INTEGER NOT NULL,
      period INTEGER NOT NULL,  -- 1-12 for monthly, 1-4 for quarterly, 1 for yearly
      amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      notes TEXT,
      FOREIGN KEY (budget_id) REFERENCES budget(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES account(id)
    );

    CREATE INDEX idx_budget_line_budget ON budget_line(budget_id);
    CREATE INDEX idx_budget_line_account ON budget_line(account_id);
  `
};
