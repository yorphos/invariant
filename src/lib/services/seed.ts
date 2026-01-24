import { getDatabase } from './database';
import type { AccountType } from '../domain/types';

interface DefaultAccount {
  code: string;
  name: string;
  type: AccountType;
  parent_id: number | null;
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
];

export async function seedDefaultAccounts(): Promise<void> {
  const db = await getDatabase();

  // Check if accounts already exist
  const existingAccounts = await db.select<Array<{ count: number }>>(
    'SELECT COUNT(*) as count FROM account'
  );

  if (existingAccounts[0].count > 0) {
    console.log('Accounts already exist, skipping seed');
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
}
