import { getDatabase } from './database';
import type { AccountType } from '../domain/types';

interface DefaultAccount {
  code: string;
  name: string;
  type: AccountType;
  parent_id: number | null;
}

/**
 * System account role to account code mapping.
 * These mappings are seeded after accounts are created.
 */
interface SystemAccountSeed {
  role: string;
  code: string;
  description: string;
}

const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccount[] = [
  // Assets (1000-1999)
  { code: '1000', name: 'Cash and Cash Equivalents', type: 'asset', parent_id: null },
  { code: '1010', name: 'Checking Account', type: 'asset', parent_id: null },
  { code: '1020', name: 'Savings Account', type: 'asset', parent_id: null },
  { code: '1100', name: 'Accounts Receivable', type: 'asset', parent_id: null },
  { code: '1200', name: 'Inventory', type: 'asset', parent_id: null },
  { code: '1500', name: 'Property, Plant & Equipment', type: 'asset', parent_id: null },
  { code: '1510', name: 'Furniture & Fixtures', type: 'asset', parent_id: null },
  { code: '1520', name: 'Computer Equipment', type: 'asset', parent_id: null },

  // Liabilities (2000-2999)
  { code: '2000', name: 'Accounts Payable', type: 'liability', parent_id: null },
  { code: '2100', name: 'Credit Card Payable', type: 'liability', parent_id: null },
  { code: '2150', name: 'Customer Deposits', type: 'liability', parent_id: null }, // For unallocated payments
  { code: '2200', name: 'Sales Tax Payable', type: 'liability', parent_id: null },
  { code: '2210', name: 'GST Payable', type: 'liability', parent_id: null },
  { code: '2220', name: 'HST Payable', type: 'liability', parent_id: null },
  { code: '2230', name: 'PST Payable', type: 'liability', parent_id: null },
  { code: '2300', name: 'Payroll Liabilities', type: 'liability', parent_id: null },
  { code: '2310', name: 'CPP Payable', type: 'liability', parent_id: null },
  { code: '2320', name: 'EI Payable', type: 'liability', parent_id: null },
  { code: '2330', name: 'Income Tax Withholding', type: 'liability', parent_id: null },
  { code: '2500', name: 'Long-term Debt', type: 'liability', parent_id: null },

  // Equity (3000-3999)
  { code: '3000', name: 'Owner\'s Equity', type: 'equity', parent_id: null },
  { code: '3100', name: 'Retained Earnings', type: 'equity', parent_id: null },
  { code: '3900', name: 'Current Year Earnings', type: 'equity', parent_id: null },

  // Revenue (4000-4999)
  { code: '4000', name: 'Sales Revenue', type: 'revenue', parent_id: null },
  { code: '4010', name: 'Product Sales', type: 'revenue', parent_id: null },
  { code: '4020', name: 'Service Revenue', type: 'revenue', parent_id: null },
  { code: '4030', name: 'Consulting Revenue', type: 'revenue', parent_id: null },
  { code: '4100', name: 'Other Revenue', type: 'revenue', parent_id: null },
  { code: '4200', name: 'Interest Income', type: 'revenue', parent_id: null },

  // Expenses (5000-9999)
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense', parent_id: null },
  { code: '5010', name: 'Materials Cost', type: 'expense', parent_id: null },
  { code: '5020', name: 'Direct Labor', type: 'expense', parent_id: null },

  { code: '6000', name: 'Operating Expenses', type: 'expense', parent_id: null },
  { code: '6100', name: 'Salaries & Wages', type: 'expense', parent_id: null },
  { code: '6200', name: 'Rent Expense', type: 'expense', parent_id: null },
  { code: '6300', name: 'Utilities', type: 'expense', parent_id: null },
  { code: '6310', name: 'Electricity', type: 'expense', parent_id: null },
  { code: '6320', name: 'Internet & Phone', type: 'expense', parent_id: null },
  { code: '6400', name: 'Insurance', type: 'expense', parent_id: null },
  { code: '6500', name: 'Office Supplies', type: 'expense', parent_id: null },
  { code: '6600', name: 'Professional Fees', type: 'expense', parent_id: null },
  { code: '6610', name: 'Accounting Fees', type: 'expense', parent_id: null },
  { code: '6620', name: 'Legal Fees', type: 'expense', parent_id: null },
  { code: '6700', name: 'Marketing & Advertising', type: 'expense', parent_id: null },
  { code: '6800', name: 'Travel & Entertainment', type: 'expense', parent_id: null },
  { code: '6810', name: 'Travel', type: 'expense', parent_id: null },
  { code: '6820', name: 'Meals & Entertainment', type: 'expense', parent_id: null },
  { code: '6900', name: 'Depreciation', type: 'expense', parent_id: null },

  { code: '7000', name: 'Other Expenses', type: 'expense', parent_id: null },
  { code: '7100', name: 'Bank Fees', type: 'expense', parent_id: null },
  { code: '7200', name: 'Interest Expense', type: 'expense', parent_id: null },
  { code: '7300', name: 'Miscellaneous', type: 'expense', parent_id: null },
  { code: '7400', name: 'Foreign Exchange Gain/Loss', type: 'expense', parent_id: null },
];

