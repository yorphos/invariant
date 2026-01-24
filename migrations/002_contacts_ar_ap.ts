import type { Migration } from '../src/lib/services/database';

// Migration 002: Contacts and AR/AP
export const migration002: Migration = {
  id: '002',
  name: 'create_contacts_and_ar_ap',
  up: `
    -- Contact table (customers and vendors)
    CREATE TABLE IF NOT EXISTS contact (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK (type IN ('customer', 'vendor', 'both')),
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      tax_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX idx_contact_type ON contact(type);
    CREATE INDEX idx_contact_name ON contact(name);

    -- Invoice header
    CREATE TABLE IF NOT EXISTS invoice (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      contact_id INTEGER NOT NULL,
      event_id INTEGER,
      issue_date DATE NOT NULL,
      due_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'partial', 'overdue', 'void')),
      subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id) REFERENCES contact(id),
      FOREIGN KEY (event_id) REFERENCES transaction_event(id)
    );

    CREATE INDEX idx_invoice_contact ON invoice(contact_id);
    CREATE INDEX idx_invoice_status ON invoice(status);
    CREATE INDEX idx_invoice_due_date ON invoice(due_date);
    CREATE INDEX idx_invoice_number ON invoice(invoice_number);

    -- Invoice line items
    CREATE TABLE IF NOT EXISTS invoice_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL,
      line_number INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity DECIMAL(10, 3) NOT NULL DEFAULT 1.000,
      unit_price DECIMAL(15, 2) NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      tax_code_id INTEGER,
      account_id INTEGER,
      FOREIGN KEY (invoice_id) REFERENCES invoice(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES account(id)
    );

    CREATE INDEX idx_invoice_line_invoice ON invoice_line(invoice_id);

    -- Payment records
    CREATE TABLE IF NOT EXISTS payment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_number TEXT NOT NULL UNIQUE,
      contact_id INTEGER,
      event_id INTEGER,
      payment_date DATE NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      payment_method TEXT CHECK (payment_method IN ('cash', 'check', 'transfer', 'card', 'other')),
      reference TEXT,
      notes TEXT,
      allocated_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'allocated', 'partial', 'reconciled')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id) REFERENCES contact(id),
      FOREIGN KEY (event_id) REFERENCES transaction_event(id)
    );

    CREATE INDEX idx_payment_contact ON payment(contact_id);
    CREATE INDEX idx_payment_date ON payment(payment_date);
    CREATE INDEX idx_payment_status ON payment(status);

    -- Payment allocation (links payments to invoices)
    CREATE TABLE IF NOT EXISTS allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      allocation_method TEXT NOT NULL CHECK (allocation_method IN ('exact', 'fifo', 'manual', 'heuristic')),
      confidence_score DECIMAL(3, 2),
      explanation TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (payment_id) REFERENCES payment(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES invoice(id)
    );

    CREATE INDEX idx_allocation_payment ON allocation(payment_id);
    CREATE INDEX idx_allocation_invoice ON allocation(invoice_id);
  `
};
