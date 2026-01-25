import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDatabase } from './test-db';

describe('Integration - Database Guardrails and Constraints', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeEach(async () => {
    db = await getTestDatabase();
  });

  function getTriggerNames(): string[] {
    const results = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='trigger' ORDER BY name
    `).all() as Array<{ name: string }>;
    return results.map(r => r.name);
  }

  describe('Trigger Existence Verification', () => {
    it('should have journal entry integrity triggers', () => {
      const triggers = getTriggerNames();
      expect(triggers).toContain('enforce_balanced_journal_on_post');
      expect(triggers).toContain('prevent_modify_posted_journal');
      expect(triggers).toContain('prevent_delete_posted_journal');
    });

    it('should have posted journal entry line protection triggers', () => {
      const triggers = getTriggerNames();
      expect(triggers).toContain('prevent_modify_posted_lines_insert');
      expect(triggers).toContain('prevent_modify_posted_lines_update');
      expect(triggers).toContain('prevent_modify_posted_lines_delete');
    });

    it('should have allocation constraint triggers', () => {
      const triggers = getTriggerNames();
      expect(triggers).toContain('prevent_payment_overallocation');
      expect(triggers).toContain('prevent_invoice_overallocation');
    });

    it('should have closed period prevention triggers', () => {
      const triggers = getTriggerNames();
      expect(triggers).toContain('prevent_posting_to_closed_period_insert');
      expect(triggers).toContain('prevent_posting_to_closed_period_update');
    });
  });

  describe('Journal Entry Integrity Triggers', () => {
    it('should prevent modifying posted journal entry', async () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'draft').lastInsertRowid as number;

      const beforeUpdate = db.prepare('SELECT * FROM journal_entry WHERE id = ?').get(entryId) as any;

      db.prepare(`
        INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
        VALUES (?, ?, ?, ?)
      `).run(entryId, 1, 1000.00, 0.00);

      db.prepare(`
        INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
        VALUES (?, ?, ?, ?)
      `).run(entryId, 2, 0.00, 1000.00);

      db.prepare(`
        UPDATE journal_entry
        SET status = 'posted', posted_at = datetime('now'), posted_by = ?
        WHERE id = ?
      `).run('test_user', entryId);

      const afterPost = db.prepare('SELECT * FROM journal_entry WHERE id = ?').get(entryId) as any;
      expect(afterPost.status).toBe('posted');
      expect(afterPost.posted_at).toBeDefined();

      expect(() => {
        db.prepare(`
          UPDATE journal_entry
          SET description = 'Modified description'
          WHERE id = ?
        `).run(entryId);
      }).toThrow('Cannot modify posted journal entry');

      const afterFailedUpdate = db.prepare('SELECT * FROM journal_entry WHERE id = ?').get(entryId) as any;
      expect(afterFailedUpdate.description).toBe(beforeUpdate.description);
      expect(afterFailedUpdate.status).toBe('posted');
    });

    it('should prevent modifying lines in posted journal entry', async () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'draft').lastInsertRowid as number;

      db.prepare(`
        INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
        VALUES (?, ?, ?, ?)
      `).run(entryId, 1, 1000.00, 0.00);

      db.prepare(`
        INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
        VALUES (?, ?, ?, ?)
      `).run(entryId, 2, 0.00, 1000.00);

      db.prepare(`
        UPDATE journal_entry
        SET status = 'posted', posted_at = datetime('now'), posted_by = ?
        WHERE id = ?
      `).run('test_user', entryId);

      const line = db.prepare(`
        SELECT id, debit_amount FROM journal_line WHERE journal_entry_id = ? LIMIT 1
      `).get(entryId) as any;

      const beforeDebit = line.debit_amount;

      expect(() => {
        db.prepare(`
          UPDATE journal_line
          SET debit_amount = 1500.00
          WHERE id = ?
        `).run(line.id);
      }).toThrow('Cannot modify lines in posted journal entry');

      const afterFailedUpdate = db.prepare(`
        SELECT debit_amount FROM journal_line WHERE id = ?
      `).get(line.id) as any;
      expect(afterFailedUpdate.debit_amount).toBe(beforeDebit);
    });

    it('should prevent deleting lines from posted journal entry', async () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'draft').lastInsertRowid as number;

      db.prepare(`
        INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
        VALUES (?, ?, ?, ?)
      `).run(entryId, 1, 1000.00, 0.00);

      db.prepare(`
        INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
        VALUES (?, ?, ?, ?)
      `).run(entryId, 2, 0.00, 1000.00);

      db.prepare(`
        UPDATE journal_entry
        SET status = 'posted', posted_at = datetime('now'), posted_by = ?
        WHERE id = ?
      `).run('test_user', entryId);

      const beforeCount = db.prepare(`
        SELECT COUNT(*) as count FROM journal_line WHERE journal_entry_id = ?
      `).get(entryId) as any;
      expect(beforeCount.count).toBe(2);

      const line = db.prepare(`
        SELECT id FROM journal_line WHERE journal_entry_id = ? LIMIT 1
      `).get(entryId) as any;

      expect(() => {
        db.prepare('DELETE FROM journal_line WHERE id = ?').run(line.id);
      }).toThrow('Cannot delete lines from posted journal entry');

      const afterFailedDelete = db.prepare(`
        SELECT COUNT(*) as count FROM journal_line WHERE journal_entry_id = ?
      `).get(entryId) as any;
      expect(afterFailedDelete.count).toBe(2);
    });

    it('should prevent posting unbalanced journal entry', async () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'draft').lastInsertRowid as number;

      db.prepare(`
        INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
        VALUES (?, ?, ?, ?)
      `).run(entryId, 1, 1000.00, 0.00);

      const beforePost = db.prepare('SELECT * FROM journal_entry WHERE id = ?').get(entryId) as any;
      expect(beforePost.status).toBe('draft');
      expect(beforePost.posted_at).toBeNull();

      expect(() => {
        db.prepare(`
          UPDATE journal_entry
          SET status = 'posted', posted_at = datetime('now'), posted_by = ?
          WHERE id = ?
        `).run('test_user', entryId);
      }).toThrow('Cannot post unbalanced journal entry');

      const afterFailedPost = db.prepare('SELECT * FROM journal_entry WHERE id = ?').get(entryId) as any;
      expect(afterFailedPost.status).toBe('draft');
      expect(afterFailedPost.posted_at).toBeNull();
    });
  });

  describe('Allocation Constraint Triggers', () => {
    it('should successfully allocate within payment limit', async () => {
      const contactId = db.prepare(`
        INSERT INTO contact (name, type)
        VALUES (?, ?)
      `).run('Test Customer', 'customer').lastInsertRowid as number;

      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('payment_received', 'Test Payment', 'PMT-001', 'test_user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Payment Entry', 'PMT-001', 'posted').lastInsertRowid as number;

      const invoiceEventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      const invoiceEntryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(invoiceEventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'posted').lastInsertRowid as number;

      const invoiceId = db.prepare(`
        INSERT INTO invoice (event_id, invoice_number, contact_id, issue_date, due_date, subtotal, tax_amount, total_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(invoiceEventId, 'INV-001', contactId, '2026-01-25', '2026-02-25', 1000.00, 130.00, 1130.00, 'sent').lastInsertRowid as number;

      const paymentId = db.prepare(`
        INSERT INTO payment (event_id, payment_number, contact_id, payment_date, amount, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(eventId, 'PMT-001', contactId, '2026-01-25', 500.00, 'pending').lastInsertRowid as number;

      const beforeAllocations = db.prepare(`
        SELECT COUNT(*) as count FROM allocation WHERE payment_id = ?
      `).get(paymentId) as any;
      expect(beforeAllocations.count).toBe(0);

      db.prepare(`
        INSERT INTO allocation (payment_id, invoice_id, amount, allocation_method, created_at)
        VALUES (?, ?, ?, 'manual', datetime('now'))
      `).run(paymentId, invoiceId, 300.00);

      const afterAllocations = db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM allocation WHERE payment_id = ?
      `).get(paymentId) as any;
      expect(afterAllocations.count).toBe(1);
      expect(afterAllocations.total).toBe(300.00);
    });
    it('should prevent payment over-allocation', async () => {
      const contactId = db.prepare(`
        INSERT INTO contact (name, type)
        VALUES (?, ?)
      `).run('Test Customer', 'customer').lastInsertRowid as number;

      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('payment_received', 'Test Payment', 'PMT-001', 'test_user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Payment Entry', 'PMT-001', 'posted').lastInsertRowid as number;

      const invoiceEventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      const invoiceEntryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(invoiceEventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'posted').lastInsertRowid as number;

      const invoiceId = db.prepare(`
        INSERT INTO invoice (event_id, invoice_number, contact_id, issue_date, due_date, subtotal, tax_amount, total_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(invoiceEventId, 'INV-001', contactId, '2026-01-25', '2026-02-25', 1000.00, 130.00, 1130.00, 'sent').lastInsertRowid as number;

      const paymentId = db.prepare(`
        INSERT INTO payment (event_id, payment_number, contact_id, payment_date, amount, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(eventId, 'PMT-001', contactId, '2026-01-25', 500.00, 'pending').lastInsertRowid as number;

      const payment = db.prepare('SELECT * FROM payment WHERE id = ?').get(paymentId) as any;
      expect(payment.amount).toBe(500.00);

      const beforeAllocations = db.prepare(`
        SELECT COUNT(*) as count FROM allocation WHERE payment_id = ?
      `).get(paymentId) as any;
      expect(beforeAllocations.count).toBe(0);

      expect(() => {
        db.prepare(`
          INSERT INTO allocation (payment_id, invoice_id, amount, allocation_method, created_at)
          VALUES (?, ?, ?, 'manual', datetime('now'))
        `).run(paymentId, invoiceId, 600.00);
      }).toThrow('Allocation would exceed payment amount');

      const afterFailedAllocation = db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM allocation WHERE payment_id = ?
      `).get(paymentId) as any;
      expect(afterFailedAllocation.count).toBe(0);
      expect(afterFailedAllocation.total).toBe(0);
    });

    it('should prevent invoice over-allocation', async () => {
      const contactId = db.prepare(`
        INSERT INTO contact (name, type)
        VALUES (?, ?)
      `).run('Test Customer', 'customer').lastInsertRowid as number;

      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('payment_received', 'Test Payment', 'PMT-001', 'test_user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Payment Entry', 'PMT-001', 'posted').lastInsertRowid as number;

      const invoiceEventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      const invoiceEntryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(invoiceEventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'posted').lastInsertRowid as number;

      const invoiceId = db.prepare(`
        INSERT INTO invoice (event_id, invoice_number, contact_id, issue_date, due_date, subtotal, tax_amount, total_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(invoiceEventId, 'INV-001', contactId, '2026-01-25', '2026-02-25', 1000.00, 130.00, 1130.00, 'sent').lastInsertRowid as number;

      const invoice = db.prepare('SELECT * FROM invoice WHERE id = ?').get(invoiceId) as any;
      expect(invoice.total_amount).toBe(1130.00);

      const paymentId = db.prepare(`
        INSERT INTO payment (event_id, payment_number, contact_id, payment_date, amount, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(eventId, 'PMT-001', contactId, '2026-01-25', 2000.00, 'pending').lastInsertRowid as number;

      const beforeAllocations = db.prepare(`
        SELECT COUNT(*) as count FROM allocation WHERE invoice_id = ?
      `).get(invoiceId) as any;
      expect(beforeAllocations.count).toBe(0);

      expect(() => {
        db.prepare(`
          INSERT INTO allocation (payment_id, invoice_id, amount, allocation_method, created_at)
          VALUES (?, ?, ?, 'manual', datetime('now'))
        `).run(paymentId, invoiceId, 1200.00);
      }).toThrow('Allocation would exceed invoice total');

      const afterFailedAllocation = db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM allocation WHERE invoice_id = ?
      `).get(invoiceId) as any;
      expect(afterFailedAllocation.count).toBe(0);
      expect(afterFailedAllocation.total).toBe(0);
    });

    it('should prevent reducing invoice total below allocated', async () => {
      const contactId = db.prepare(`
        INSERT INTO contact (name, type)
        VALUES (?, ?)
      `).run('Test Customer', 'customer').lastInsertRowid as number;

      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('payment_received', 'Test Payment', 'PMT-001', 'test_user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Payment Entry', 'PMT-001', 'posted').lastInsertRowid as number;

      const invoiceEventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      const invoiceEntryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(invoiceEventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'posted').lastInsertRowid as number;

      const invoiceId = db.prepare(`
        INSERT INTO invoice (event_id, invoice_number, contact_id, issue_date, due_date, subtotal, tax_amount, total_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(invoiceEventId, 'INV-001', contactId, '2026-01-25', '2026-02-25', 1000.00, 130.00, 1130.00, 'sent').lastInsertRowid as number;

      const paymentId = db.prepare(`
        INSERT INTO payment (event_id, payment_number, contact_id, payment_date, amount, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(eventId, 'PMT-001', contactId, '2026-01-25', 2000.00, 'pending').lastInsertRowid as number;

      db.prepare(`
        INSERT INTO allocation (payment_id, invoice_id, amount, allocation_method, created_at)
        VALUES (?, ?, ?, 'manual', datetime('now'))
      `).run(paymentId, invoiceId, 1000.00);

      expect(() => {
        db.prepare(`
          UPDATE invoice
          SET total_amount = 900.00
          WHERE id = ?
        `).run(invoiceId);
      }).toThrow('Cannot reduce invoice total below allocated amount');
    });

    it('should successfully allocate within invoice total', async () => {
      const contactId = db.prepare(`
        INSERT INTO contact (name, type)
        VALUES (?, ?)
      `).run('Test Customer', 'customer').lastInsertRowid as number;

      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('payment_received', 'Test Payment', 'PMT-001', 'test_user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Payment Entry', 'PMT-001', 'posted').lastInsertRowid as number;

      const invoiceEventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      const invoiceEntryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(invoiceEventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'posted').lastInsertRowid as number;

      const invoiceId = db.prepare(`
        INSERT INTO invoice (event_id, invoice_number, contact_id, issue_date, due_date, subtotal, tax_amount, total_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(invoiceEventId, 'INV-001', contactId, '2026-01-25', '2026-02-25', 1000.00, 130.00, 1130.00, 'sent').lastInsertRowid as number;

      const invoice = db.prepare('SELECT * FROM invoice WHERE id = ?').get(invoiceId) as any;
      expect(invoice.total_amount).toBe(1130.00);

      const paymentId = db.prepare(`
        INSERT INTO payment (event_id, payment_number, contact_id, payment_date, amount, status)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(eventId, 'PMT-001', contactId, '2026-01-25', 1500.00, 'pending').lastInsertRowid as number;

      const beforeAllocations = db.prepare(`
        SELECT COUNT(*) as count FROM allocation WHERE invoice_id = ?
      `).get(invoiceId) as any;
      expect(beforeAllocations.count).toBe(0);

      db.prepare(`
        INSERT INTO allocation (payment_id, invoice_id, amount, allocation_method, created_at)
        VALUES (?, ?, ?, 'manual', datetime('now'))
      `).run(paymentId, invoiceId, 1000.00);

      const afterAllocations = db.prepare(`
        SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total FROM allocation WHERE invoice_id = ?
      `).get(invoiceId) as any;
      expect(afterAllocations.count).toBe(1);
      expect(afterAllocations.total).toBe(1000.00);
    });
  });

  describe('Closed Fiscal Period Constraints', () => {
    it('should prevent posting entry in closed fiscal year', async () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      db.prepare(`
        UPDATE fiscal_year
        SET status = 'closed', closed_at = datetime('now'), closed_by = 'test_user'
        WHERE year = 2026
      `).run();

      expect(() => {
        db.prepare(`
          INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
          VALUES (?, ?, ?, ?, ?)
        `).run(eventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'draft');
      }).toThrow('Cannot post entry in closed fiscal period');
    });

    it('should prevent moving entry into closed fiscal year', async () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'draft').lastInsertRowid as number;

      db.prepare(`
        UPDATE fiscal_year
        SET status = 'closed', closed_at = datetime('now'), closed_by = 'test_user'
        WHERE year = 2026
      `).run();

      expect(() => {
        db.prepare(`
          UPDATE journal_entry
          SET entry_date = '2026-02-01'
          WHERE id = ?
        `).run(entryId);
      }).toThrow('Cannot move entry into closed fiscal period');
    });

    it('should allow posting in open fiscal year', async () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      expect(() => {
        db.prepare(`
          INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
          VALUES (?, ?, ?, ?, ?)
        `).run(eventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'draft');
      }).not.toThrow();
    });
  });

  describe('Data Validation Constraints', () => {
    it('should enforce decimal constraints on amounts', async () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'draft').lastInsertRowid as number;

      const validLineCount = db.prepare(`
        SELECT COUNT(*) as count FROM journal_line WHERE journal_entry_id = ?
      `).get(entryId) as any;
      expect(validLineCount.count).toBe(0);

      db.prepare(`
        INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
        VALUES (?, ?, ?, ?)
      `).run(entryId, 1, 1000.00, 0.00);

      const afterValidLine = db.prepare(`
        SELECT debit_amount FROM journal_line WHERE journal_entry_id = ?
      `).get(entryId) as any;
      expect(afterValidLine.debit_amount).toBe(1000.00);
    });

    it('should reject negative amounts in journal lines', async () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'posted').lastInsertRowid as number;

      expect(() => {
        db.prepare(`
          INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
          VALUES (?, ?, ?, ?)
        `).run(entryId, 1, -100.00, 0.00);
      }).toThrow();
    });

    it('should reject invalid account types', async () => {
      expect(() => {
        db.prepare(`
          INSERT INTO account (code, name, type)
          VALUES (?, ?, ?)
        `).run('6000', 'Invalid Account', 'bogus_type');
      }).toThrow();
    });

    it('should reject invalid invoice status', async () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      expect(() => {
        db.prepare(`
          INSERT INTO invoice (event_id, invoice_number, contact_id, issue_date, due_date, subtotal, tax_amount, total_amount, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(eventId, 'INV-001', 1, '2026-01-25', '2026-02-25', 1000.00, 130.00, 1130.00, 'invalid_status');
      }).toThrow();
    });

    it('should reject invalid payment status', async () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('payment_received', 'Test Payment', 'PMT-001', 'test_user').lastInsertRowid as number;

      expect(() => {
        db.prepare(`
        INSERT INTO payment (event_id, payment_number, contact_id, payment_date, amount, status)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(eventId, 'PMT-001', 1, '2026-01-25', 1000.00, 'invalid_status');
      }).toThrow();
    });

    it('should reject duplicate invoice numbers', async () => {
      const contactId = db.prepare(`
        INSERT INTO contact (name, type)
        VALUES (?, ?)
      `).run('Test Customer', 'customer').lastInsertRowid as number;

      const eventId1 = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice 1', 'INV-001', 'test_user').lastInsertRowid as number;

      const eventId2 = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice 2', 'INV-002', 'test_user').lastInsertRowid as number;

      db.prepare(`
        INSERT INTO invoice (event_id, invoice_number, contact_id, issue_date, due_date, subtotal, tax_amount, total_amount, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(eventId1, 'INV-001', contactId, '2026-01-25', '2026-02-25', 1000.00, 130.00, 1130.00, 'sent');

      expect(() => {
        db.prepare(`
          INSERT INTO invoice (event_id, invoice_number, contact_id, issue_date, due_date, subtotal, tax_amount, total_amount, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(eventId2, 'INV-001', contactId, '2026-01-26', '2026-02-26', 500.00, 65.00, 565.00, 'sent');
      }).toThrow();
    });

    it('should reject duplicate account codes', async () => {
      db.prepare(`
        INSERT INTO account (code, name, type)
        VALUES (?, ?, ?)
      `).run('6000', 'Test Account 1', 'asset');

      expect(() => {
        db.prepare(`
          INSERT INTO account (code, name, type)
          VALUES (?, ?, ?)
        `).run('6000', 'Test Account 2', 'liability');
      }).toThrow();
    });

    it('should reject contact with invalid type', async () => {
      expect(() => {
        db.prepare(`
          INSERT INTO contact (name, type)
          VALUES (?, ?)
        `).run('Test Contact', 'invalid_type');
      }).toThrow();
    });
  });
});
