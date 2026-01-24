import type { Migration } from '../src/lib/services/database';

// Migration 010: Vendor Bills (Accounts Payable)
export const migration010: Migration = {
  id: '010',
  name: 'create_vendor_bills',
  up: `
    -- Vendor bill header (similar to invoice but for AP)
    CREATE TABLE IF NOT EXISTS bill (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_number TEXT NOT NULL UNIQUE,
      vendor_id INTEGER NOT NULL,
      event_id INTEGER,
      bill_date DATE NOT NULL,
      due_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'paid', 'partial', 'overdue', 'void')),
      subtotal DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      tax_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      total_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      paid_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      tax_code_id INTEGER,
      reference TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (vendor_id) REFERENCES contact(id),
      FOREIGN KEY (event_id) REFERENCES transaction_event(id),
      FOREIGN KEY (tax_code_id) REFERENCES tax_code(id)
    );

    CREATE INDEX idx_bill_vendor ON bill(vendor_id);
    CREATE INDEX idx_bill_status ON bill(status);
    CREATE INDEX idx_bill_due_date ON bill(due_date);
    CREATE INDEX idx_bill_number ON bill(bill_number);

    -- Bill line items
    CREATE TABLE IF NOT EXISTS bill_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bill_id INTEGER NOT NULL,
      line_number INTEGER NOT NULL,
      description TEXT NOT NULL,
      quantity DECIMAL(10, 3) NOT NULL DEFAULT 1.000,
      unit_price DECIMAL(15, 2) NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      account_id INTEGER NOT NULL,
      item_id INTEGER,
      FOREIGN KEY (bill_id) REFERENCES bill(id) ON DELETE CASCADE,
      FOREIGN KEY (account_id) REFERENCES account(id),
      FOREIGN KEY (item_id) REFERENCES item(id)
    );

    CREATE INDEX idx_bill_line_bill ON bill_line(bill_id);
    CREATE INDEX idx_bill_line_account ON bill_line(account_id);

    -- Vendor payment records (separate from customer payments)
    CREATE TABLE IF NOT EXISTS vendor_payment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_number TEXT NOT NULL UNIQUE,
      vendor_id INTEGER NOT NULL,
      event_id INTEGER,
      payment_date DATE NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      payment_method TEXT CHECK (payment_method IN ('cash', 'check', 'transfer', 'card', 'other')),
      check_number TEXT,
      reference TEXT,
      notes TEXT,
      allocated_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'allocated', 'partial', 'cleared')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (vendor_id) REFERENCES contact(id),
      FOREIGN KEY (event_id) REFERENCES transaction_event(id)
    );

    CREATE INDEX idx_vendor_payment_vendor ON vendor_payment(vendor_id);
    CREATE INDEX idx_vendor_payment_date ON vendor_payment(payment_date);
    CREATE INDEX idx_vendor_payment_status ON vendor_payment(status);

    -- Bill payment allocation (links vendor payments to bills)
    CREATE TABLE IF NOT EXISTS bill_allocation (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_payment_id INTEGER NOT NULL,
      bill_id INTEGER NOT NULL,
      amount DECIMAL(15, 2) NOT NULL,
      allocation_date DATE NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (vendor_payment_id) REFERENCES vendor_payment(id) ON DELETE CASCADE,
      FOREIGN KEY (bill_id) REFERENCES bill(id)
    );

    CREATE INDEX idx_bill_allocation_payment ON bill_allocation(vendor_payment_id);
    CREATE INDEX idx_bill_allocation_bill ON bill_allocation(bill_id);

    -- Trigger to update bill paid_amount when allocations change
    CREATE TRIGGER update_bill_paid_amount_on_insert
    AFTER INSERT ON bill_allocation
    BEGIN
      UPDATE bill
      SET paid_amount = (
        SELECT COALESCE(SUM(amount), 0)
        FROM bill_allocation
        WHERE bill_id = NEW.bill_id
      ),
      status = CASE
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM bill_allocation WHERE bill_id = NEW.bill_id) >= total_amount THEN 'paid'
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM bill_allocation WHERE bill_id = NEW.bill_id) > 0 THEN 'partial'
        ELSE status
      END
      WHERE id = NEW.bill_id;
    END;

    CREATE TRIGGER update_bill_paid_amount_on_delete
    AFTER DELETE ON bill_allocation
    BEGIN
      UPDATE bill
      SET paid_amount = (
        SELECT COALESCE(SUM(amount), 0)
        FROM bill_allocation
        WHERE bill_id = OLD.bill_id
      ),
      status = CASE
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM bill_allocation WHERE bill_id = OLD.bill_id) >= total_amount THEN 'paid'
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM bill_allocation WHERE bill_id = OLD.bill_id) > 0 THEN 'partial'
        WHEN status = 'void' THEN 'void'
        ELSE 'pending'
      END
      WHERE id = OLD.bill_id;
    END;

    -- Trigger to update vendor_payment allocated_amount
    CREATE TRIGGER update_vendor_payment_allocated_on_insert
    AFTER INSERT ON bill_allocation
    BEGIN
      UPDATE vendor_payment
      SET allocated_amount = (
        SELECT COALESCE(SUM(amount), 0)
        FROM bill_allocation
        WHERE vendor_payment_id = NEW.vendor_payment_id
      ),
      status = CASE
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM bill_allocation WHERE vendor_payment_id = NEW.vendor_payment_id) >= amount THEN 'allocated'
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM bill_allocation WHERE vendor_payment_id = NEW.vendor_payment_id) > 0 THEN 'partial'
        ELSE status
      END
      WHERE id = NEW.vendor_payment_id;
    END;

    CREATE TRIGGER update_vendor_payment_allocated_on_delete
    AFTER DELETE ON bill_allocation
    BEGIN
      UPDATE vendor_payment
      SET allocated_amount = (
        SELECT COALESCE(SUM(amount), 0)
        FROM bill_allocation
        WHERE vendor_payment_id = OLD.vendor_payment_id
      ),
      status = CASE
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM bill_allocation WHERE vendor_payment_id = OLD.vendor_payment_id) >= amount THEN 'allocated'
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM bill_allocation WHERE vendor_payment_id = OLD.vendor_payment_id) > 0 THEN 'partial'
        ELSE 'pending'
      END
      WHERE id = OLD.vendor_payment_id;
    END;
  `
};
