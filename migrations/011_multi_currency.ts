import type { Migration } from '../src/lib/services/database';

// Migration 011: Multi-Currency Support
export const migration011: Migration = {
  id: '011',
  name: 'create_multi_currency',
  up: `
    -- Currency master table
    CREATE TABLE IF NOT EXISTS currency (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE, -- ISO 4217: USD, CAD, EUR, GBP, etc.
      name TEXT NOT NULL, -- US Dollar, Canadian Dollar, Euro, etc.
      symbol TEXT NOT NULL, -- $, €, £, etc.
      decimal_places INTEGER NOT NULL DEFAULT 2,
      is_active BOOLEAN NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_currency_code ON currency(code);
    CREATE INDEX idx_currency_active ON currency(is_active);

    -- Exchange rates (date-based)
    CREATE TABLE IF NOT EXISTS exchange_rate (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_currency_id INTEGER NOT NULL,
      to_currency_id INTEGER NOT NULL,
      rate_date DATE NOT NULL,
      rate DECIMAL(15, 6) NOT NULL, -- Exchange rate (from → to)
      source TEXT, -- Source of rate (manual, API, bank, etc.)
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (from_currency_id) REFERENCES currency(id),
      FOREIGN KEY (to_currency_id) REFERENCES currency(id),
      UNIQUE(from_currency_id, to_currency_id, rate_date)
    );

    CREATE INDEX idx_exchange_rate_currencies ON exchange_rate(from_currency_id, to_currency_id);
    CREATE INDEX idx_exchange_rate_date ON exchange_rate(rate_date);

    -- Add currency support to accounts
    ALTER TABLE account ADD COLUMN currency_id INTEGER REFERENCES currency(id);
    
    -- Add currency to journal lines (for foreign currency transactions)
    ALTER TABLE journal_line ADD COLUMN foreign_currency_id INTEGER REFERENCES currency(id);
    ALTER TABLE journal_line ADD COLUMN foreign_amount DECIMAL(15, 2);
    ALTER TABLE journal_line ADD COLUMN exchange_rate DECIMAL(15, 6);

    -- Add currency to invoices
    ALTER TABLE invoice ADD COLUMN currency_id INTEGER REFERENCES currency(id);
    ALTER TABLE invoice ADD COLUMN exchange_rate DECIMAL(15, 6);

    -- Add currency to bills
    ALTER TABLE bill ADD COLUMN currency_id INTEGER REFERENCES currency(id);
    ALTER TABLE bill ADD COLUMN exchange_rate DECIMAL(15, 6);

    -- Realized gain/loss tracking
    CREATE TABLE IF NOT EXISTS fx_gain_loss (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_date DATE NOT NULL,
      account_id INTEGER NOT NULL,
      currency_id INTEGER NOT NULL,
      foreign_amount DECIMAL(15, 2) NOT NULL,
      home_amount DECIMAL(15, 2) NOT NULL,
      exchange_rate DECIMAL(15, 6) NOT NULL,
      settled_rate DECIMAL(15, 6) NOT NULL,
      gain_loss_amount DECIMAL(15, 2) NOT NULL, -- Positive = gain, Negative = loss
      gain_loss_type TEXT NOT NULL CHECK (gain_loss_type IN ('realized', 'unrealized')),
      journal_entry_id INTEGER,
      reference TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (account_id) REFERENCES account(id),
      FOREIGN KEY (currency_id) REFERENCES currency(id),
      FOREIGN KEY (journal_entry_id) REFERENCES journal_entry(id)
    );

    CREATE INDEX idx_fx_gain_loss_account ON fx_gain_loss(account_id);
    CREATE INDEX idx_fx_gain_loss_currency ON fx_gain_loss(currency_id);
    CREATE INDEX idx_fx_gain_loss_type ON fx_gain_loss(gain_loss_type);
    CREATE INDEX idx_fx_gain_loss_date ON fx_gain_loss(transaction_date);

    -- Insert default currencies
    INSERT INTO currency (code, name, symbol, decimal_places, is_active) VALUES
      ('CAD', 'Canadian Dollar', '$', 2, 1),
      ('USD', 'US Dollar', '$', 2, 1),
      ('EUR', 'Euro', '€', 2, 1),
      ('GBP', 'British Pound', '£', 2, 1),
      ('JPY', 'Japanese Yen', '¥', 0, 1),
      ('AUD', 'Australian Dollar', '$', 2, 1),
      ('CHF', 'Swiss Franc', 'CHF', 2, 1),
      ('CNY', 'Chinese Yuan', '¥', 2, 1);

    -- Set CAD as default currency for existing accounts
    UPDATE account SET currency_id = (SELECT id FROM currency WHERE code = 'CAD');

    -- Set CAD as default for existing invoices and bills
    UPDATE invoice SET currency_id = (SELECT id FROM currency WHERE code = 'CAD'), exchange_rate = 1.0;
    UPDATE bill SET currency_id = (SELECT id FROM currency WHERE code = 'CAD'), exchange_rate = 1.0;
  `,
};
