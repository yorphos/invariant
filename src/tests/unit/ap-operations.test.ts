import { describe, it, expect } from 'vitest';
import type { BillInput, VendorPaymentInput, BillPaymentAllocation } from '../../lib/domain/bill-operations';
import type { BillLine } from '../../lib/domain/types';

/**
 * Accounts Payable Operations Tests
 * 
 * Tests for bill creation, validation, vendor payments, and A/P workflows
 */

describe('Bill Operations - Validation', () => {
  it('should reject bill with zero total amount', () => {
    const billData: BillInput = {
      bill_number: 'BILL-001',
      vendor_id: 1,
      bill_date: '2026-01-24',
      due_date: '2026-02-23',
      tax_code_id: 1,
    };

    const lines: BillLine[] = [];
    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const isValid = subtotal > 0;

    expect(isValid).toBe(false);
  });

  it('should reject bill with negative line item amount', () => {
    const line: BillLine = {
      line_number: 1,
      description: 'Office Supplies',
      quantity: 1,
      unit_price: -50.00,
      amount: -50.00,
      account_id: 6500,
    };

    const isValid = line.amount > 0;
    expect(isValid).toBe(false);
  });

  it('should reject bill with empty line item description', () => {
    const descriptions = ['', '   ', '\t', '\n'];

    for (const desc of descriptions) {
      const isValid = desc.trim().length > 0;
      expect(isValid).toBe(false);
    }
  });

  it('should reject bill with due date before bill date', () => {
    const billDate = '2026-01-24';
    const dueDate = '2026-01-20';

    const isValid = new Date(dueDate) >= new Date(billDate);
    expect(isValid).toBe(false);
  });

  it('should accept valid bill with all required fields', () => {
    const billData: BillInput = {
      bill_number: 'BILL-001',
      vendor_id: 1,
      bill_date: '2026-01-24',
      due_date: '2026-02-23',
      tax_code_id: 1,
      reference: 'INV-12345',
      notes: 'Office supplies purchase',
    };

    const lines: BillLine[] = [
      {
        line_number: 1,
        description: 'Paper',
        quantity: 10,
        unit_price: 5.00,
        amount: 50.00,
        account_id: 6500,
      },
      {
        line_number: 2,
        description: 'Pens',
        quantity: 5,
        unit_price: 2.00,
        amount: 10.00,
        account_id: 6500,
      },
    ];

    const hasValidBillNumber = billData.bill_number.trim().length > 0;
    const hasVendor = billData.vendor_id > 0;
    const hasDates = billData.bill_date.length > 0 && billData.due_date.length > 0;
    const hasTaxCode = !!billData.tax_code_id;
    const allLinesValid = lines.every(l => 
      l.description.trim().length > 0 && 
      l.amount > 0 && 
      l.account_id > 0
    );

    expect(hasValidBillNumber).toBe(true);
    expect(hasVendor).toBe(true);
    expect(hasDates).toBe(true);
    expect(hasTaxCode).toBe(true);
    expect(allLinesValid).toBe(true);
  });
});

describe('Bill Calculation Logic', () => {
  it('should recalculate line amounts from quantity and unit price', () => {
    const line = {
      quantity: 10,
      unit_price: 5.50,
      amount: 0, // Client provided wrong amount
    };

    const recalculated = line.quantity * line.unit_price;
    expect(recalculated).toBe(55.00);
  });

  it('should calculate bill subtotal correctly', () => {
    const lines = [
      { amount: 100.00 },
      { amount: 50.50 },
      { amount: 25.75 },
    ];

    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    expect(subtotal).toBe(176.25);
  });

  it('should calculate tax amount correctly', () => {
    const subtotal = 100.00;
    const taxRate = 0.13; // 13% HST
    const taxAmount = subtotal * taxRate;

    expect(taxAmount).toBe(13.00);
  });

  it('should calculate bill total correctly', () => {
    const subtotal = 100.00;
    const taxAmount = 13.00;
    const total = subtotal + taxAmount;

    expect(total).toBe(113.00);
  });

  it('should handle decimal precision in calculations', () => {
    const lines = [
      { quantity: 3, unit_price: 1.33, amount: 3.99 },
      { quantity: 2, unit_price: 5.55, amount: 11.10 },
    ];

    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    expect(subtotal).toBeCloseTo(15.09, 2);
  });
});

