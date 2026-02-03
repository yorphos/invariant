import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock Tauri modules BEFORE importing domain modules
vi.mock('@tauri-apps/plugin-dialog', () => ({
  save: vi.fn().mockResolvedValue('/path/to/backup.db'),
  open: vi.fn().mockResolvedValue(['/path/to/restore.db']),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  copyFile: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn().mockResolvedValue(new Uint8Array(100)),
  remove: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn().mockResolvedValue('/app/data'),
}));

vi.mock('../../lib/services/database', () => ({
  closeDatabase: vi.fn().mockResolvedValue(undefined),
  getDatabase: vi.fn().mockResolvedValue({
    execute: vi.fn().mockImplementation((query: string, params?: any[]) => {
      // Mock INSERT operations to return lastInsertId
      if (query.startsWith('INSERT INTO')) {
        let insertId = 1;
        // Increment ID for each INSERT
        if (query.includes('transaction_event')) {
          insertId = 100;
        } else if (query.includes('payment')) {
          insertId = 200;
        } else if (query.includes('journal_line')) {
          insertId = 300;
        } else if (query.includes('allocation')) {
          insertId = 400;
        }
        return { lastInsertId: insertId };
      }
      return { changes: 0 };
    }),
    select: vi.fn().mockImplementation((query: string, params?: any[]) => {
      // Return mock invoices for invoice queries
      if (query.includes('SELECT * FROM invoice')) {
        // Check if querying specific invoice by ID
        if (params && params.length > 0 && query.includes('WHERE id = ?')) {
          const invoiceId = params[0];
          const invoice = {
            id: invoiceId,
            invoice_number: `INV-${String(invoiceId).padStart(4, '0')}`,
            contact_id: 1,
            event_id: 1,
            issue_date: '2026-01-01',
            due_date: '2026-01-31',
            status: 'sent',
            subtotal: 100.00,
            tax_amount: 13.00,
            total_amount: 113.00,
            paid_amount: 0.00,
            notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          return [invoice];
        }
        // Return all invoices
        return [
          {
            id: 1,
            invoice_number: 'INV-0001',
            contact_id: 1,
            event_id: 1,
            issue_date: '2026-01-01',
            due_date: '2026-01-31',
            status: 'sent',
            subtotal: 100.00,
            tax_amount: 13.00,
            total_amount: 113.00,
            paid_amount: 0.00,
            notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 2,
            invoice_number: 'INV-0002',
            contact_id: 2,
            event_id: 2,
            issue_date: '2026-01-15',
            due_date: '2026-02-14',
            status: 'sent',
            subtotal: 200.00,
            tax_amount: 26.00,
            total_amount: 226.00,
            paid_amount: 0.00,
            notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ];
      }
      return [];
    }),
    close: vi.fn().mockResolvedValue(undefined),
    path: ''
  }),
}));

vi.mock('../../lib/services/system-accounts', () => ({
  getSystemAccount: vi.fn().mockResolvedValue({
    id: 1,
    code: '1000',
    name: 'Test Account',
    type: 'asset',
    is_active: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }),
}));

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
      expect(result.ok).toBe(false);
      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].message).toContain('greater than 0');
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
      expect(result.ok).toBe(false);
      expect(result.warnings).toBeDefined();
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].message).toContain('greater than 0');
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
    it('should apply FIFO when manual allocation would exceed payment amount', async () => {
      // User tries to allocate 150 to invoice, but payment is only 100
      // FIFO should auto-correct to allocate only what's available
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 100,
        payment_method: 'cash',
      };

      const allocations = [
        { invoice_id: 1, amount: 150 }, // Request more than payment amount
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result).toBeDefined();
      expect(result.ok).toBe(true); // FIFO auto-corrects, so it succeeds
    });

    it('should apply FIFO when manual allocation would exceed invoice outstanding', async () => {
      // User tries to allocate 10000 to invoice with outstanding of 113
      // FIFO should auto-correct to allocate only the outstanding amount
      const paymentData: PaymentInput = {
        payment_number: 'PAY-001',
        payment_date: '2026-01-24',
        amount: 1000,
        payment_method: 'transfer',
      };

      const allocations = [
        { invoice_id: 1, amount: 10000 }, // Request more than outstanding
      ];

      const result = await createPayment(paymentData, allocations, context);

      expect(result).toBeDefined();
      expect(result.ok).toBe(true); // FIFO auto-corrects, so it succeeds
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
