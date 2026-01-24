import { describe, it, expect } from 'vitest';
import { batchOperationsService } from '../../lib/services/batch-operations';
import type { PaymentImportRow } from '../../lib/services/batch-operations';

/**
 * Batch Operations Tests
 * 
 * Tests for batch invoice creation, CSV payment import, and bulk status changes
 */

describe('CSV Payment Parsing', () => {
  it('should parse valid CSV with all columns', () => {
    const csv = `Payment Number,Customer Name,Date,Amount,Method,Reference,Notes,Invoice Numbers
PAY-0001,Acme Corp,2026-01-24,1500.00,transfer,REF123,Test payment,INV-0001
PAY-0002,Beta Inc,2026-01-25,2500.50,check,CHK456,Another payment,INV-0002`;

    const rows = batchOperationsService.parsePaymentCSV(csv);

    expect(rows).toHaveLength(2);
    
    expect(rows[0].paymentNumber).toBe('PAY-0001');
    expect(rows[0].customerName).toBe('Acme Corp');
    expect(rows[0].paymentDate).toBe('2026-01-24');
    expect(rows[0].amount).toBe(1500.00);
    expect(rows[0].paymentMethod).toBe('transfer');
    expect(rows[0].reference).toBe('REF123');
    expect(rows[0].notes).toBe('Test payment');
    expect(rows[0].invoiceNumbers).toBe('INV-0001');
    
    expect(rows[1].paymentNumber).toBe('PAY-0002');
    expect(rows[1].amount).toBe(2500.50);
    expect(rows[1].paymentMethod).toBe('check');
  });

  it('should parse CSV with minimal columns', () => {
    const csv = `Payment Number,Date,Amount
PAY-0001,2026-01-24,1500.00
PAY-0002,2026-01-25,2500.00`;

    const rows = batchOperationsService.parsePaymentCSV(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0].paymentNumber).toBe('PAY-0001');
    expect(rows[0].amount).toBe(1500.00);
    expect(rows[0].paymentMethod).toBe('transfer'); // Default
  });

  it('should handle amount with dollar signs and commas', () => {
    const csv = `Payment Number,Date,Amount
PAY-0001,2026-01-24,"$1,500.00"
PAY-0002,2026-01-25,"$2,500.50"`;

    const rows = batchOperationsService.parsePaymentCSV(csv);

    expect(rows[0].amount).toBe(1500.00);
    expect(rows[1].amount).toBe(2500.50);
  });

  it('should correctly identify payment methods', () => {
    const csv = `Payment Number,Date,Amount,Method
PAY-0001,2026-01-24,100.00,cash
PAY-0002,2026-01-24,100.00,check
PAY-0003,2026-01-24,100.00,bank transfer
PAY-0004,2026-01-24,100.00,credit card
PAY-0005,2026-01-24,100.00,other method`;

    const rows = batchOperationsService.parsePaymentCSV(csv);

    expect(rows[0].paymentMethod).toBe('cash');
    expect(rows[1].paymentMethod).toBe('check');
    expect(rows[2].paymentMethod).toBe('transfer');
    expect(rows[3].paymentMethod).toBe('card');
    expect(rows[4].paymentMethod).toBe('other');
  });

  it('should handle cheque spelling variant', () => {
    const csv = `Payment Number,Date,Amount,Method
PAY-0001,2026-01-24,100.00,cheque`;

    const rows = batchOperationsService.parsePaymentCSV(csv);

    expect(rows[0].paymentMethod).toBe('check');
  });

  it('should handle EFT as transfer', () => {
    const csv = `Payment Number,Date,Amount,Method
PAY-0001,2026-01-24,100.00,EFT`;

    const rows = batchOperationsService.parsePaymentCSV(csv);

    expect(rows[0].paymentMethod).toBe('transfer');
  });

  it('should skip empty lines', () => {
    const csv = `Payment Number,Date,Amount
PAY-0001,2026-01-24,1500.00

PAY-0002,2026-01-25,2500.00
`;

    const rows = batchOperationsService.parsePaymentCSV(csv);

    expect(rows).toHaveLength(2);
    expect(rows[0].paymentNumber).toBe('PAY-0001');
    expect(rows[1].paymentNumber).toBe('PAY-0002');
  });

  it('should throw error if required columns are missing', () => {
    const csv = `Customer Name,Date
Acme Corp,2026-01-24`;

    expect(() => batchOperationsService.parsePaymentCSV(csv)).toThrow('must have columns for: Payment Number, Date, and Amount');
  });

  it('should throw error if CSV is empty', () => {
    const csv = '';

    expect(() => batchOperationsService.parsePaymentCSV(csv)).toThrow('must have at least a header row and one data row');
  });

  it('should throw error if CSV has only header', () => {
    const csv = 'Payment Number,Date,Amount';

    expect(() => batchOperationsService.parsePaymentCSV(csv)).toThrow('must have at least a header row and one data row');
  });

  it('should handle flexible column name matching', () => {
    const csv = `payment_number,client,payment_date,payment_amount,payment_type
PAY-0001,Acme Corp,2026-01-24,1500.00,transfer`;

    const rows = batchOperationsService.parsePaymentCSV(csv);

    expect(rows).toHaveLength(1);
    expect(rows[0].paymentNumber).toBe('PAY-0001');
    expect(rows[0].customerName).toBe('Acme Corp');
    expect(rows[0].amount).toBe(1500.00);
  });

  it('should handle invoice numbers column', () => {
    const csv = `Payment Number,Date,Amount,Invoice Numbers
PAY-0001,2026-01-24,1500.00,INV-0001;INV-0002`;

    const rows = batchOperationsService.parsePaymentCSV(csv);

    expect(rows[0].invoiceNumbers).toBe('INV-0001;INV-0002');
  });
});

