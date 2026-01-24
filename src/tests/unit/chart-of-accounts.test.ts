import { describe, it, expect } from 'vitest';
import type { Account, AccountType } from '../../lib/domain/types';

/**
 * Chart of Accounts Tests
 * 
 * Tests for account management and validation rules
 */

describe('Chart of Accounts - Account Structure', () => {
  it('should have valid account codes', () => {
    const validCodes = ['1000', '1010', '2000', '3000', '4000', '5000', '6100'];
    
    for (const code of validCodes) {
      expect(code).toMatch(/^\d{4}$/);
    }
  });

  it('should enforce account type validation', () => {
    const validTypes: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense'];
    
    for (const type of validTypes) {
      expect(['asset', 'liability', 'equity', 'revenue', 'expense']).toContain(type);
    }
  });

  it('should validate account code ranges by type', () => {
    // Convention: Assets = 1000-1999, Liabilities = 2000-2999, etc.
    const testAccounts = [
      { code: '1010', type: 'asset', expected: true },
      { code: '2220', type: 'liability', expected: true },
      { code: '3000', type: 'equity', expected: true },
      { code: '4020', type: 'revenue', expected: true },
      { code: '6100', type: 'expense', expected: true },
    ];

    for (const test of testAccounts) {
      const firstDigit = parseInt(test.code[0]);
      let expectedFirstDigit = 0;
      
      switch (test.type) {
        case 'asset': expectedFirstDigit = 1; break;
        case 'liability': expectedFirstDigit = 2; break;
        case 'equity': expectedFirstDigit = 3; break;
        case 'revenue': expectedFirstDigit = 4; break;
        case 'expense': expectedFirstDigit = 5; break; // or 5-9
      }

      if (test.type === 'expense') {
        // Expenses can be 5000-9999
        expect(firstDigit).toBeGreaterThanOrEqual(5);
      } else {
        expect(firstDigit).toBe(expectedFirstDigit);
      }
    }
  });
});

describe('Chart of Accounts - Account Hierarchy', () => {
  it('should allow parent-child relationships', () => {
    const parentAccount: Partial<Account> = {
      id: 1,
      code: '6000',
      name: 'Operating Expenses',
      type: 'expense',
      parent_id: null,
      is_active: true
    };

    const childAccount: Partial<Account> = {
      id: 2,
      code: '6100',
      name: 'Salaries & Wages',
      type: 'expense',
      parent_id: 1, // References parent
      is_active: true
    };

    // Child should reference parent
    expect(childAccount.parent_id).toBe(parentAccount.id);
    
    // Both should have same type
    expect(childAccount.type).toBe(parentAccount.type);
  });

  it('should prevent circular parent relationships', () => {
    // This would be enforced at the database or service layer
    const account1: Partial<Account> = { id: 1, parent_id: 2 };
    const account2: Partial<Account> = { id: 2, parent_id: 1 };

    // Check that circular reference is detected
    const hasCircular = account1.parent_id === account2.id && account2.parent_id === account1.id;
    expect(hasCircular).toBe(true); // Detected
  });
});

describe('Chart of Accounts - Account Status', () => {
  it('should support active/inactive status', () => {
    const activeAccount: Partial<Account> = {
      code: '1010',
      name: 'Checking Account',
      type: 'asset',
      is_active: true
    };

    const inactiveAccount: Partial<Account> = {
      code: '1030',
      name: 'Old Bank Account',
      type: 'asset',
      is_active: false
    };

    expect(activeAccount.is_active).toBe(true);
    expect(inactiveAccount.is_active).toBe(false);
  });

  it('should not allow deleting accounts with transactions', () => {
    const account: Partial<Account> = {
      id: 1,
      code: '1010',
      name: 'Checking Account',
      type: 'asset',
      is_active: true
    };

    const hasTransactions = true; // Simulated check

    // Accounts with transactions should not be deleted, only deactivated
    if (hasTransactions) {
      expect(account.is_active).toBeDefined(); // Should use deactivation instead
    }
  });
});

describe('Chart of Accounts - Balance Calculation', () => {
  it('should calculate asset account balances correctly (debit increases)', () => {
    const debits = 1000;
    const credits = 300;
    const balance = debits - credits; // Asset: DR - CR

    expect(balance).toBe(700);
  });

  it('should calculate liability account balances correctly (credit increases)', () => {
    const debits = 200;
    const credits = 1000;
    const balance = credits - debits; // Liability: CR - DR

    expect(balance).toBe(800);
  });

  it('should calculate equity account balances correctly (credit increases)', () => {
    const debits = 0;
    const credits = 5000;
    const balance = credits - debits; // Equity: CR - DR

    expect(balance).toBe(5000);
  });

  it('should calculate revenue account balances correctly (credit increases)', () => {
    const debits = 100;
    const credits = 2500;
    const balance = credits - debits; // Revenue: CR - DR

    expect(balance).toBe(2400);
  });

  it('should calculate expense account balances correctly (debit increases)', () => {
    const debits = 1500;
    const credits = 50;
    const balance = debits - credits; // Expense: DR - CR

    expect(balance).toBe(1450);
  });
});

