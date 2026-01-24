import type { Migration } from '../src/lib/services/database';

// Migration 018: Additional System Account Mappings
// Adds new system account roles for cash, banking, and payroll operations
export const migration018: Migration = {
  id: '018',
  name: 'additional_system_accounts',
  up: `
    -- First, ensure the new payroll accounts exist (for existing databases)
    -- These are inserted only if they don't already exist
    INSERT OR IGNORE INTO account (code, name, type, is_active)
    VALUES ('2310', 'CPP Payable', 'liability', 1);

    INSERT OR IGNORE INTO account (code, name, type, is_active)
    VALUES ('2320', 'EI Payable', 'liability', 1);

    INSERT OR IGNORE INTO account (code, name, type, is_active)
    VALUES ('2330', 'Income Tax Withholding', 'liability', 1);

    -- Now seed the new system account mappings
    -- Cash and Bank accounts
    INSERT OR IGNORE INTO system_account (role, account_id, description)
    SELECT 'cash_default', a.id, 'Default cash account for transactions'
    FROM account a
    WHERE a.code = '1000'
    LIMIT 1;

    INSERT OR IGNORE INTO system_account (role, account_id, description)
    SELECT 'checking_account', a.id, 'Primary checking account for payments'
    FROM account a
    WHERE a.code = '1010'
    LIMIT 1;

    INSERT OR IGNORE INTO system_account (role, account_id, description)
    SELECT 'customer_deposits', a.id, 'Liability account for unallocated customer payments'
    FROM account a
    WHERE a.code = '2150'
    LIMIT 1;

    -- Payroll accounts
    INSERT OR IGNORE INTO system_account (role, account_id, description)
    SELECT 'salary_expense', a.id, 'Salary and wages expense'
    FROM account a
    WHERE a.code = '6100'
    LIMIT 1;

    INSERT OR IGNORE INTO system_account (role, account_id, description)
    SELECT 'cpp_payable', a.id, 'CPP (Canada Pension Plan) payable'
    FROM account a
    WHERE a.code = '2310'
    LIMIT 1;

    INSERT OR IGNORE INTO system_account (role, account_id, description)
    SELECT 'ei_payable', a.id, 'EI (Employment Insurance) payable'
    FROM account a
    WHERE a.code = '2320'
    LIMIT 1;

    INSERT OR IGNORE INTO system_account (role, account_id, description)
    SELECT 'tax_withholding_payable', a.id, 'Income tax withholding payable'
    FROM account a
    WHERE a.code = '2330'
    LIMIT 1;

    -- Future expansion accounts (optional - mapped if accounts exist)
    INSERT OR IGNORE INTO system_account (role, account_id, description)
    SELECT 'inventory_asset', a.id, 'Inventory asset account'
    FROM account a
    WHERE a.code = '1200'
    LIMIT 1;

    INSERT OR IGNORE INTO system_account (role, account_id, description)
    SELECT 'cogs_expense', a.id, 'Cost of goods sold expense'
    FROM account a
    WHERE a.code = '5000'
    LIMIT 1;

    INSERT OR IGNORE INTO system_account (role, account_id, description)
    SELECT 'default_revenue', a.id, 'Default revenue account'
    FROM account a
    WHERE a.code = '4000'
    LIMIT 1;

    INSERT OR IGNORE INTO system_account (role, account_id, description)
    SELECT 'default_expense', a.id, 'Default expense account'
    FROM account a
    WHERE a.code = '6000'
    LIMIT 1;
  `
};
