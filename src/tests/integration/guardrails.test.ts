import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDatabase } from './test-db';

describe('Integration - Database Guardrails and Constraints', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeEach(async () => {
    db = await getTestDatabase();
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

      expect(() => {
        db.prepare(`
          UPDATE journal_entry
          SET description = 'Modified description'
          WHERE id = ?
        `).run(entryId);
      }).toThrow('Cannot modify posted journal entry');
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
        SELECT id FROM journal_line WHERE journal_entry_id = ?
      `).get(entryId) as any;

      expect(() => {
        db.prepare(`
          UPDATE journal_line
          SET debit_amount = 1500.00
          WHERE id = ?
        `).run(line.id);
      }).toThrow('Cannot modify lines in posted journal entry');
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

      const line = db.prepare(`
        SELECT id FROM journal_line WHERE journal_entry_id = ?
      `).get(entryId) as any;

      expect(() => {
        db.prepare('DELETE FROM journal_line WHERE id = ?').run(line.id);
      }).toThrow('Cannot delete lines from posted journal entry');
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

      expect(() => {
        db.prepare(`
          UPDATE journal_entry
          SET status = 'posted', posted_at = datetime('now'), posted_by = ?
          WHERE id = ?
        `).run('test_user', entryId);
      }).toThrow('Cannot post unbalanced journal entry');
    });
  });

   describe('Allocation Constraint Triggers', () => {
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

      expect(() => {
        db.prepare(`
          INSERT INTO allocation (payment_id, invoice_id, amount, allocation_method, created_at)
          VALUES (?, ?, ?, 'manual', datetime('now'))
        `).run(paymentId, invoiceId, 600.00);
      }).toThrow('Allocation would exceed payment amount');
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
