import { describe, it, expect } from 'vitest';
import { ARMatchingEngine } from '../../lib/domain/ar-matching';
import type { Payment, Invoice } from '../../lib/domain/types';

/**
 * AR Matching Engine Tests
 * 
 * Tests for payment-to-invoice matching algorithms
 */

const engine = new ARMatchingEngine();

// Helper to create test invoice
function createInvoice(id: number, amount: number, paid: number, date: string, number: string): Invoice {
  return {
    id,
    invoice_number: number,
    contact_id: 1,
    event_id: 1,
    issue_date: date,
    due_date: date,
    status: 'sent',
    subtotal: amount * 0.885, // Approx before 13% tax
    tax_amount: amount * 0.115,
    total_amount: amount,
    paid_amount: paid,
    created_at: date,
    updated_at: date,
  };
}

// Helper to create test payment
function createPayment(amount: number, allocated: number, reference?: string): Payment {
  return {
    id: 1,
    payment_number: 'PAY-001',
    contact_id: 1,
    event_id: 1,
    payment_date: '2026-01-24',
    amount,
    payment_method: 'transfer',
    reference,
    allocated_amount: allocated,
    status: 'pending',
    created_at: '2026-01-24',
    updated_at: '2026-01-24',
  };
}

describe('AR Matching - Exact Reference Match', () => {
  it('should match payment by invoice number in reference', async () => {
    const invoices = [
      createInvoice(1, 1000, 0, '2026-01-20', 'INV-001'),
      createInvoice(2, 2000, 0, '2026-01-21', 'INV-002'),
    ];
    
    const payment = createPayment(1000, 0, 'INV-001');
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBe(1);
    expect(result.allocations[0].invoice.invoice_number).toBe('INV-001');
    expect(result.allocations[0].method).toBe('exact');
    expect(result.allocations[0].confidence).toBeGreaterThan(0.9);
  });

  it('should match payment with partial invoice number', async () => {
    const invoices = [
      createInvoice(1, 1000, 0, '2026-01-20', 'INV-12345'),
    ];
    
    const payment = createPayment(1000, 0, '12345');
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBe(1);
    expect(result.allocations[0].invoice.invoice_number).toBe('INV-12345');
  });

  it('should be case-insensitive', async () => {
    const invoices = [
      createInvoice(1, 1000, 0, '2026-01-20', 'INV-001'),
    ];
    
    const payment = createPayment(1000, 0, 'inv-001');
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBe(1);
    expect(result.allocations[0].invoice.invoice_number).toBe('INV-001');
  });

  it('should trim whitespace when matching', async () => {
    const invoices = [
      createInvoice(1, 1000, 0, '2026-01-20', 'INV-001'),
    ];
    
    const payment = createPayment(1000, 0, '  INV-001  ');
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBe(1);
  });
});

describe('AR Matching - Amount Match', () => {
  it('should match payment that exactly equals invoice amount', async () => {
    const invoices = [
      createInvoice(1, 1000, 0, '2026-01-20', 'INV-001'),
      createInvoice(2, 2000, 0, '2026-01-21', 'INV-002'),
    ];
    
    const payment = createPayment(1000, 0);
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBeGreaterThan(0);
    expect(result.allocations[0].invoice.total_amount).toBe(1000);
  });

  it('should match within 2% tolerance', async () => {
    const invoices = [
      createInvoice(1, 1000, 0, '2026-01-20', 'INV-001'),
    ];
    
    // Payment is 1.5% different (within 2% tolerance)
    const payment = createPayment(1015, 0);
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBeGreaterThan(0);
  });

  it('should match combination of two invoices', async () => {
    const invoices = [
      createInvoice(1, 1000, 0, '2026-01-20', 'INV-001'),
      createInvoice(2, 500, 0, '2026-01-21', 'INV-002'),
    ];
    
    // Payment matches sum of both invoices
    const payment = createPayment(1500, 0);
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBe(2);
    expect(result.remainingAmount).toBeLessThan(0.01);
  });
});

describe('AR Matching - FIFO Allocation', () => {
  it('should allocate to oldest invoice first', async () => {
    const invoices = [
      createInvoice(1, 1234, 0, '2026-01-20', 'INV-001'), // Oldest
      createInvoice(2, 2345, 0, '2026-01-22', 'INV-002'),
      createInvoice(3, 3456, 0, '2026-01-24', 'INV-003'), // Newest
    ];
    
    // Payment amount doesn't match any invoice (forces FIFO)
    const payment = createPayment(1000, 0);
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBeGreaterThan(0);
    expect(result.allocations[0].invoice.issue_date).toBe('2026-01-20');
    expect(result.allocations[0].method).toBe('fifo');
  });

  it('should allocate across multiple invoices in FIFO order', async () => {
    const invoices = [
      createInvoice(1, 500, 0, '2026-01-20', 'INV-001'),
      createInvoice(2, 500, 0, '2026-01-21', 'INV-002'),
      createInvoice(3, 500, 0, '2026-01-22', 'INV-003'),
    ];
    
    const payment = createPayment(1200, 0); // Covers first 2 invoices + part of 3rd
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBe(3);
    expect(result.allocations[0].amount).toBe(500); // First invoice fully paid
    expect(result.allocations[1].amount).toBe(500); // Second invoice fully paid
    expect(result.allocations[2].amount).toBe(200); // Third invoice partially paid
  });

  it('should stop allocating when payment exhausted', async () => {
    const invoices = [
      createInvoice(1, 1000, 0, '2026-01-20', 'INV-001'),
      createInvoice(2, 1000, 0, '2026-01-21', 'INV-002'),
      createInvoice(3, 1000, 0, '2026-01-22', 'INV-003'),
    ];
    
    const payment = createPayment(1500, 0);
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBe(2);
    expect(result.remainingAmount).toBeLessThan(0.01);
  });
});