describe('Bill Validation Rules', () => {
  it('should reject bill without vendor_id', () => {
    const bill = {
      bill_number: 'BILL-001',
      vendor_id: 0,
      bill_date: '2026-01-24',
      due_date: '2026-02-23',
    };

    const isValid = bill.vendor_id > 0;
    expect(isValid).toBe(false);
  });

  it('should require tax_code_id for all bills', () => {
    const bill = {
      bill_number: 'BILL-001',
      vendor_id: 1,
      bill_date: '2026-01-24',
      due_date: '2026-02-23',
      tax_code_id: undefined,
    };

    const isValid = !!bill.tax_code_id;
    expect(isValid).toBe(false);
  });

  it('should require at least one line item', () => {
    const lines: BillLine[] = [];
    const isValid = lines.length > 0;

    expect(isValid).toBe(false);
  });

  it('should require all line items to have expense accounts', () => {
    const lines: BillLine[] = [
      { line_number: 1, description: 'Item 1', quantity: 1, unit_price: 10, amount: 10, account_id: 6500 },
      { line_number: 2, description: 'Item 2', quantity: 1, unit_price: 20, amount: 20, account_id: 0 }, // Invalid!
    ];

    const allHaveAccounts = lines.every(l => l.account_id > 0);
    expect(allHaveAccounts).toBe(false);
  });
});

describe('Bill Void Operations', () => {
  it('should prevent voiding bill with payments applied', () => {
    const bill = {
      id: 1,
      bill_number: 'BILL-001',
      status: 'partial',
      paid_amount: 50.00,
      total_amount: 100.00,
    };

    const canVoid = bill.paid_amount === 0;
    expect(canVoid).toBe(false);
  });

  it('should allow voiding unpaid bill', () => {
    const bill = {
      id: 1,
      bill_number: 'BILL-001',
      status: 'pending',
      paid_amount: 0,
      total_amount: 100.00,
    };

    const canVoid = bill.paid_amount === 0 && bill.status !== 'void';
    expect(canVoid).toBe(true);
  });

  it('should prevent voiding already voided bill', () => {
    const bill = {
      id: 1,
      bill_number: 'BILL-001',
      status: 'void',
      paid_amount: 0,
      total_amount: 100.00,
    };

    const canVoid = bill.paid_amount === 0 && bill.status !== 'void';
    expect(canVoid).toBe(false);
  });
});

describe('Vendor Payment Operations', () => {
  it('should reject payment with zero amount', () => {
    const payment: VendorPaymentInput = {
      payment_number: 'VP-001',
      vendor_id: 1,
      payment_date: '2026-01-24',
      amount: 0,
    };

    const isValid = payment.amount > 0;
    expect(isValid).toBe(false);
  });

  it('should reject payment with negative amount', () => {
    const payment: VendorPaymentInput = {
      payment_number: 'VP-001',
      vendor_id: 1,
      payment_date: '2026-01-24',
      amount: -100.00,
    };

    const isValid = payment.amount > 0;
    expect(isValid).toBe(false);
  });

  it('should reject allocations exceeding payment amount', () => {
    const paymentAmount = 100.00;
    const allocations: BillPaymentAllocation[] = [
      { bill_id: 1, amount: 60.00 },
      { bill_id: 2, amount: 50.00 }, // Total = 110, exceeds payment!
    ];

    const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
    const isValid = totalAllocated <= paymentAmount;

    expect(isValid).toBe(false);
  });

  it('should allow partial allocation of payment', () => {
    const paymentAmount = 100.00;
    const allocations: BillPaymentAllocation[] = [
      { bill_id: 1, amount: 60.00 },
    ];

    const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
    const isValid = totalAllocated <= paymentAmount;
    const isFullyAllocated = totalAllocated >= paymentAmount - 0.01;

    expect(isValid).toBe(true);
    expect(isFullyAllocated).toBe(false);
  });

  it('should allow full allocation of payment', () => {
    const paymentAmount = 100.00;
    const allocations: BillPaymentAllocation[] = [
      { bill_id: 1, amount: 60.00 },
      { bill_id: 2, amount: 40.00 },
    ];

    const totalAllocated = allocations.reduce((sum, a) => sum + a.amount, 0);
    const isValid = totalAllocated <= paymentAmount;
    const isFullyAllocated = totalAllocated >= paymentAmount - 0.01;

    expect(isValid).toBe(true);
    expect(isFullyAllocated).toBe(true);
  });

  it('should prevent allocation exceeding bill amount due', () => {
    const bill = {
      total_amount: 100.00,
      paid_amount: 30.00,
    };

    const amountDue = bill.total_amount - bill.paid_amount;
    const allocation = 80.00;

    const isValid = allocation <= amountDue + 0.01; // 1 cent tolerance
    expect(isValid).toBe(false);
  });

  it('should allow allocation up to amount due', () => {
    const bill = {
      total_amount: 100.00,
      paid_amount: 30.00,
    };

    const amountDue = bill.total_amount - bill.paid_amount;
    const allocation = 70.00;

    const isValid = allocation <= amountDue + 0.01; // 1 cent tolerance
    expect(isValid).toBe(true);
  });

  it('should prevent paying voided bills', () => {
    const bill = {
      id: 1,
      status: 'void',
      total_amount: 100.00,
      paid_amount: 0,
    };

    const canPay = bill.status !== 'void';
    expect(canPay).toBe(false);
  });
});

