import type { Migration } from '../src/lib/services/database';

// Migration 003: Inventory, Payroll, and Tax
export const migration003: Migration = {
  id: '003',
  name: 'create_inventory_payroll_tax',
  up: `
    -- Tax jurisdiction table
    CREATE TABLE IF NOT EXISTS tax_jurisdiction (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      type TEXT NOT NULL CHECK (type IN ('federal', 'provincial', 'municipal')),
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- Tax code table
    CREATE TABLE IF NOT EXISTS tax_code (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      is_compound INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    -- Tax rate table
    CREATE TABLE IF NOT EXISTS tax_rate (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tax_code_id INTEGER NOT NULL,
      jurisdiction_id INTEGER NOT NULL,
      rate DECIMAL(5, 4) NOT NULL,
      effective_from DATE NOT NULL,
      effective_to DATE,
      account_id INTEGER,
      FOREIGN KEY (tax_code_id) REFERENCES tax_code(id),
      FOREIGN KEY (jurisdiction_id) REFERENCES tax_jurisdiction(id),
      FOREIGN KEY (account_id) REFERENCES account(id)
    );

    CREATE INDEX idx_tax_rate_code ON tax_rate(tax_code_id);
    CREATE INDEX idx_tax_rate_jurisdiction ON tax_rate(jurisdiction_id);
    CREATE INDEX idx_tax_rate_effective ON tax_rate(effective_from, effective_to);

    -- Insert Canadian tax jurisdictions and codes
    INSERT INTO tax_jurisdiction (code, name, type) VALUES 
      ('CA', 'Canada (Federal)', 'federal'),
      ('CA-ON', 'Ontario', 'provincial'),
      ('CA-BC', 'British Columbia', 'provincial'),
      ('CA-AB', 'Alberta', 'provincial'),
      ('CA-QC', 'Quebec', 'provincial');

    INSERT INTO tax_code (code, name, description) VALUES 
      ('GST', 'GST', 'Goods and Services Tax (5%)'),
      ('HST-ON', 'HST (Ontario)', 'Harmonized Sales Tax - Ontario (13%)'),
      ('HST-BC', 'HST (BC)', 'Harmonized Sales Tax - BC (12%)'),
      ('PST-BC', 'PST (BC)', 'Provincial Sales Tax - BC (7%)'),
      ('NO_TAX', 'No Tax', 'Zero-rated or exempt');

    -- Item/SKU table
    CREATE TABLE IF NOT EXISTS item (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL CHECK (type IN ('product', 'service', 'bundle')),
      unit_of_measure TEXT,
      default_price DECIMAL(15, 2),
      cost DECIMAL(15, 2),
      tax_code_id INTEGER,
      inventory_account_id INTEGER,
      revenue_account_id INTEGER,
      cogs_account_id INTEGER,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (tax_code_id) REFERENCES tax_code(id),
      FOREIGN KEY (inventory_account_id) REFERENCES account(id),
      FOREIGN KEY (revenue_account_id) REFERENCES account(id),
      FOREIGN KEY (cogs_account_id) REFERENCES account(id)
    );

    CREATE INDEX idx_item_sku ON item(sku);
    CREATE INDEX idx_item_type ON item(type);

    -- Inventory movement table
    CREATE TABLE IF NOT EXISTS inventory_movement (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id INTEGER NOT NULL,
      movement_type TEXT NOT NULL CHECK (movement_type IN ('purchase', 'sale', 'adjustment', 'transfer')),
      quantity DECIMAL(10, 3) NOT NULL,
      unit_cost DECIMAL(15, 2),
      reference_type TEXT,
      reference_id INTEGER,
      event_id INTEGER,
      movement_date DATE NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (item_id) REFERENCES item(id),
      FOREIGN KEY (event_id) REFERENCES transaction_event(id)
    );

    CREATE INDEX idx_inventory_item ON inventory_movement(item_id);
    CREATE INDEX idx_inventory_date ON inventory_movement(movement_date);

    -- Payroll run header
    CREATE TABLE IF NOT EXISTS payroll_run (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_number TEXT NOT NULL UNIQUE,
      period_start DATE NOT NULL,
      period_end DATE NOT NULL,
      pay_date DATE NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid', 'void')),
      total_gross DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      total_deductions DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      total_net DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      event_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (event_id) REFERENCES transaction_event(id)
    );

    CREATE INDEX idx_payroll_period ON payroll_run(period_start, period_end);
    CREATE INDEX idx_payroll_status ON payroll_run(status);

    -- Payroll line (employee payments)
    CREATE TABLE IF NOT EXISTS payroll_line (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payroll_run_id INTEGER NOT NULL,
      employee_name TEXT NOT NULL,
      employee_id TEXT,
      gross_pay DECIMAL(15, 2) NOT NULL,
      cpp_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      ei_amount DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      income_tax DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      other_deductions DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
      net_pay DECIMAL(15, 2) NOT NULL,
      FOREIGN KEY (payroll_run_id) REFERENCES payroll_run(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_payroll_line_run ON payroll_line(payroll_run_id);
  `
};
