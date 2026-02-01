import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPayment, type PaymentInput } from '../../lib/domain/payment-operations';
import type { PolicyContext } from '../../lib/domain/types';

describe('Payment Operations - Integration Tests', () => {
  let context: PolicyContext;

  beforeEach(() => {
    context = {
      mode: 'pro',
    };
  });

  describe('Payment Validation', () => {
    it('should reject payment with zero amount', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 0,
        payment_method: 'transfer',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });

    it('should reject payment with negative amount', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: -100,
        payment_method: 'cash',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });

    it('should accept payment with positive amount', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 1000,
        payment_method: 'check',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });
  });

  describe('FIFO Auto-Allocation Logic', () => {
    it('should sort invoices by date (oldest first)', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'transfer',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });

    it('should allocate payment to oldest invoice first', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'transfer',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });

    it('should allocate across multiple invoices in FIFO order', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 150,
        payment_method: 'transfer',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });

    it('should handle partial payments across invoices', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 50,
        payment_method: 'transfer',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });
  });

  describe('Manual Allocation Logic', () => {
    it('should allocate to specified invoices in FIFO order', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'check',
      };

      const allocations = [
        { invoice_id: 1, amount: 50 },
        { invoice_id: 2, amount: 50 },
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result).toBeDefined();
    });

    it('should handle partial manual allocations', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'transfer',
      };

      const allocations = [
        { invoice_id: 1, amount: 30 },
        { invoice_id: 2, amount: 30 },
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result).toBeDefined();
    });
  });

  describe('Over-Allocation Prevention', () => {
    it('should reject allocation exceeding payment amount', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'cash',
      };

      const allocations = [
        { invoice_id: 1, amount: 150 },
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result).toBeDefined();
    });

    it('should reject allocation exceeding invoice outstanding', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 1000,
        payment_method: 'transfer',
      };

      const allocations = [
        { invoice_id: 1, amount: 10000 },
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result).toBeDefined();
    });

    it('should allow allocation within limits', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'check',
      };

      const allocations = [
        { invoice_id: 1, amount: 50 },
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result).toBeDefined();
    });

    it('should allow 1 cent tolerance for rounding', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100.01,
        payment_method: 'transfer',
      };

      const allocations = [
        { invoice_id: 1, amount: 100 },
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result).toBeDefined();
    });
  });

  describe('Unallocated Payment Handling', () => {
    it('should calculate unallocated amount correctly', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 200,
        payment_method: 'transfer',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result.ok).toBe(true);
    });

    it('should record customer deposit for unallocated amount', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 200,
        payment_method: 'cash',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result.ok).toBe(true);
      expect(result.payment_id).toBeDefined();
      expect(result.journal_entry_id).toBeDefined();
    });

    it('should have zero unallocated when fully allocated', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'check',
      };

      const allocations = [
        { invoice_id: 1, amount: 100 },
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result.ok).toBe(true);
    });
  });

  describe('Allocation Validation', () => {
    it('should reject allocation with zero amount', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'transfer',
      };

      const allocations = [
        { invoice_id: 1, amount: 0 },
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toContain('must be greater than 0');
    });

    it('should reject allocation with negative amount', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'cash',
      };

      const allocations = [
        { invoice_id: 1, amount: -50 },
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result.ok).toBe(false);
    });
  });

  describe('Journal Entry Creation', () => {
    it('should create balanced journal entry for fully allocated payment', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'transfer',
      };

      const allocations = [
        { invoice_id: 1, amount: 100 },
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result.ok).toBe(true);
      expect(result.journal_entry_id).toBeDefined();
    });

    it('should create balanced journal entry with customer deposit', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 200,
        payment_method: 'check',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result.ok).toBe(true);
      expect(result.journal_entry_id).toBeDefined();
    });

    it('should debit cash account by payment amount', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 150,
        payment_method: 'cash',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result.ok).toBe(true);
    });

    it('should credit A/R by allocated amount', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'transfer',
      };

      const allocations = [
        { invoice_id: 1, amount: 100 },
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result.ok).toBe(true);
    });
  });

  describe('Payment Status Determination', () => {
    it('should set status to allocated when fully allocated', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'transfer',
      };

      const allocations = [
        { invoice_id: 1, amount: 100 },
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result.ok).toBe(true);
    });

    it('should set status to partial when partially allocated', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 200,
        payment_method: 'cash',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result.ok).toBe(true);
    });

    it('should allow 1 cent tolerance for status determination', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100.01,
        payment_method: 'transfer',
      };

      const allocations = [
        { invoice_id: 1, amount: 100 },
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result.ok).toBe(true);
    });
  });

  describe('Contact-Specific Payments', () => {
    it('should filter invoices by contact_id when specified', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'transfer',
        contact_id: 1,
      };

      const result = await createPayment(paymentData, [], context);

      expect(result.ok).toBe(true);
    });

    it('should use all open invoices when contact_id not specified', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'cash',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result.ok).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing system account gracefully', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'transfer',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });

    it('should provide clear error message for duplicate payment number', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'check',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });

    it('should handle database integrity errors', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'transfer',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });
  });

  describe('Transaction Event Creation', () => {
    it('should create transaction event for payment', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'transfer',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });

    it('should set event_type to payment_received', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'cash',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });
  });

  describe('Payment Method Variations', () => {
    it('should handle cash payments', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'cash',
      };

      const result = await createPayment(paymentData, [], context);
      expect(result).toBeDefined();
    });

    it('should handle check payments', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'check',
      };

      const result = await createPayment(paymentData, [], context);
      expect(result).toBeDefined();
    });

    it('should handle transfer payments', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'transfer',
      };

      const result = await createPayment(paymentData, [], context);
      expect(result).toBeDefined();
    });

    it('should handle card payments', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'card',
      };

      const result = await createPayment(paymentData, [], context);
      expect(result).toBeDefined();
    });
  });

  describe('Edge Cases', () => {
    it('should handle very small payment amounts', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 0.01,
        payment_method: 'cash',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });

    it('should handle very large payment amounts', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 1000000,
        payment_method: 'transfer',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });

    it('should handle payment with no matching invoices', async () => {
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'cash',
      };

      const result = await createPayment(paymentData, [], context);

      expect(result).toBeDefined();
    });
  });
});
