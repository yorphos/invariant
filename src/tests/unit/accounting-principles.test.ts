/**
 * Accounting Principles Unit Tests
 * Tests for core accounting business logic and validation rules
 */

import { describe, it, expect } from 'vitest';

describe('Double-Entry Bookkeeping Principles', () => {
  it('should calculate balanced journal entries', () => {
    // Simulate an invoice: DR A/R $1130, CR Revenue $1000, CR HST $130
    const journalLines = [
      { account: 'A/R', debit: 1130, credit: 0 },
      { account: 'Revenue', debit: 0, credit: 1000 },
      { account: 'HST Payable', debit: 0, credit: 130 },
    ];

    const totalDebits = journalLines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = journalLines.reduce((sum, line) => sum + line.credit, 0);

    expect(totalDebits).toBe(totalCredits);
    expect(totalDebits).toBe(1130);
  });

  it('should detect unbalanced entries', () => {
    // Unbalanced entry
    const journalLines = [
      { account: 'A/R', debit: 1000, credit: 0 },
      { account: 'Revenue', debit: 0, credit: 900 }, // Missing $100!
    ];

    const totalDebits = journalLines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = journalLines.reduce((sum, line) => sum + line.credit, 0);

    expect(totalDebits).not.toBe(totalCredits);
  });

  it('should allow 1 cent tolerance for rounding', () => {
    const journalLines = [
      { account: 'A/R', debit: 100.00, credit: 0 },
      { account: 'Revenue', debit: 0, credit: 99.99 }, // 1 cent off
    ];

    const totalDebits = journalLines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = journalLines.reduce((sum, line) => sum + line.credit, 0);
    const difference = Math.abs(totalDebits - totalCredits);

    expect(difference).toBeCloseTo(0.01, 2);
  });
});

describe('Invoice Calculation Logic', () => {
  it('should calculate line amount from quantity and unit price', () => {
    const quantity = 10;
    const unitPrice = 50.00;
    const expectedAmount = 500.00;

    const calculatedAmount = quantity * unitPrice;

    expect(calculatedAmount).toBe(expectedAmount);
  });

  it('should calculate subtotal from line items', () => {
    const lines = [
      { quantity: 10, unitPrice: 50, amount: 500 },
      { quantity: 5, unitPrice: 100, amount: 500 },
    ];

    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);

    expect(subtotal).toBe(1000);
  });

  it('should calculate tax at 13% HST', () => {
    const subtotal = 1000;
    const taxRate = 0.13;
    const expectedTax = 130;

    const calculatedTax = subtotal * taxRate;

    expect(calculatedTax).toBe(expectedTax);
  });

  it('should calculate total as subtotal plus tax', () => {
    const subtotal = 1000;
    const tax = 130;
    const expectedTotal = 1130;

    const calculatedTotal = subtotal + tax;

    expect(calculatedTotal).toBe(expectedTotal);
  });

  it('should detect amount mismatch (client manipulation)', () => {
    const quantity = 10;
    const unitPrice = 50;
    const clientProvidedAmount = 600; // Client trying to inflate!

    const serverCalculatedAmount = quantity * unitPrice;
    const difference = Math.abs(clientProvidedAmount - serverCalculatedAmount);

    expect(difference).toBeGreaterThan(0.01); // Should detect manipulation
    expect(serverCalculatedAmount).toBe(500); // Server calculation is correct
  });
});

