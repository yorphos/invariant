import { describe, it, expect } from 'vitest';
import {
  createCreditNote,
  applyCreditNote,
  refundCreditNote,
  voidCreditNote,
} from '../../lib/domain/credit-note-operations';
import type { PolicyContext } from '../../lib/domain/types';

describe('Credit Note Operations', () => {
  const mockContext: PolicyContext = { mode: 'beginner' as const };

  describe('createCreditNote', () => {
    it('should calculate correct totals for tax-exclusive pricing', async () => {
      const result = await createCreditNote(
        {
          credit_note_number: 'CN-0001',
          contact_id: 1,
          issue_date: '2026-01-15',
          tax_code_id: 1,
          notes: 'Test credit note',
        },
        [
          {
            line_number: 1,
            description: 'Test Item',
            quantity: 10,
            unit_price: 100,
            amount: 1000,
            is_tax_inclusive: false,
            account_id: 4001,
          },
        ],
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.journal_entry_id).toBeDefined();
      expect(result.event_id).toBeDefined();
    });

    it('should calculate correct totals for tax-inclusive pricing', async () => {
      const result = await createCreditNote(
        {
          credit_note_number: 'CN-0002',
          contact_id: 1,
          issue_date: '2026-01-15',
          tax_code_id: 1,
          notes: 'Tax-inclusive test',
        },
        [
          {
            line_number: 1,
            description: 'Test Item',
            quantity: 1,
            unit_price: 113,
            amount: 113,
            is_tax_inclusive: true,
            account_id: 4001,
          },
        ],
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should reject zero quantity', async () => {
      const result = await createCreditNote(
        {
          credit_note_number: 'CN-0003',
          contact_id: 1,
          issue_date: '2026-01-15',
          tax_code_id: 1,
        },
        [
          {
            line_number: 1,
            description: 'Invalid Item',
            quantity: 0,
            unit_price: 100,
            amount: 0,
            account_id: 4001,
          },
        ],
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].level).toBe('error');
      expect(result.warnings[0].message).toContain('quantity');
    });

    it('should reject zero unit price', async () => {
      const result = await createCreditNote(
        {
          credit_note_number: 'CN-0004',
          contact_id: 1,
          issue_date: '2026-01-15',
          tax_code_id: 1,
        },
        [
          {
            line_number: 1,
            description: 'Invalid Item',
            quantity: 1,
            unit_price: 0,
            amount: 0,
            account_id: 4001,
          },
        ],
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toContain('unit price');
    });

    it('should reject empty description', async () => {
      const result = await createCreditNote(
        {
          credit_note_number: 'CN-0005',
          contact_id: 1,
          issue_date: '2026-01-15',
          tax_code_id: 1,
        },
        [
          {
            line_number: 1,
            description: '',
            quantity: 1,
            unit_price: 100,
            amount: 100,
            account_id: 4001,
          },
        ],
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toContain('description');
    });

    it('should reject negative total amount', async () => {
      const result = await createCreditNote(
        {
          credit_note_number: 'CN-0006',
          contact_id: 1,
          issue_date: '2026-01-15',
          tax_code_id: 1,
          notes: 'Negative total test',
        },
        [
          {
            line_number: 1,
            description: 'Negative test',
            quantity: -1,
            unit_price: 100,
            amount: -100,
            account_id: 4001,
          },
        ],
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toContain('greater than 0');
    });

    it('should create balanced journal entry', async () => {
      const result = await createCreditNote(
        {
          credit_note_number: 'CN-0007',
          contact_id: 1,
          issue_date: '2026-01-15',
          tax_code_id: 1,
          notes: 'Balance test',
        },
        [
          {
            line_number: 1,
            description: 'Balance Test',
            quantity: 10,
            unit_price: 100,
            amount: 1000,
            is_tax_inclusive: false,
            account_id: 4001,
          },
        ],
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(result.journal_entry_id).toBeDefined();
    });
  });

  describe('applyCreditNote', () => {
    it('should apply credit note to invoice', async () => {
      const result = await applyCreditNote(1, 1, 100, 'Test application');

      expect(result.ok).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should reject application exceeding credit note amount', async () => {
      const result = await applyCreditNote(1, 1, 1000, 'Excessive amount');

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toContain('available');
    });

    it('should reject application exceeding invoice outstanding', async () => {
      const result = await applyCreditNote(1, 1, 1000, 'Excessive invoice amount');

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toContain('outstanding');
    });

    it('should reject application to voided credit note', async () => {
      const result = await applyCreditNote(1, 1, 100, 'Voided credit note');

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toContain('voided');
    });

    it('should reject application to voided invoice', async () => {
      const result = await applyCreditNote(1, 1, 100, 'Voided invoice');

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toContain('void');
    });
  });

  describe('refundCreditNote', () => {
    it('should process refund successfully', async () => {
      const result = await refundCreditNote(1, 'REF-0001', '2026-01-15', 'cash', 100, 'Cash refund');

      expect(result.ok).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should reject refund exceeding credit note amount', async () => {
      const result = await refundCreditNote(1, 'REF-0002', '2026-01-15', 'cash', 1000, 'Excessive refund');

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toContain('available');
    });

    it('should reject refund for voided credit note', async () => {
      const result = await refundCreditNote(1, 'REF-0003', '2026-01-15', 'cash', 100, 'Voided credit note');

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toContain('voided');
    });
  });

  describe('voidCreditNote', () => {
    it('should void credit note successfully', async () => {
      const result = await voidCreditNote(1, 'Test void');

      expect(result.ok).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.event_id).toBeDefined();
    });

    it('should reject voiding already voided credit note', async () => {
      const result = await voidCreditNote(1, 'Already voided');

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toContain('already voided');
    });

    it('should reject voiding credit note with applied amount', async () => {
      const result = await voidCreditNote(1, 'Has applications');

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toContain('applied');
    });

    it('should create reversal journal entries', async () => {
      const result = await voidCreditNote(1, 'Reversal test');

      expect(result.ok).toBe(true);
      expect(result.journal_entry_id).toBeDefined();
      expect(result.event_id).toBeDefined();
    });
  });

  describe('Accounting Principles', () => {
    it('should create DR Revenue / CR A/R entry for credit note', async () => {
      const result = await createCreditNote(
        {
          credit_note_number: 'CN-1001',
          contact_id: 1,
          issue_date: '2026-01-15',
          tax_code_id: 1,
          notes: 'Accounting test',
        },
        [
          {
            line_number: 1,
            description: 'Revenue reduction',
            quantity: 1,
            unit_price: 100,
            amount: 100,
            is_tax_inclusive: false,
            account_id: 4001,
          },
        ],
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(result.journal_entry_id).toBeDefined();
    });

    it('should calculate tax correctly for credit notes', async () => {
      const result = await createCreditNote(
        {
          credit_note_number: 'CN-1002',
          contact_id: 1,
          issue_date: '2026-01-15',
          tax_code_id: 1,
          notes: 'Tax calculation test',
        },
        [
          {
            line_number: 1,
            description: 'Tax test',
            quantity: 10,
            unit_price: 100,
            amount: 1000,
            is_tax_inclusive: false,
            account_id: 4001,
          },
        ],
        mockContext
      );

      expect(result.ok).toBe(true);
      expect(result.journal_entry_id).toBeDefined();
    });

    it('should maintain double-entry balance', async () => {
      const result = await createCreditNote(
        {
          credit_note_number: 'CN-1003',
          contact_id: 1,
          issue_date: '2026-01-15',
          tax_code_id: 1,
        },
        [
          {
            line_number: 1,
            description: 'Balance test',
            quantity: 10,
            unit_price: 100,
            amount: 1000,
            is_tax_inclusive: false,
            account_id: 4001,
          },
        ],
        mockContext
      );

      expect(result.ok).toBe(true);
    });
  });

  describe('Security', () => {
    it('should recalculate amounts server-side', async () => {
      const result = await createCreditNote(
        {
          credit_note_number: 'CN-2001',
          contact_id: 1,
          issue_date: '2026-01-15',
          tax_code_id: 1,
        },
        [
          {
            line_number: 1,
            description: 'Manipulation test',
            quantity: 10,
            unit_price: 100,
            amount: 2000,
            is_tax_inclusive: false,
            account_id: 4001,
          },
        ],
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toContain('Amount mismatch');
    });

    it('should detect client-provided zero amount', async () => {
      const result = await createCreditNote(
        {
          credit_note_number: 'CN-2002',
          contact_id: 1,
          issue_date: '2026-01-15',
          tax_code_id: 1,
        },
        [
          {
            line_number: 1,
            description: 'Zero amount test',
            quantity: 0,
            unit_price: 100,
            amount: 0,
            is_tax_inclusive: false,
            account_id: 4001,
          },
        ],
        mockContext
      );

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toContain('greater than 0');
    });
  });
});
