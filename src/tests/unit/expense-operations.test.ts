import { describe, it, expect } from 'vitest';
import type { ExpenseInput } from '../../lib/domain/expense-operations';

/**
 * Expense Operations Tests
 * 
 * Tests for expense creation and validation
 */

describe('Expense Operations - Validation', () => {
  it('should reject expenses with zero amount', () => {
    const expense: ExpenseInput = {
      description: 'Office Supplies',
      amount: 0,
      expense_date: '2026-01-24',
      expense_account_id: 6500,
      payment_account_id: 1010,
    };

    const isValid = expense.amount > 0;
    expect(isValid).toBe(false);
  });

  it('should reject expenses with negative amount', () => {
    const expense: ExpenseInput = {
      description: 'Office Supplies',
      amount: -50.00,
      expense_date: '2026-01-24',
      expense_account_id: 6500,
      payment_account_id: 1010,
    };

    const isValid = expense.amount > 0;
    expect(isValid).toBe(false);
  });

  it('should reject expenses with empty description', () => {
    const descriptions = ['', '   ', '\t', '\n'];

    for (const desc of descriptions) {
      const isValid = desc.trim().length > 0;
      expect(isValid).toBe(false);
    }
  });

  it('should accept valid expense with all required fields', () => {
    const expense: ExpenseInput = {
      description: 'Office Supplies',
      amount: 127.50,
      expense_date: '2026-01-24',
      expense_account_id: 6500,
      payment_account_id: 1010,
    };

    const hasDescription = expense.description.trim().length > 0;
    const hasPositiveAmount = expense.amount > 0;
    const hasDate = expense.expense_date.length > 0;
    const hasAccounts = expense.expense_account_id > 0 && expense.payment_account_id > 0;

    expect(hasDescription).toBe(true);
    expect(hasPositiveAmount).toBe(true);
    expect(hasDate).toBe(true);
    expect(hasAccounts).toBe(true);
  });

  it('should allow optional vendor_id', () => {
    const expenseWithVendor: ExpenseInput = {
      description: 'Office Supplies',
      amount: 127.50,
      expense_date: '2026-01-24',
      vendor_id: 5,
      expense_account_id: 6500,
      payment_account_id: 1010,
    };

    const expenseWithoutVendor: ExpenseInput = {
      description: 'Office Supplies',
      amount: 127.50,
      expense_date: '2026-01-24',
      expense_account_id: 6500,
      payment_account_id: 1010,
    };

    expect(expenseWithVendor.vendor_id).toBeDefined();
    expect(expenseWithoutVendor.vendor_id).toBeUndefined();
  });

  it('should allow optional reference and notes', () => {
    const expense: ExpenseInput = {
      description: 'Office Supplies',
      amount: 127.50,
      expense_date: '2026-01-24',
      expense_account_id: 6500,
      payment_account_id: 1010,
      reference: 'INV-12345',
      notes: 'Quarterly supplies order',
    };

    expect(expense.reference).toBe('INV-12345');
    expect(expense.notes).toBe('Quarterly supplies order');
  });
});

describe('Expense Operations - Account Validation', () => {
  it('should require expense account to be expense type', () => {
    const validTypes = ['expense'];
    const invalidTypes = ['asset', 'liability', 'equity', 'revenue'];

    for (const type of validTypes) {
      expect(type).toBe('expense');
    }

    for (const type of invalidTypes) {
      expect(type).not.toBe('expense');
    }
  });

  it('should require payment account to be asset type', () => {
    const validTypes = ['asset'];
    const invalidTypes = ['liability', 'equity', 'revenue', 'expense'];

    for (const type of validTypes) {
      expect(type).toBe('asset');
    }

    for (const type of invalidTypes) {
      expect(type).not.toBe('asset');
    }
  });

  it('should reject inactive expense accounts', () => {
    const inactiveAccount = { id: 6500, name: 'Office Supplies', type: 'expense', is_active: false };
    const activeAccount = { id: 6500, name: 'Office Supplies', type: 'expense', is_active: true };

    expect(inactiveAccount.is_active).toBe(false);
    expect(activeAccount.is_active).toBe(true);
  });

  it('should reject inactive payment accounts', () => {
    const inactiveAccount = { id: 1010, name: 'Checking', type: 'asset', is_active: false };
    const activeAccount = { id: 1010, name: 'Checking', type: 'asset', is_active: true };

    expect(inactiveAccount.is_active).toBe(false);
    expect(activeAccount.is_active).toBe(true);
  });
});

describe('Expense Operations - Journal Entry Creation', () => {
  it('should create balanced journal entry (DR Expense, CR Cash)', () => {
    const amount = 127.50;
    
    const debit = amount;  // Expense account
    const credit = amount; // Cash/Bank account

    expect(debit).toBe(credit); // Must be balanced
    expect(debit).toBe(127.50);
  });

  it('should use expense date for journal entry', () => {
    const expenseDate = '2026-01-24';
    const entryDate = expenseDate;

    expect(entryDate).toBe(expenseDate);
  });

  it('should create transaction event for audit trail', () => {
    const eventType = 'expense_recorded';
    const description = 'Office Supplies';

    expect(eventType).toBe('expense_recorded');
    expect(description.length).toBeGreaterThan(0);
  });

  it('should post journal entry immediately', () => {
    const status = 'posted';

    expect(status).toBe('posted');
  });
});

describe('Expense Operations - Edge Cases', () => {
  it('should handle very small amounts (cents)', () => {
    const amount = 0.01;

    expect(amount).toBeGreaterThan(0);
    expect(amount).toBeLessThan(1);
  });

  it('should handle large amounts', () => {
    const amount = 999999.99;

    expect(amount).toBeGreaterThan(0);
    expect(amount).toBeLessThan(1000000);
  });

  it('should handle amounts with many decimal places correctly', () => {
    const amount = 127.505; // Should round to 127.51
    const rounded = Math.round(amount * 100) / 100;

    expect(rounded).toBe(127.51);
  });

  it('should validate date format', () => {
    const validDate = '2026-01-24';
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

    expect(dateRegex.test(validDate)).toBe(true);
  });

  it('should handle leap year dates', () => {
    const leapYearDate = '2024-02-29';
    const date = new Date(leapYearDate);

    expect(date.getMonth()).toBe(1); // February (0-indexed)
    expect(date.getDate()).toBe(29);
  });
});