/**
 * System account mappings - maps logical roles to account codes.
 * These are seeded AFTER accounts exist to ensure proper foreign key references.
 */
const SYSTEM_ACCOUNT_MAPPINGS: SystemAccountSeed[] = [
  // Core A/R and A/P
  { role: 'accounts_receivable', code: '1100', description: 'Primary A/R account for customer invoices' },
  { role: 'accounts_payable', code: '2000', description: 'Primary A/P account for vendor bills' },
  { role: 'sales_tax_payable', code: '2220', description: 'Sales tax collected (HST/GST/PST)' },
  { role: 'retained_earnings', code: '3100', description: 'Retained earnings from prior periods' },
  { role: 'current_year_earnings', code: '3900', description: 'Net income for current fiscal year' },
  // Cash and Bank accounts
  { role: 'cash_default', code: '1000', description: 'Default cash account for transactions' },
  { role: 'checking_account', code: '1010', description: 'Primary checking account for payments' },
  { role: 'customer_deposits', code: '2150', description: 'Liability account for unallocated customer payments' },
  // Payroll accounts
  { role: 'salary_expense', code: '6100', description: 'Salary and wages expense' },
  { role: 'cpp_payable', code: '2310', description: 'CPP (Canada Pension Plan) payable' },
  { role: 'ei_payable', code: '2320', description: 'EI (Employment Insurance) payable' },
  { role: 'tax_withholding_payable', code: '2330', description: 'Income tax withholding payable' },
  // Inventory and COGS
  { role: 'inventory_asset', code: '1200', description: 'Inventory asset account' },
  { role: 'cogs_expense', code: '5000', description: 'Cost of goods sold expense' },
  // Default accounts for categorization
  { role: 'default_revenue', code: '4000', description: 'Default revenue account' },
  { role: 'default_expense', code: '6000', description: 'Default expense account' },
  // Foreign exchange
  { role: 'fx_gain_loss', code: '7400', description: 'Foreign exchange gains and losses' },
];

export async function seedDefaultAccounts(): Promise<void> {
  const db = await getDatabase();

  // Check if accounts already exist
  const existingAccounts = await db.select<Array<{ count: number }>>(
    'SELECT COUNT(*) as count FROM account'
  );

  if (existingAccounts[0].count > 0) {
    console.log('Accounts already exist, skipping seed');
    // Still try to seed system accounts in case they're missing
    await seedSystemAccounts();
    return;
  }

  console.log('Seeding default chart of accounts...');

  // Insert all default accounts
  for (const account of DEFAULT_CHART_OF_ACCOUNTS) {
    await db.execute(
      `INSERT INTO account (code, name, type, parent_id, is_active) 
       VALUES (?, ?, ?, ?, 1)`,
      [account.code, account.name, account.type, account.parent_id]
    );
  }

  console.log(`Seeded ${DEFAULT_CHART_OF_ACCOUNTS.length} default accounts`);

  // Now seed system account mappings (accounts exist now)
  await seedSystemAccounts();
}

/**
 * Seeds system account mappings after accounts exist.
 * Uses INSERT OR IGNORE to avoid duplicates on existing databases.
 */
async function seedSystemAccounts(): Promise<void> {
  const db = await getDatabase();

  // Check if system_account table exists (migration 007 must have run)
  const tableExists = await db.select<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='system_account'`
  );

  if (tableExists.length === 0) {
    console.log('system_account table does not exist yet, skipping system account seed');
    return;
  }

  // Check how many system accounts are already configured
  const existingMappings = await db.select<Array<{ count: number }>>(
    'SELECT COUNT(*) as count FROM system_account'
  );

  if (existingMappings[0].count >= SYSTEM_ACCOUNT_MAPPINGS.length) {
    console.log('System accounts already seeded, skipping');
    return;
  }

  console.log('Seeding system account mappings...');

  let seededCount = 0;
  for (const mapping of SYSTEM_ACCOUNT_MAPPINGS) {
    // Get the account ID for this code
    const account = await db.select<Array<{ id: number }>>(
      'SELECT id FROM account WHERE code = ? LIMIT 1',
      [mapping.code]
    );

    if (account.length === 0) {
      console.warn(`Account ${mapping.code} not found for system role ${mapping.role}`);
      continue;
    }

    // Insert if not exists
    await db.execute(
      `INSERT OR IGNORE INTO system_account (role, account_id, description)
       VALUES (?, ?, ?)`,
      [mapping.role, account[0].id, mapping.description]
    );
    seededCount++;
  }

  console.log(`Seeded ${seededCount} system account mappings`);
}