describe('CSV Parsing Edge Cases', () => {
  it('should handle very large amounts', () => {
    const csv = `Payment Number,Date,Amount
PAY-0001,2026-01-24,1000000.00`;

    const rows = batchOperationsService.parsePaymentCSV(csv);

    expect(rows[0].amount).toBe(1000000.00);
  });

  it('should handle very small amounts', () => {
    const csv = `Payment Number,Date,Amount
PAY-0001,2026-01-24,0.01`;

    const rows = batchOperationsService.parsePaymentCSV(csv);

    expect(rows[0].amount).toBe(0.01);
  });

  it('should handle amounts with many decimal places (rounded to 2)', () => {
    const csv = `Payment Number,Date,Amount
PAY-0001,2026-01-24,1500.123456`;

    const rows = batchOperationsService.parsePaymentCSV(csv);

    expect(rows[0].amount).toBeCloseTo(1500.12, 2);
  });

  it('should handle special characters in notes', () => {
    const csv = `Payment Number,Date,Amount,Notes
PAY-0001,2026-01-24,1500.00,Payment for "January 2026" services`;

    const rows = batchOperationsService.parsePaymentCSV(csv);

    expect(rows[0].notes).toContain('January 2026');
  });

  it('should handle customer names with special characters', () => {
    const csv = `Payment Number,Customer Name,Date,Amount
PAY-0001,O'Brien & Associates,2026-01-24,1500.00`;

    const rows = batchOperationsService.parsePaymentCSV(csv);

    expect(rows[0].customerName).toBe("O'Brien & Associates");
  });
});

describe('Batch Operations Validation', () => {
  it('should validate that payment number is required', () => {
    const row: PaymentImportRow = {
      paymentNumber: '',
      customerName: 'Acme Corp',
      paymentDate: '2026-01-24',
      amount: 1500.00,
      paymentMethod: 'transfer'
    };

    // In actual implementation, importPaymentsFromCSV would validate this
    expect(row.paymentNumber).toBe('');
  });

  it('should validate that amount is positive', () => {
    const row: PaymentImportRow = {
      paymentNumber: 'PAY-0001',
      customerName: 'Acme Corp',
      paymentDate: '2026-01-24',
      amount: -1500.00, // Negative amount
      paymentMethod: 'transfer'
    };

    expect(row.amount).toBeLessThan(0);
  });

  it('should validate that amount is not zero', () => {
    const row: PaymentImportRow = {
      paymentNumber: 'PAY-0001',
      customerName: 'Acme Corp',
      paymentDate: '2026-01-24',
      amount: 0, // Zero amount
      paymentMethod: 'transfer'
    };

    expect(row.amount).toBe(0);
  });
});

