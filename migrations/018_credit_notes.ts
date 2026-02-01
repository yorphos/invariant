import type { Migration } from '../src/lib/services/database';

// Migration 018: Credit Notes and Refunds
export const migration018: Migration = {
  id: '018',
  name: 'credit_notes_refunds',
  up: `
    -- Credit Note header
    CREATE TABLE IF NOT EXISTS credit_note (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credit_note_number TEXT NOT NULL UNIQUE,
      contact_id INTEGER NOT NULL,
      event_id INTEGER,
      issue_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'applied', 'partial', 'void')),
      subtotal DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      tax_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      applied_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
      tax_code_id INTEGER,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id) REFERENCES contact(id),
      FOREIGN KEY (event_id) REFERENCES transaction_event(id),
      FOREIGN KEY (tax_code_id) REFERENCES tax_code(id)
    );

    CREATE INDEX idx_credit_note_contact ON credit_note(contact_id);
    CREATE INDEX idx_credit_note_status ON credit_note(status);
    CREATE INDEX idx_credit_note_number ON credit_note(credit_note_number);

    -- Credit Note line items
    CREATE TABLE IF NOT EXISTS credit_note_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credit_note_id INTEGER NOT NULL,
      line_number INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity DECIMAL(10,3) NOT NULL DEFAULT 1.000,
      unit_price DECIMAL(15,2) NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      is_tax_inclusive INTEGER NOT NULL DEFAULT 0,
      tax_code_id INTEGER,
      account_id INTEGER,
      FOREIGN KEY (credit_note_id) REFERENCES credit_note(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES account(id)
    );

    CREATE INDEX idx_credit_note_line_credit_note ON credit_note_line(credit_note_id);

    -- Credit Note to Invoice Applications
    CREATE TABLE IF NOT EXISTS credit_note_application (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credit_note_id INTEGER NOT NULL,
      invoice_id INTEGER NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      application_date DATE NOT NULL DEFAULT (date('now')),
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (credit_note_id) REFERENCES credit_note(id) ON DELETE CASCADE,
      FOREIGN KEY (invoice_id) REFERENCES invoice(id)
    );

    CREATE INDEX idx_credit_note_application_credit_note ON credit_note_application(credit_note_id);
    CREATE INDEX idx_credit_note_application_invoice ON credit_note_application(invoice_id);

    -- Credit Note Refunds (cash refunds)
    CREATE TABLE IF NOT EXISTS credit_note_refund (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      credit_note_id INTEGER NOT NULL,
      refund_number TEXT NOT NULL UNIQUE,
      refund_date DATE NOT NULL,
      amount DECIMAL(15,2) NOT NULL,
      payment_method TEXT CHECK (payment_method IN ('cash', 'check', 'transfer', 'card', 'other')),
      reference TEXT,
      notes TEXT,
      event_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (credit_note_id) REFERENCES credit_note(id) ON DELETE CASCADE,
      FOREIGN KEY (event_id) REFERENCES transaction_event(id)
    );

    CREATE INDEX idx_credit_note_refund_credit_note ON credit_note_refund(credit_note_id);

    -- Trigger: Update credit note total amounts
    CREATE TRIGGER IF NOT EXISTS update_credit_note_total
    AFTER INSERT ON credit_note_line
    BEGIN
      UPDATE credit_note
      SET subtotal = (SELECT COALESCE(SUM(amount), 0) FROM credit_note_line WHERE credit_note_id = NEW.credit_note_id),
          updated_at = datetime('now')
      WHERE id = NEW.credit_note_id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_credit_note_total_after_delete
    AFTER DELETE ON credit_note_line
    BEGIN
      UPDATE credit_note
      SET subtotal = (SELECT COALESCE(SUM(amount), 0) FROM credit_note_line WHERE credit_note_id = OLD.credit_note_id),
          updated_at = datetime('now')
      WHERE id = OLD.credit_note_id;
    END;

    -- Trigger: Update credit note applied amount
    CREATE TRIGGER IF NOT EXISTS update_credit_note_applied_amount
    AFTER INSERT ON credit_note_application
    BEGIN
      UPDATE credit_note
      SET applied_amount = (SELECT COALESCE(SUM(amount), 0) FROM credit_note_application WHERE credit_note_id = NEW.credit_note_id),
          updated_at = datetime('now')
      WHERE id = NEW.credit_note_id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_credit_note_applied_amount_after_delete
    AFTER DELETE ON credit_note_application
    BEGIN
      UPDATE credit_note
      SET applied_amount = (SELECT COALESCE(SUM(amount), 0) FROM credit_note_application WHERE credit_note_id = OLD.credit_note_id),
          updated_at = datetime('now')
      WHERE id = OLD.credit_note_id;
    END;
  `
};