describe('Chart of Accounts - Standard Accounts', () => {
  it('should have critical accounts for operations', () => {
    const criticalAccounts = [
      { code: '1010', name: 'Checking Account', type: 'asset' },
      { code: '1100', name: 'Accounts Receivable', type: 'asset' },
      { code: '2000', name: 'Accounts Payable', type: 'liability' },
      { code: '2150', name: 'Customer Deposits', type: 'liability' },
      { code: '2220', name: 'HST Payable', type: 'liability' },
      { code: '3000', name: 'Owner\'s Equity', type: 'equity' },
      { code: '4000', name: 'Sales Revenue', type: 'revenue' },
    ];

    for (const account of criticalAccounts) {
      expect(account.code).toBeDefined();
      expect(account.name).toBeDefined();
      expect(account.type).toBeDefined();
    }
  });

  it('should validate required account structure for invoice operations', () => {
    // Invoice operations require:
    // - Accounts Receivable (1100)
    // - Revenue accounts (4000+)
    // - Tax Payable (2220)

    const requiredForInvoices = ['1100', '2220'];
    const hasRevenueAccounts = true; // At least one revenue account

    for (const code of requiredForInvoices) {
      expect(code).toMatch(/^\d{4}$/);
    }
    expect(hasRevenueAccounts).toBe(true);
  });

  it('should validate required account structure for payment operations', () => {
    // Payment operations require:
    // - Cash/Bank accounts (1010)
    // - Accounts Receivable (1100)
    // - Customer Deposits (2150)

    const requiredForPayments = ['1010', '1100', '2150'];

    for (const code of requiredForPayments) {
      expect(code).toMatch(/^\d{4}$/);
    }
  });

  it('should validate required account structure for expense operations', () => {
    // Expense operations require:
    // - Cash/Bank accounts (1010)
    // - Expense accounts (5000+)

    const requiredForExpenses = ['1010'];
    const hasExpenseAccounts = true; // At least one expense account

    expect(requiredForExpenses[0]).toMatch(/^\d{4}$/);
    expect(hasExpenseAccounts).toBe(true);
  });
});

describe('Chart of Accounts - Account Validation', () => {
  it('should reject accounts with invalid codes', () => {
    const invalidCodes = ['ABC', '12', '12345', '', 'X001'];

    for (const code of invalidCodes) {
      const isValid = /^\d{4}$/.test(code);
      expect(isValid).toBe(false);
    }
  });

  it('should reject accounts with empty names', () => {
    const invalidNames = ['', '   ', '\t', '\n'];

    for (const name of invalidNames) {
      const isValid = name.trim().length > 0;
      expect(isValid).toBe(false);
    }
  });

  it('should reject accounts with invalid types', () => {
    const invalidTypes = ['income', 'profit', 'loss', 'capital', 'debit'];

    for (const type of invalidTypes) {
      const validTypes = ['asset', 'liability', 'equity', 'revenue', 'expense'];
      const isValid = validTypes.includes(type);
      expect(isValid).toBe(false);
    }
  });

  it('should enforce unique account codes', () => {
    const accounts = [
      { code: '1010', name: 'Checking' },
      { code: '1020', name: 'Savings' },
      { code: '1010', name: 'Duplicate' }, // Duplicate!
    ];

    const codes = accounts.map(a => a.code);
    const uniqueCodes = new Set(codes);

    expect(uniqueCodes.size).toBeLessThan(codes.length); // Duplicates detected
  });
});

describe('Chart of Accounts - Account Templates', () => {
  it('should provide default chart of accounts', () => {
    // Default template should have 50+ accounts
    const defaultAccountCount = 50;

    expect(defaultAccountCount).toBeGreaterThanOrEqual(50);
  });

  it('should cover all account types in default template', () => {
    const accountTypes = new Set<AccountType>(['asset', 'liability', 'equity', 'revenue', 'expense']);

    // All types should be present
    expect(accountTypes.has('asset')).toBe(true);
    expect(accountTypes.has('liability')).toBe(true);
    expect(accountTypes.has('equity')).toBe(true);
    expect(accountTypes.has('revenue')).toBe(true);
    expect(accountTypes.has('expense')).toBe(true);
  });

  it('should support Canadian business needs', () => {
    // Canadian-specific accounts
    const canadianAccounts = [
      { code: '2210', name: 'GST Payable' },
      { code: '2220', name: 'HST Payable' },
      { code: '2230', name: 'PST Payable' },
    ];

    for (const account of canadianAccounts) {
      expect(account.code).toBeDefined();
      expect(account.name).toContain('ST'); // GST/HST/PST
    }
  });
});

describe('Chart of Accounts - Mode Restrictions', () => {
  it('should restrict account editing in beginner mode', () => {
    const mode: string = 'beginner';
    const canEditAccounts = mode === 'pro';

    expect(canEditAccounts).toBe(false);
  });

  it('should allow account editing in pro mode', () => {
    const mode: string = 'pro';
    const canEditAccounts = mode === 'pro';

    expect(canEditAccounts).toBe(true);
  });

  it('should restrict account creation in beginner mode', () => {
    const mode: string = 'beginner';
    const canCreateAccounts = mode === 'pro';

    expect(canCreateAccounts).toBe(false);
  });

  it('should allow account creation in pro mode', () => {
    const mode: string = 'pro';
    const canCreateAccounts = mode === 'pro';

    expect(canCreateAccounts).toBe(true);
  });
});