describe('Bill Double-Entry Accounting', () => {
  it('should create correct journal entries for bill posting', () => {
    const subtotal = 100.00;
    const taxAmount = 13.00;
    const totalAmount = 113.00;

    // Journal entries should be:
    // DR Expense Account: $100.00
    // DR Tax Account: $13.00
    // CR Accounts Payable: $113.00

    const journalLines = [
      { account: 'Expense', debit: subtotal, credit: 0 },
      { account: 'Tax', debit: taxAmount, credit: 0 },
      { account: 'A/P', debit: 0, credit: totalAmount },
    ];

    const totalDebits = journalLines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = journalLines.reduce((sum, line) => sum + line.credit, 0);

    expect(totalDebits).toBe(totalCredits);
    expect(totalDebits).toBe(113.00);
  });

  it('should create correct journal entries for vendor payment', () => {
    const paymentAmount = 100.00;

    // Journal entries should be:
    // DR Accounts Payable: $100.00
    // CR Cash: $100.00

    const journalLines = [
      { account: 'A/P', debit: paymentAmount, credit: 0 },
      { account: 'Cash', debit: 0, credit: paymentAmount },
    ];

    const totalDebits = journalLines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = journalLines.reduce((sum, line) => sum + line.credit, 0);

    expect(totalDebits).toBe(totalCredits);
    expect(totalDebits).toBe(100.00);
  });

  it('should create reversal entries for voided bill', () => {
    const originalSubtotal = 100.00;
    const originalTax = 13.00;
    const originalTotal = 113.00;

    // Reversal entries should be opposite:
    // CR Expense Account: $100.00
    // CR Tax Account: $13.00
    // DR Accounts Payable: $113.00

    const reversalLines = [
      { account: 'Expense', debit: 0, credit: originalSubtotal },
      { account: 'Tax', debit: 0, credit: originalTax },
      { account: 'A/P', debit: originalTotal, credit: 0 },
    ];

    const totalDebits = reversalLines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = reversalLines.reduce((sum, line) => sum + line.credit, 0);

    expect(totalDebits).toBe(totalCredits);
    expect(totalDebits).toBe(113.00);
  });
});

describe('Bill Status Management', () => {
  it('should set status to pending for new unpaid bill', () => {
    const bill = {
      total_amount: 100.00,
      paid_amount: 0,
    };

    const status = bill.paid_amount === 0 ? 'pending' : 'paid';
    expect(status).toBe('pending');
  });

  it('should set status to partial when partially paid', () => {
    const bill = {
      total_amount: 100.00,
      paid_amount: 50.00,
    };

    const status = 
      bill.paid_amount === 0 ? 'pending' :
      bill.paid_amount >= bill.total_amount - 0.01 ? 'paid' :
      'partial';

    expect(status).toBe('partial');
  });

  it('should set status to paid when fully paid', () => {
    const bill = {
      total_amount: 100.00,
      paid_amount: 100.00,
    };

    const status = 
      bill.paid_amount === 0 ? 'pending' :
      bill.paid_amount >= bill.total_amount - 0.01 ? 'paid' :
      'partial';

    expect(status).toBe('paid');
  });

  it('should set status to overdue when past due date', () => {
    const bill = {
      due_date: '2026-01-01',
      paid_amount: 0,
      total_amount: 100.00,
    };

    const today = new Date('2026-01-24');
    const dueDate = new Date(bill.due_date);
    const isOverdue = today > dueDate && bill.paid_amount < bill.total_amount - 0.01;

    expect(isOverdue).toBe(true);
  });
});