describe('AR Matching - Partial Payments', () => {
  it('should handle partially paid invoices', async () => {
    const invoices = [
      createInvoice(1, 1000, 300, '2026-01-20', 'INV-001'), // $700 outstanding
    ];
    
    const payment = createPayment(500, 0);
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBe(1);
    expect(result.allocations[0].amount).toBe(500);
    expect(result.remainingAmount).toBeLessThan(0.01);
  });

  it('should skip fully paid invoices', async () => {
    const invoices = [
      createInvoice(1, 1000, 1000, '2026-01-20', 'INV-001'), // Fully paid
      createInvoice(2, 1000, 0, '2026-01-21', 'INV-002'),
    ];
    
    const payment = createPayment(1000, 0);
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBe(1);
    expect(result.allocations[0].invoice.invoice_number).toBe('INV-002');
  });

  it('should handle already allocated payment amount', async () => {
    const invoices = [
      createInvoice(1, 1000, 0, '2026-01-20', 'INV-001'),
    ];
    
    const payment = createPayment(1000, 300); // $700 remaining
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBe(1);
    expect(result.allocations[0].amount).toBe(700);
  });
});

describe('AR Matching - Newest First Strategy', () => {
  it('should allocate to newest invoice first', () => {
    const invoices = [
      createInvoice(1, 1000, 0, '2026-01-20', 'INV-001'),
      createInvoice(2, 2000, 0, '2026-01-24', 'INV-002'), // Newest
    ];
    
    const payment = createPayment(1000, 0);
    
    const result = engine.allocateNewestFirst(payment, invoices);
    
    expect(result.allocations.length).toBeGreaterThan(0);
    expect(result.allocations[0].invoice.issue_date).toBe('2026-01-24');
  });
});

describe('AR Matching - Contact Filtering', () => {
  it('should only match invoices from same contact', async () => {
    const invoices = [
      { ...createInvoice(1, 1000, 0, '2026-01-20', 'INV-001'), contact_id: 1 },
      { ...createInvoice(2, 2000, 0, '2026-01-21', 'INV-002'), contact_id: 2 },
    ];
    
    const payment = { ...createPayment(1000, 0), contact_id: 1 };
    
    const result = await engine.matchPayment(payment, invoices);
    
    // Should only allocate to contact 1's invoices
    for (const allocation of result.allocations) {
      expect(allocation.invoice.contact_id).toBe(1);
    }
  });

  it('should consider all invoices when payment has no contact', async () => {
    const invoices = [
      { ...createInvoice(1, 1000, 0, '2026-01-20', 'INV-001'), contact_id: 1 },
      { ...createInvoice(2, 2000, 0, '2026-01-21', 'INV-002'), contact_id: 2 },
    ];
    
    const payment = { ...createPayment(1000, 0), contact_id: undefined };
    
    const result = await engine.matchPayment(payment, invoices);
    
    // Should consider any invoice
    expect(result.allocations.length).toBeGreaterThan(0);
  });
});

describe('AR Matching - Edge Cases', () => {
  it('should handle empty invoice list', async () => {
    const payment = createPayment(1000, 0);
    
    const result = await engine.matchPayment(payment, []);
    
    expect(result.allocations.length).toBe(0);
    expect(result.remainingAmount).toBe(1000);
  });

  it('should handle overpayment scenario', async () => {
    const invoices = [
      createInvoice(1, 500, 0, '2026-01-20', 'INV-001'),
    ];
    
    const payment = createPayment(1000, 0); // Pays more than invoice
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBe(1);
    expect(result.allocations[0].amount).toBe(500);
    expect(result.remainingAmount).toBe(500); // Excess amount
  });

  it('should handle very small remaining amounts (cents)', async () => {
    const invoices = [
      createInvoice(1, 100.01, 0, '2026-01-20', 'INV-001'),
    ];
    
    const payment = createPayment(100.02, 0);
    
    const result = await engine.matchPayment(payment, invoices);
    
    expect(result.allocations.length).toBe(1);
    expect(result.remainingAmount).toBeLessThan(0.02);
  });
});