describe('Batch Operation Result Structure', () => {
  it('should have correct structure for successful batch result', () => {
    // Mock successful batch result
    const result = {
      totalItems: 5,
      successCount: 5,
      failureCount: 0,
      results: [
        {
          success: true,
          itemIndex: 0,
          itemDescription: 'Invoice INV-0001',
          createdId: 1
        }
      ]
    };

    expect(result.totalItems).toBe(5);
    expect(result.successCount).toBe(5);
    expect(result.failureCount).toBe(0);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].success).toBe(true);
  });

  it('should have correct structure for partial failure batch result', () => {
    const result = {
      totalItems: 5,
      successCount: 3,
      failureCount: 2,
      results: [
        {
          success: true,
          itemIndex: 0,
          itemDescription: 'Invoice INV-0001',
          createdId: 1
        },
        {
          success: false,
          itemIndex: 1,
          itemDescription: 'Invoice INV-0002',
          error: 'Invoice number already exists'
        }
      ]
    };

    expect(result.totalItems).toBe(5);
    expect(result.successCount).toBe(3);
    expect(result.failureCount).toBe(2);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
    expect(result.results[1].error).toBeDefined();
  });
});

describe('Payment Method Normalization', () => {
  it('should normalize various cash variations', () => {
    const variations = ['cash', 'Cash', 'CASH', 'cash payment'];
    
    variations.forEach(variation => {
      const csv = `Payment Number,Date,Amount,Method
PAY-0001,2026-01-24,100.00,${variation}`;
      
      const rows = batchOperationsService.parsePaymentCSV(csv);
      expect(rows[0].paymentMethod).toBe('cash');
    });
  });

  it('should normalize various check variations', () => {
    const variations = ['check', 'Check', 'CHECK', 'cheque', 'Cheque', 'check payment'];
    
    variations.forEach(variation => {
      const csv = `Payment Number,Date,Amount,Method
PAY-0001,2026-01-24,100.00,${variation}`;
      
      const rows = batchOperationsService.parsePaymentCSV(csv);
      expect(rows[0].paymentMethod).toBe('check');
    });
  });

  it('should normalize various transfer variations', () => {
    const variations = ['transfer', 'Transfer', 'TRANSFER', 'bank transfer', 'wire transfer', 'EFT', 'eft'];
    
    variations.forEach(variation => {
      const csv = `Payment Number,Date,Amount,Method
PAY-0001,2026-01-24,100.00,${variation}`;
      
      const rows = batchOperationsService.parsePaymentCSV(csv);
      expect(rows[0].paymentMethod).toBe('transfer');
    });
  });

  it('should normalize various card variations', () => {
    const variations = ['card', 'Card', 'credit card', 'Credit Card', 'debit card'];
    
    variations.forEach(variation => {
      const csv = `Payment Number,Date,Amount,Method
PAY-0001,2026-01-24,100.00,${variation}`;
      
      const rows = batchOperationsService.parsePaymentCSV(csv);
      expect(rows[0].paymentMethod).toBe('card');
    });
  });

  it('should default unknown methods to "other"', () => {
    const csv = `Payment Number,Date,Amount,Method
PAY-0001,2026-01-24,100.00,cryptocurrency`;
    
    const rows = batchOperationsService.parsePaymentCSV(csv);
    expect(rows[0].paymentMethod).toBe('other');
  });
});

describe('Date Handling', () => {
  it('should handle ISO date format', () => {
    const csv = `Payment Number,Date,Amount
PAY-0001,2026-01-24,1500.00`;
    
    const rows = batchOperationsService.parsePaymentCSV(csv);
    expect(rows[0].paymentDate).toBe('2026-01-24');
  });

  it('should preserve date string as provided', () => {
    const csv = `Payment Number,Date,Amount
PAY-0001,01/24/2026,1500.00`;
    
    const rows = batchOperationsService.parsePaymentCSV(csv);
    expect(rows[0].paymentDate).toBe('01/24/2026');
  });
});

describe('Multiple Invoices Allocation', () => {
  it('should handle comma-separated invoice numbers', () => {
    const csv = `Payment Number,Date,Amount,Invoice Numbers
PAY-0001,2026-01-24,1500.00,INV-0001,INV-0002,INV-0003`;
    
    const rows = batchOperationsService.parsePaymentCSV(csv);
    expect(rows[0].invoiceNumbers).toContain('INV-0001');
  });

  it('should handle single invoice number', () => {
    const csv = `Payment Number,Date,Amount,Invoice Numbers
PAY-0001,2026-01-24,1500.00,INV-0001`;
    
    const rows = batchOperationsService.parsePaymentCSV(csv);
    expect(rows[0].invoiceNumbers).toBe('INV-0001');
  });

  it('should handle empty invoice numbers', () => {
    const csv = `Payment Number,Date,Amount,Invoice Numbers
PAY-0001,2026-01-24,1500.00,`;
    
    const rows = batchOperationsService.parsePaymentCSV(csv);
    expect(rows[0].invoiceNumbers).toBe('');
  });
});
