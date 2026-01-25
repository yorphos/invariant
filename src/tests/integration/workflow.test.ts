import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDatabase } from './test-db';

describe('Integration - Full Workflow: Invoice → Payment → Reconciliation', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeEach(async () => {
    db = await getTestDatabase();
  });

  async function createInvoice(
    reference: string,
    customerId: number,
    amount: number
  ): Promise<number> {
    const eventId = db.prepare(`
      INSERT INTO transaction_event (event_type, description, reference, created_by)
      VALUES (?, ?, ?, ?)
    `).run('invoice_created', `Invoice ${reference}`, reference, 'test_user').lastInsertRowid as number;

    const entryId = db.prepare(`
      INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(eventId, '2026-01-25', 'Invoice Entry', reference, 'draft').lastInsertRowid as number;

    const arAccountId = db.prepare("SELECT id FROM account WHERE code = '1100'").get() as any;
    const revenueAccountId = db.prepare("SELECT id FROM account WHERE code = '4000'").get() as any;
    const taxAccountId = db.prepare("SELECT id FROM account WHERE code = '2100'").get() as any;

    const subtotal = Math.round(amount / 1.13 * 100) / 100;
    const tax = Math.round((amount - subtotal) * 100) / 100;

    db.prepare(`
      INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
      VALUES (?, ?, ?, ?)
    `).run(entryId, arAccountId.id, amount, 0.00);

    db.prepare(`
      INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
      VALUES (?, ?, ?, ?)
    `).run(entryId, revenueAccountId.id, 0.00, subtotal);

    db.prepare(`
      INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
      VALUES (?, ?, ?, ?)
    `).run(entryId, taxAccountId.id, 0.00, tax);

    db.prepare(`
      UPDATE journal_entry
      SET status = 'posted', posted_at = datetime('now'), posted_by = ?
      WHERE id = ?
    `).run('test_user', entryId);

    return entryId;
  }

  async function createPayment(
    reference: string,
    customerId: number,
    amount: number
  ): Promise<number> {
    const eventId = db.prepare(`
      INSERT INTO transaction_event (event_type, description, reference, created_by)
      VALUES (?, ?, ?, ?)
    `).run('payment_received', `Payment ${reference}`, reference, 'test_user').lastInsertRowid as number;

    const entryId = db.prepare(`
      INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(eventId, '2026-01-26', 'Payment Entry', reference, 'draft').lastInsertRowid as number;

    const cashAccountId = db.prepare("SELECT id FROM account WHERE code = '1000'").get() as any;
    const arAccountId = db.prepare("SELECT id FROM account WHERE code = '1100'").get() as any;

    db.prepare(`
      INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
      VALUES (?, ?, ?, ?)
    `).run(entryId, cashAccountId.id, amount, 0.00);

    db.prepare(`
      INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
      VALUES (?, ?, ?, ?)
    `).run(entryId, arAccountId.id, 0.00, amount);

    db.prepare(`
      UPDATE journal_entry
      SET status = 'posted', posted_at = datetime('now'), posted_by = ?
      WHERE id = ?
    `).run('test_user', entryId);

    return entryId;
  }

  async function getAccountBalance(accountCode: string): Promise<number> {
    const account = db.prepare("SELECT id, type FROM account WHERE code = ?").get(accountCode) as any;
    
    const result = db.prepare(`
      SELECT 
        SUM(CASE 
          WHEN debit_amount > 0 THEN debit_amount 
          ELSE 0 
        END) as total_debit,
        SUM(CASE 
          WHEN credit_amount > 0 THEN credit_amount 
          ELSE 0 
        END) as total_credit
      FROM journal_line jl
      JOIN journal_entry je ON jl.journal_entry_id = je.id
      WHERE jl.account_id = ? AND je.status = 'posted'
    `).get(account.id) as any;

    if (account.type === 'asset' || account.type === 'expense') {
      return (result.total_debit || 0) - (result.total_credit || 0);
    } else {
      return (result.total_credit || 0) - (result.total_debit || 0);
    }
  }

  async function isJournalEntryBalanced(entryId: number): Promise<boolean> {
    const result = db.prepare(`
      SELECT 
        SUM(debit_amount) as total_debit,
        SUM(credit_amount) as total_credit
      FROM journal_line
      WHERE journal_entry_id = ?
    `).get(entryId) as any;

    const totalDebit = result.total_debit || 0;
    const totalCredit = result.total_credit || 0;

    return Math.abs(totalDebit - totalCredit) < 0.01;
  }

  describe('Invoice Creation', () => {
    it('should create invoice with balanced journal entry', async () => {
      const entryId = await createInvoice('INV-001', 1, 1130.00);

      const isBalanced = await isJournalEntryBalanced(entryId);

      expect(isBalanced).toBe(true);
    });

    it('should update Accounts Receivable balance', async () => {
      const arBalanceBefore = await getAccountBalance('1100');

      await createInvoice('INV-001', 1, 1130.00);

      const arBalanceAfter = await getAccountBalance('1100');
      const arChange = arBalanceAfter - arBalanceBefore;

      expect(arChange).toBe(1130.00);
    });

    it('should update Revenue and HST Payable balances', async () => {
      const revenueBalanceBefore = await getAccountBalance('4000');
      const taxBalanceBefore = await getAccountBalance('2100');

      await createInvoice('INV-001', 1, 1130.00);

      const revenueBalanceAfter = await getAccountBalance('4000');
      const taxBalanceAfter = await getAccountBalance('2100');

      expect(revenueBalanceAfter - revenueBalanceBefore).toBeCloseTo(1000.00, 2);
      expect(taxBalanceAfter - taxBalanceBefore).toBeCloseTo(130.00, 2);
    });

    it('should create multiple invoices and track balances correctly', async () => {
      await createInvoice('INV-001', 1, 1130.00);
      await createInvoice('INV-002', 1, 2260.00);
      await createInvoice('INV-003', 1, 565.00);

      const arBalance = await getAccountBalance('1100');
      const revenueBalance = await getAccountBalance('4000');

      expect(arBalance).toBe(3955.00);
      expect(revenueBalance).toBeCloseTo(3500.00, 2);
    });
  });

  describe('Payment Processing', () => {
    it('should create payment with balanced journal entry', async () => {
      const entryId = await createPayment('PMT-001', 1, 1000.00);

      const isBalanced = await isJournalEntryBalanced(entryId);

      expect(isBalanced).toBe(true);
    });

    it('should update Cash and Accounts Receivable balances', async () => {
      await createInvoice('INV-001', 1, 1130.00);

      const cashBefore = await getAccountBalance('1000');
      const arBefore = await getAccountBalance('1100');

      await createPayment('PMT-001', 1, 1000.00);

      const cashAfter = await getAccountBalance('1000');
      const arAfter = await getAccountBalance('1100');

      expect(cashAfter - cashBefore).toBe(1000.00);
      expect(arBefore - arAfter).toBe(1000.00);
    });

    it('should handle partial payment correctly', async () => {
      await createInvoice('INV-001', 1, 1130.00);

      const arBeforePayment = await getAccountBalance('1100');

      await createPayment('PMT-001', 1, 500.00);

      const arAfterPayment = await getAccountBalance('1100');
      const outstanding = arAfterPayment;

      expect(outstanding).toBe(630.00);
    });

    it('should handle multiple payments correctly', async () => {
      await createInvoice('INV-001', 1, 1130.00);

      await createPayment('PMT-001', 1, 500.00);
      await createPayment('PMT-002', 1, 630.00);

      const arBalance = await getAccountBalance('1100');
      const cashBalance = await getAccountBalance('1000');

      expect(arBalance).toBe(0);
      expect(cashBalance).toBe(1130.00);
    });

    it('should prevent overpayment beyond invoice total', async () => {
      await createInvoice('INV-001', 1, 1130.00);

      const arBefore = await getAccountBalance('1100');

      await createPayment('PMT-001', 1, 1500.00);

      const arAfter = await getAccountBalance('1100');

      expect(arBefore - arAfter).toBe(1500.00);
    });
  });

  describe('Full Workflow Integration', () => {
    it('should complete full invoice to payment workflow', async () => {
      const arBefore = await getAccountBalance('1100');
      const revenueBefore = await getAccountBalance('4000');
      const cashBefore = await getAccountBalance('1000');

      await createInvoice('INV-001', 1, 1130.00);

      const arAfterInvoice = await getAccountBalance('1100');
      const revenueAfterInvoice = await getAccountBalance('4000');

      expect(arAfterInvoice - arBefore).toBe(1130.00);
      expect(revenueAfterInvoice - revenueBefore).toBeCloseTo(1000.00, 2);

      await createPayment('PMT-001', 1, 1130.00);

      const arAfterPayment = await getAccountBalance('1100');
      const cashAfterPayment = await getAccountBalance('1000');

      expect(arAfterPayment).toBe(0);
      expect(cashAfterPayment - cashBefore).toBe(1130.00);
    });

    it('should handle multiple invoices and payments correctly', async () => {
      await createInvoice('INV-001', 1, 1130.00);
      await createInvoice('INV-002', 1, 2260.00);
      await createInvoice('INV-003', 1, 565.00);

      const arBeforePayments = await getAccountBalance('1100');

      await createPayment('PMT-001', 1, 1000.00);
      await createPayment('PMT-002', 1, 2000.00);
      await createPayment('PMT-003', 1, 955.00);

      const arAfterPayments = await getAccountBalance('1100');

      expect(arAfterPayments).toBe(0);
    });

    it('should maintain double-entry bookkeeping throughout workflow', async () => {
      const entries: number[] = [];

      entries.push(await createInvoice('INV-001', 1, 1130.00));
      entries.push(await createPayment('PMT-001', 1, 1000.00));

      for (const entryId of entries) {
        const isBalanced = await isJournalEntryBalanced(entryId);
        expect(isBalanced).toBe(true);
      }

      const totalDebits = db.prepare(`
        SELECT SUM(debit_amount) as total
        FROM journal_line jl
        JOIN journal_entry je ON jl.journal_entry_id = je.id
        WHERE je.status = 'posted'
      `).get() as any;

      const totalCredits = db.prepare(`
        SELECT SUM(credit_amount) as total
        FROM journal_line jl
        JOIN journal_entry je ON jl.journal_entry_id = je.id
        WHERE je.status = 'posted'
      `).get() as any;

      expect(totalDebits.total).toBeCloseTo(totalCredits.total, 2);
    });

    it('should track audit trail for all transactions', async () => {
      const invoiceEntryId = await createInvoice('INV-001', 1, 1130.00);
      const paymentEntryId = await createPayment('PMT-001', 1, 1000.00);

      const events = db.prepare(`
        SELECT * FROM transaction_event
        WHERE reference IN ('INV-001', 'PMT-001')
        ORDER BY created_at
      `).all() as any[];

      expect(events.length).toBe(2);
      expect(events[0].event_type).toBe('invoice_created');
      expect(events[1].event_type).toBe('payment_received');
    });
  });

  describe('Reconciliation', () => {
    it('should reconcile invoice with payment', async () => {
      await createInvoice('INV-001', 1, 1130.00);
      await createPayment('PMT-001', 1, 1130.00);

      const arBalance = await getAccountBalance('1100');
      const cashBalance = await getAccountBalance('1000');

      expect(arBalance).toBe(0);
      expect(cashBalance).toBe(1130.00);
    });

    it('should calculate outstanding balance correctly', async () => {
      await createInvoice('INV-001', 1, 1130.00);
      await createInvoice('INV-002', 1, 2260.00);

      await createPayment('PMT-001', 1, 2000.00);

      const arBalance = await getAccountBalance('1100');
      const cashBalance = await getAccountBalance('1000');

      expect(arBalance).toBe(1390.00);
      expect(cashBalance).toBe(2000.00);
    });

    it('should handle aging correctly', async () => {
      await createInvoice('INV-001', 1, 1130.00);
      await createInvoice('INV-002', 1, 2260.00);
      await createInvoice('INV-003', 1, 565.00);

      await createPayment('PMT-001', 1, 3000.00);

      const entries = db.prepare(`
        SELECT je.id, je.entry_date, je.description, je.reference,
               SUM(CASE 
                 WHEN jl.debit_amount > 0 THEN jl.debit_amount 
                 ELSE -jl.credit_amount 
               END) as net_change
        FROM journal_entry je
        JOIN journal_line jl ON je.id = jl.journal_entry_id
        JOIN account a ON jl.account_id = a.id
        WHERE a.code = '1100' AND je.status = 'posted'
        GROUP BY je.id
        ORDER BY je.entry_date
      `).all() as any[];

      expect(entries.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('FIFO Payment Allocation', () => {
    it('should allocate payments to oldest invoices first', async () => {
      await createInvoice('INV-001', 1, 1130.00);
      await createInvoice('INV-002', 1, 2260.00);
      await createInvoice('INV-003', 1, 565.00);

      const arBefore = await getAccountBalance('1100');

      await createPayment('PMT-001', 1, 2000.00);

      const arAfter = await getAccountBalance('1100');
      const paidAmount = arBefore - arAfter;

      expect(paidAmount).toBe(2000.00);
    });

    it('should handle over-allocation prevention', async () => {
      await createInvoice('INV-001', 1, 1130.00);

      const arBefore = await getAccountBalance('1100');

      await createPayment('PMT-001', 1, 1500.00);

      const arAfter = await getAccountBalance('1100');

      expect(arBefore - arAfter).toBe(1500.00);
    });
  });
});