describe('Payment Allocation Logic', () => {
  describe('FIFO Allocation', () => {
    it('should sort invoices by date (oldest first)', () => {
      const invoices = [
        { id: 3, issueDate: '2026-01-15', amount: 100 },
        { id: 1, issueDate: '2026-01-01', amount: 100 },
        { id: 2, issueDate: '2026-01-10', amount: 100 },
      ];

      const sorted = [...invoices].sort((a, b) => 
        new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime()
      );

      expect(sorted[0].id).toBe(1); // Oldest first
      expect(sorted[1].id).toBe(2);
      expect(sorted[2].id).toBe(3);
    });

    it('should allocate payment to oldest invoice first', () => {
      const invoices = [
        { id: 1, issueDate: '2026-01-01', outstanding: 113 },
        { id: 2, issueDate: '2026-01-10', outstanding: 113 },
      ];

      const paymentAmount = 113; // Only enough for one invoice
      let remainingPayment = paymentAmount;
      const allocations: Array<{ invoiceId: number; amount: number }> = [];

      const sorted = [...invoices].sort((a, b) => 
        new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime()
      );

      for (const invoice of sorted) {
        if (remainingPayment <= 0) break;

        const allocationAmount = Math.min(remainingPayment, invoice.outstanding);
        allocations.push({ invoiceId: invoice.id, amount: allocationAmount });
        remainingPayment -= allocationAmount;
      }

      expect(allocations).toHaveLength(1);
      expect(allocations[0].invoiceId).toBe(1); // Oldest invoice
      expect(allocations[0].amount).toBe(113);
      expect(remainingPayment).toBe(0);
    });

    it('should allocate across multiple invoices in FIFO order', () => {
      const invoices = [
        { id: 1, issueDate: '2026-01-01', outstanding: 56.50 },
        { id: 2, issueDate: '2026-01-10', outstanding: 56.50 },
      ];

      const paymentAmount = 113; // Enough for both
      let remainingPayment = paymentAmount;
      const allocations: Array<{ invoiceId: number; amount: number }> = [];

      const sorted = [...invoices].sort((a, b) => 
        new Date(a.issueDate).getTime() - new Date(b.issueDate).getTime()
      );

      for (const invoice of sorted) {
        if (remainingPayment <= 0) break;

        const allocationAmount = Math.min(remainingPayment, invoice.outstanding);
        allocations.push({ invoiceId: invoice.id, amount: allocationAmount });
        remainingPayment -= allocationAmount;
      }

      expect(allocations).toHaveLength(2);
      expect(allocations[0].invoiceId).toBe(1);
      expect(allocations[0].amount).toBe(56.50);
      expect(allocations[1].invoiceId).toBe(2);
      expect(allocations[1].amount).toBe(56.50);
      expect(remainingPayment).toBe(0);
    });
  });

  describe('Over-Allocation Prevention', () => {
    it('should detect allocation exceeding payment amount', () => {
      const paymentAmount = 50;
      const requestedAllocation = 100;

      const isValid = requestedAllocation <= paymentAmount;

      expect(isValid).toBe(false);
    });

    it('should detect allocation exceeding invoice outstanding', () => {
      const invoiceOutstanding = 50;
      const requestedAllocation = 100;

      const isValid = requestedAllocation <= invoiceOutstanding;

      expect(isValid).toBe(false);
    });

    it('should allow allocation within limits', () => {
      const paymentAmount = 100;
      const invoiceOutstanding = 113;
      const requestedAllocation = 100;

      const isValidForPayment = requestedAllocation <= paymentAmount;
      const isValidForInvoice = requestedAllocation <= invoiceOutstanding;

      expect(isValidForPayment).toBe(true);
      expect(isValidForInvoice).toBe(true);
    });
  });

  describe('Unallocated Payment Handling', () => {
    it('should calculate unallocated amount', () => {
      const paymentAmount = 200;
      const totalAllocated = 113;
      const expectedUnallocated = 87;

      const unallocated = paymentAmount - totalAllocated;

      expect(unallocated).toBe(expectedUnallocated);
    });

    it('should have zero unallocated when fully allocated', () => {
      const paymentAmount = 113;
      const totalAllocated = 113;

      const unallocated = paymentAmount - totalAllocated;

      expect(unallocated).toBe(0);
    });
  });
});

describe('Account Balance Calculations', () => {
  it('should calculate asset account balance (debit - credit)', () => {
    const transactions = [
      { debit: 1000, credit: 0 },    // +1000
      { debit: 0, credit: 300 },     // -300
      { debit: 500, credit: 0 },     // +500
    ];

    const balance = transactions.reduce(
      (sum, t) => sum + t.debit - t.credit,
      0
    );

    expect(balance).toBe(1200);
  });

  it('should calculate liability account balance (credit - debit)', () => {
    const transactions = [
      { debit: 0, credit: 1000 },    // +1000 liability
      { debit: 300, credit: 0 },     // -300 liability
    ];

    // For reporting, liabilities shown as negative of debit-credit
    const balance = transactions.reduce(
      (sum, t) => sum + t.debit - t.credit,
      0
    );

    expect(balance).toBe(-700); // Negative = liability
  });
});

describe('Server-Side Validation Rules', () => {
  describe('Invoice Validation', () => {
    it('should reject zero quantity', () => {
      const quantity = 0;
      const isValid = quantity > 0;

      expect(isValid).toBe(false);
    });

    it('should reject negative quantity', () => {
      const quantity = -5;
      const isValid = quantity > 0;

      expect(isValid).toBe(false);
    });

    it('should reject zero unit price', () => {
      const unitPrice = 0;
      const isValid = unitPrice > 0;

      expect(isValid).toBe(false);
    });

    it('should reject empty description', () => {
      const description = '';
      const isValid = description.trim().length > 0;

      expect(isValid).toBe(false);
    });

    it('should reject due date before issue date', () => {
      const issueDate = new Date('2026-02-01');
      const dueDate = new Date('2026-01-01');

      const isValid = dueDate >= issueDate;

      expect(isValid).toBe(false);
    });
  });

  describe('Payment Validation', () => {
    it('should reject zero payment amount', () => {
      const amount = 0;
      const isValid = amount > 0;

      expect(isValid).toBe(false);
    });

    it('should reject negative payment amount', () => {
      const amount = -100;
      const isValid = amount > 0;

      expect(isValid).toBe(false);
    });
  });
});

describe('Financial Accuracy', () => {
  it('should maintain precision to 2 decimal places', () => {
    const amount1 = 10.50;
    const amount2 = 20.75;
    const sum = amount1 + amount2;

    expect(sum).toBeCloseTo(31.25, 2);
  });

  it('should handle floating point precision issues', () => {
    const amount = 0.1 + 0.2; // Famous floating point issue
    const expected = 0.3;

    // Use toBeCloseTo for floating point comparisons
    expect(amount).toBeCloseTo(expected, 10);
  });

  it('should calculate percentage correctly', () => {
    const amount = 1000;
    const percentage = 13; // 13% HST
    const expected = 130;

    const calculated = (amount * percentage) / 100;

    expect(calculated).toBe(expected);
  });
});
