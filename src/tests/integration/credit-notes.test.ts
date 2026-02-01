import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDatabase } from './test-db';

describe('Integration - Credit Notes & Refunds', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeEach(async () => {
    db = await getTestDatabase();
  });

  async function createContact(name: string, type: 'customer' | 'vendor' | 'both' = 'customer'): Promise<number> {
    const result = db.prepare(`
      INSERT INTO contact (name, type, is_active)
      VALUES (?, ?, 1)
    `).run(name, type);

    return result.lastInsertRowid as number;
  }

  async function createInvoice(
    invoiceNumber: string,
    contactId: number,
    amount: number
  ): Promise<number> {
    const eventId = db.prepare(`
      INSERT INTO transaction_event (event_type, description, reference, created_by)
      VALUES (?, ?, ?, ?)
    `).run('invoice_created', `Invoice ${invoiceNumber}`, invoiceNumber, 'test_user').lastInsertRowid as number;

    const subtotal = Math.round(amount / 1.13 * 100) / 100;
    const tax = Math.round((amount - subtotal) * 100) / 100;

    const entryId = db.prepare(`
      INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(eventId, '2026-01-25', 'Invoice Entry', invoiceNumber, 'draft').lastInsertRowid as number;

    const arAccountId = db.prepare("SELECT id FROM account WHERE code = '1100'").get() as any;
    const revenueAccountId = db.prepare("SELECT id FROM account WHERE code = '4000'").get() as any;
    const taxAccountId = db.prepare("SELECT id FROM account WHERE code = '2100'").get() as any;

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

    const invoiceId = db.prepare(`
      INSERT INTO invoice (invoice_number, contact_id, event_id, issue_date, due_date, status, subtotal, tax_amount, total_amount, paid_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(invoiceNumber, contactId, eventId, '2026-01-25', '2026-02-25', 'sent', subtotal, tax, amount, 0).lastInsertRowid as number;

    return invoiceId;
  }

  async function createCreditNote(
    creditNoteNumber: string,
    contactId: number,
    status: string = 'draft'
  ): Promise<number> {
    const creditNoteId = db.prepare(`
      INSERT INTO credit_note (credit_note_number, contact_id, issue_date, status, subtotal, tax_amount, total_amount, applied_amount, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(creditNoteNumber, contactId, '2026-01-25', status, 1000.00, 130.00, 1130.00, 0.00, 'Test credit note').lastInsertRowid as number;

    return creditNoteId;
  }

  describe('Credit Note CRUD Operations', () => {
    it('should create a credit note', async () => {
      const contactId = await createContact('Test Customer');

      const creditNoteId = db.prepare(`
        INSERT INTO credit_note (credit_note_number, contact_id, issue_date, status, subtotal, tax_amount, total_amount, applied_amount, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('CN-001', contactId, '2026-01-25', 'draft', 1000.00, 130.00, 1130.00, 0.00, 'Test credit note').lastInsertRowid as number;

      const creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;

      expect(creditNote).toBeDefined();
      expect(creditNote.credit_note_number).toBe('CN-001');
      expect(creditNote.contact_id).toBe(contactId);
      expect(creditNote.status).toBe('draft');
      expect(creditNote.subtotal).toBe(1000.00);
      expect(creditNote.tax_amount).toBe(130.00);
      expect(creditNote.total_amount).toBe(1130.00);
      expect(creditNote.applied_amount).toBe(0.00);
    });

    it('should read a credit note', async () => {
      const contactId = await createContact('Test Customer');

      const creditNoteId = db.prepare(`
        INSERT INTO credit_note (credit_note_number, contact_id, issue_date, status, subtotal, tax_amount, total_amount, applied_amount, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('CN-002', contactId, '2026-01-25', 'issued', 500.00, 65.00, 565.00, 0.00, 'Test read').lastInsertRowid as number;

      const creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;

      expect(creditNote).toBeDefined();
      expect(creditNote.credit_note_number).toBe('CN-002');
      expect(creditNote.status).toBe('issued');
    });

    it('should update credit note status', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-003', contactId, 'draft');

      db.prepare(`
        UPDATE credit_note
        SET status = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run('issued', creditNoteId);

      const creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;

      expect(creditNote.status).toBe('issued');
    });

    it('should enforce unique credit note number constraint', async () => {
      const contactId = await createContact('Test Customer');

      db.prepare(`
        INSERT INTO credit_note (credit_note_number, contact_id, issue_date, status, subtotal, tax_amount, total_amount, applied_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run('CN-004', contactId, '2026-01-25', 'draft', 1000.00, 130.00, 1130.00, 0.00);

      expect(() => {
        db.prepare(`
          INSERT INTO credit_note (credit_note_number, contact_id, issue_date, status, subtotal, tax_amount, total_amount, applied_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run('CN-004', contactId, '2026-01-25', 'draft', 500.00, 65.00, 565.00, 0.00);
      }).toThrow();
    });

    it('should enforce status check constraint', async () => {
      const contactId = await createContact('Test Customer');

      expect(() => {
        db.prepare(`
          INSERT INTO credit_note (credit_note_number, contact_id, issue_date, status, subtotal, tax_amount, total_amount, applied_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run('CN-005', contactId, '2026-01-25', 'invalid_status', 1000.00, 130.00, 1130.00, 0.00);
      }).toThrow();
    });
  });

  describe('Credit Note Line CRUD Operations', () => {
    it('should create credit note lines', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-006', contactId);

      db.prepare(`
        INSERT INTO credit_note_line (credit_note_id, line_number, description, quantity, unit_price, amount, is_tax_inclusive)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(creditNoteId, 1, 'Product A', 10, 100.00, 1000.00, 0);

      db.prepare(`
        INSERT INTO credit_note_line (credit_note_id, line_number, description, quantity, unit_price, amount, is_tax_inclusive)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(creditNoteId, 2, 'Product B', 5, 50.00, 250.00, 0);

      const lines = db.prepare('SELECT * FROM credit_note_line WHERE credit_note_id = ? ORDER BY line_number').all(creditNoteId) as any[];

      expect(lines.length).toBe(2);
      expect(lines[0].description).toBe('Product A');
      expect(lines[0].quantity).toBe(10);
      expect(lines[1].description).toBe('Product B');
    });

    it('should read credit note lines', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-007', contactId);

      db.prepare(`
        INSERT INTO credit_note_line (credit_note_id, line_number, description, quantity, unit_price, amount, is_tax_inclusive)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(creditNoteId, 1, 'Test Item', 1, 100.00, 100.00, 0);

      const line = db.prepare('SELECT * FROM credit_note_line WHERE credit_note_id = ?').get(creditNoteId) as any;

      expect(line).toBeDefined();
      expect(line.description).toBe('Test Item');
    });

    it('should delete credit note lines and update subtotal', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-008', contactId);

      db.prepare(`
        INSERT INTO credit_note_line (credit_note_id, line_number, description, quantity, unit_price, amount, is_tax_inclusive)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(creditNoteId, 1, 'Product A', 10, 100.00, 1000.00, 0);

      let creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.subtotal).toBe(1000.00);

      db.prepare('DELETE FROM credit_note_line WHERE credit_note_id = ?').run(creditNoteId);

      creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.subtotal).toBe(0);
    });
  });

  describe('Credit Note Application CRUD Operations', () => {
    it('should create credit note application', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-009', contactId, 'issued');
      const invoiceId = await createInvoice('INV-001', contactId, 1130.00);

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date, notes)
        VALUES (?, ?, ?, ?, ?)
      `).run(creditNoteId, invoiceId, 500.00, '2026-01-26', 'Partial application');

      const application = db.prepare('SELECT * FROM credit_note_application WHERE credit_note_id = ?').get(creditNoteId) as any;

      expect(application).toBeDefined();
      expect(application.invoice_id).toBe(invoiceId);
      expect(application.amount).toBe(500.00);
    });

    it('should read credit note applications by credit note', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-010', contactId, 'issued');
      const invoiceId1 = await createInvoice('INV-001', contactId, 1130.00);
      const invoiceId2 = await createInvoice('INV-002', contactId, 565.00);

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId, invoiceId1, 500.00, '2026-01-26');

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId, invoiceId2, 265.00, '2026-01-27');

      const applications = db.prepare('SELECT * FROM credit_note_application WHERE credit_note_id = ? ORDER BY application_date DESC').all(creditNoteId) as any[];

      expect(applications.length).toBe(2);
      expect(applications[0].invoice_id).toBe(invoiceId2);
      expect(applications[1].invoice_id).toBe(invoiceId1);
    });

    it('should read credit note applications by invoice', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId1 = await createCreditNote('CN-011', contactId, 'issued');
      const creditNoteId2 = await createCreditNote('CN-012', contactId, 'issued');
      const invoiceId = await createInvoice('INV-001', contactId, 2260.00);

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId1, invoiceId, 500.00, '2026-01-26');

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId2, invoiceId, 300.00, '2026-01-27');

      const applications = db.prepare('SELECT * FROM credit_note_application WHERE invoice_id = ? ORDER BY application_date DESC').all(invoiceId) as any[];

      expect(applications.length).toBe(2);
    });

    it('should update applied amount on application', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-013', contactId, 'issued');
      const invoiceId = await createInvoice('INV-001', contactId, 1130.00);

      let creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.applied_amount).toBe(0.00);

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId, invoiceId, 500.00, '2026-01-26');

      creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.applied_amount).toBe(500.00);
    });

    it('should cascade delete applications when credit note is deleted', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-014', contactId, 'issued');
      const invoiceId = await createInvoice('INV-001', contactId, 1130.00);

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId, invoiceId, 500.00, '2026-01-26');

      const applicationsBefore = db.prepare('SELECT COUNT(*) as count FROM credit_note_application WHERE credit_note_id = ?').get(creditNoteId) as any;
      expect(applicationsBefore.count).toBe(1);

      db.prepare('DELETE FROM credit_note WHERE id = ?').run(creditNoteId);

      const applicationsAfter = db.prepare('SELECT COUNT(*) as count FROM credit_note_application WHERE credit_note_id = ?').get(creditNoteId) as any;
      expect(applicationsAfter.count).toBe(0);
    });
  });

  describe('Credit Note Refund CRUD Operations', () => {
    it('should create a refund', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-015', contactId, 'issued');

      const refundId = db.prepare(`
        INSERT INTO credit_note_refund (credit_note_id, refund_number, refund_date, amount, payment_method, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(creditNoteId, 'REF-001', '2026-01-26', 500.00, 'cash', 'Cash refund').lastInsertRowid as number;

      const refund = db.prepare('SELECT * FROM credit_note_refund WHERE id = ?').get(refundId) as any;

      expect(refund).toBeDefined();
      expect(refund.credit_note_id).toBe(creditNoteId);
      expect(refund.refund_number).toBe('REF-001');
      expect(refund.amount).toBe(500.00);
      expect(refund.payment_method).toBe('cash');
    });

    it('should read refunds by credit note', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-016', contactId, 'issued');

      db.prepare(`
        INSERT INTO credit_note_refund (credit_note_id, refund_number, refund_date, amount, payment_method)
        VALUES (?, ?, ?, ?, ?)
      `).run(creditNoteId, 'REF-001', '2026-01-26', 500.00, 'cash');

      db.prepare(`
        INSERT INTO credit_note_refund (credit_note_id, refund_number, refund_date, amount, payment_method)
        VALUES (?, ?, ?, ?, ?)
      `).run(creditNoteId, 'REF-002', '2026-01-27', 630.00, 'transfer');

      const refunds = db.prepare('SELECT * FROM credit_note_refund WHERE credit_note_id = ?').all(creditNoteId) as any[];

      expect(refunds.length).toBe(2);
      expect(refunds[0].refund_number).toBe('REF-001');
      expect(refunds[1].refund_number).toBe('REF-002');
    });

    it('should enforce unique refund number constraint', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-017', contactId, 'issued');

      db.prepare(`
        INSERT INTO credit_note_refund (credit_note_id, refund_number, refund_date, amount, payment_method)
        VALUES (?, ?, ?, ?, ?)
      `).run(creditNoteId, 'REF-003', '2026-01-26', 500.00, 'cash');

      expect(() => {
        db.prepare(`
          INSERT INTO credit_note_refund (credit_note_id, refund_number, refund_date, amount, payment_method)
          VALUES (?, ?, ?, ?, ?)
        `).run(creditNoteId, 'REF-003', '2026-01-27', 630.00, 'transfer');
      }).toThrow();
    });

    it('should enforce payment method check constraint', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-018', contactId, 'issued');

      expect(() => {
        db.prepare(`
          INSERT INTO credit_note_refund (credit_note_id, refund_number, refund_date, amount, payment_method)
          VALUES (?, ?, ?, ?, ?)
        `).run(creditNoteId, 'REF-004', '2026-01-26', 500.00, 'invalid_method');
      }).toThrow();
    });

    it('should cascade delete refunds when credit note is deleted', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-019', contactId, 'issued');

      db.prepare(`
        INSERT INTO credit_note_refund (credit_note_id, refund_number, refund_date, amount, payment_method)
        VALUES (?, ?, ?, ?, ?)
      `).run(creditNoteId, 'REF-005', '2026-01-26', 500.00, 'cash');

      const refundsBefore = db.prepare('SELECT COUNT(*) as count FROM credit_note_refund WHERE credit_note_id = ?').get(creditNoteId) as any;
      expect(refundsBefore.count).toBe(1);

      db.prepare('DELETE FROM credit_note WHERE id = ?').run(creditNoteId);

      const refundsAfter = db.prepare('SELECT COUNT(*) as count FROM credit_note_refund WHERE credit_note_id = ?').get(creditNoteId) as any;
      expect(refundsAfter.count).toBe(0);
    });
  });

  describe('Database Triggers', () => {
    it('should update subtotal when credit note line is inserted', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = db.prepare(`
        INSERT INTO credit_note (credit_note_number, contact_id, issue_date, status, subtotal, tax_amount, total_amount, applied_amount, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('CN-020', contactId, '2026-01-25', 'draft', 0.00, 0.00, 0.00, 0.00, 'Test trigger').lastInsertRowid as number;

      let creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.subtotal).toBe(0.00);

      db.prepare(`
        INSERT INTO credit_note_line (credit_note_id, line_number, description, quantity, unit_price, amount, is_tax_inclusive)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(creditNoteId, 1, 'Product A', 10, 100.00, 1000.00, 0);

      creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.subtotal).toBe(1000.00);
    });

    it('should update subtotal when multiple credit note lines are inserted', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-021', contactId);

      db.prepare(`
        INSERT INTO credit_note_line (credit_note_id, line_number, description, quantity, unit_price, amount, is_tax_inclusive)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(creditNoteId, 1, 'Product A', 10, 100.00, 1000.00, 0);

      db.prepare(`
        INSERT INTO credit_note_line (credit_note_id, line_number, description, quantity, unit_price, amount, is_tax_inclusive)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(creditNoteId, 2, 'Product B', 5, 50.00, 250.00, 0);

      db.prepare(`
        INSERT INTO credit_note_line (credit_note_id, line_number, description, quantity, unit_price, amount, is_tax_inclusive)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(creditNoteId, 3, 'Product C', 2, 75.00, 150.00, 0);

      const creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.subtotal).toBe(1400.00);
    });

    it('should update subtotal when credit note line is deleted', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-022', contactId);

      db.prepare(`
        INSERT INTO credit_note_line (credit_note_id, line_number, description, quantity, unit_price, amount, is_tax_inclusive)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(creditNoteId, 1, 'Product A', 10, 100.00, 1000.00, 0);

      db.prepare(`
        INSERT INTO credit_note_line (credit_note_id, line_number, description, quantity, unit_price, amount, is_tax_inclusive)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(creditNoteId, 2, 'Product B', 5, 50.00, 250.00, 0);

      let creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.subtotal).toBe(1250.00);

      db.prepare('DELETE FROM credit_note_line WHERE credit_note_id = ? AND line_number = 2').run(creditNoteId);

      creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.subtotal).toBe(1000.00);
    });

    it('should update applied amount when credit note application is inserted', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-023', contactId, 'issued');
      const invoiceId1 = await createInvoice('INV-001', contactId, 1130.00);
      const invoiceId2 = await createInvoice('INV-002', contactId, 565.00);

      let creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.applied_amount).toBe(0.00);

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId, invoiceId1, 500.00, '2026-01-26');

      creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.applied_amount).toBe(500.00);

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId, invoiceId2, 265.00, '2026-01-27');

      creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.applied_amount).toBe(765.00);
    });

    it('should update applied amount when credit note application is deleted', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-024', contactId, 'issued');
      const invoiceId1 = await createInvoice('INV-001', contactId, 1130.00);
      const invoiceId2 = await createInvoice('INV-002', contactId, 565.00);

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId, invoiceId1, 500.00, '2026-01-26');

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId, invoiceId2, 265.00, '2026-01-27');

      let creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.applied_amount).toBe(765.00);

      db.prepare('DELETE FROM credit_note_application WHERE credit_note_id = ? AND invoice_id = ?').run(creditNoteId, invoiceId1);

      creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.applied_amount).toBe(265.00);
    });
  });

  describe('Foreign Key Constraints', () => {
    it('should enforce foreign key constraint on credit_note.contact_id', async () => {
      expect(() => {
        db.prepare(`
          INSERT INTO credit_note (credit_note_number, contact_id, issue_date, status, subtotal, tax_amount, total_amount, applied_amount)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run('CN-025', 9999, '2026-01-25', 'draft', 1000.00, 130.00, 1130.00, 0.00);
      }).toThrow();
    });

    it('should enforce foreign key constraint on credit_note_line.credit_note_id', async () => {
      expect(() => {
        db.prepare(`
          INSERT INTO credit_note_line (credit_note_id, line_number, description, quantity, unit_price, amount, is_tax_inclusive)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(9999, 1, 'Test Item', 1, 100.00, 100.00, 0);
      }).toThrow();
    });

    it('should enforce foreign key constraint on credit_note_application.credit_note_id', async () => {
      const contactId = await createContact('Test Customer');
      const invoiceId = await createInvoice('INV-001', contactId, 1130.00);

      expect(() => {
        db.prepare(`
          INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
          VALUES (?, ?, ?, ?)
        `).run(9999, invoiceId, 500.00, '2026-01-26');
      }).toThrow();
    });

    it('should enforce foreign key constraint on credit_note_application.invoice_id', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-026', contactId, 'issued');

      expect(() => {
        db.prepare(`
          INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
          VALUES (?, ?, ?, ?)
        `).run(creditNoteId, 9999, 500.00, '2026-01-26');
      }).toThrow();
    });

    it('should enforce foreign key constraint on credit_note_refund.credit_note_id', async () => {
      expect(() => {
        db.prepare(`
          INSERT INTO credit_note_refund (credit_note_id, refund_number, refund_date, amount, payment_method)
          VALUES (?, ?, ?, ?, ?)
        `).run(9999, 'REF-001', '2026-01-26', 500.00, 'cash');
      }).toThrow();
    });
  });

  describe('Full Workflow Integration', () => {
    it('should complete credit note to invoice application workflow', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-027', contactId, 'issued');
      const invoiceId = await createInvoice('INV-001', contactId, 1130.00);

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId, invoiceId, 500.00, '2026-01-26');

      const creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.applied_amount).toBe(500.00);
      expect(creditNote.status).toBe('issued');

      const applications = db.prepare('SELECT * FROM credit_note_application WHERE credit_note_id = ?').all(creditNoteId) as any[];
      expect(applications.length).toBe(1);
    });

    it('should handle partial and multiple applications', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-028', contactId, 'issued');
      const invoiceId1 = await createInvoice('INV-001', contactId, 1130.00);
      const invoiceId2 = await createInvoice('INV-002', contactId, 565.00);
      const invoiceId3 = await createInvoice('INV-003', contactId, 226.00);

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId, invoiceId1, 500.00, '2026-01-26');

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId, invoiceId2, 265.00, '2026-01-27');

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId, invoiceId3, 226.00, '2026-01-28');

      const creditNote = db.prepare('SELECT * FROM credit_note WHERE id = ?').get(creditNoteId) as any;
      expect(creditNote.applied_amount).toBe(991.00);

      const applications = db.prepare('SELECT * FROM credit_note_application WHERE credit_note_id = ?').all(creditNoteId) as any[];
      expect(applications.length).toBe(3);
    });

    it('should handle credit note with refunds', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-029', contactId, 'issued');

      db.prepare(`
        INSERT INTO credit_note_refund (credit_note_id, refund_number, refund_date, amount, payment_method)
        VALUES (?, ?, ?, ?, ?)
      `).run(creditNoteId, 'REF-001', '2026-01-26', 500.00, 'cash');

      db.prepare(`
        INSERT INTO credit_note_refund (credit_note_id, refund_number, refund_date, amount, payment_method)
        VALUES (?, ?, ?, ?, ?)
      `).run(creditNoteId, 'REF-002', '2026-01-27', 630.00, 'transfer');

      const refunds = db.prepare('SELECT * FROM credit_note_refund WHERE credit_note_id = ?').all(creditNoteId) as any[];
      expect(refunds.length).toBe(2);
      expect(refunds[0].amount).toBe(500.00);
      expect(refunds[1].amount).toBe(630.00);
    });

    it('should handle credit note with both applications and refunds', async () => {
      const contactId = await createContact('Test Customer');
      const creditNoteId = await createCreditNote('CN-030', contactId, 'issued');
      const invoiceId = await createInvoice('INV-001', contactId, 1130.00);

      db.prepare(`
        INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, application_date)
        VALUES (?, ?, ?, ?)
      `).run(creditNoteId, invoiceId, 500.00, '2026-01-26');

      db.prepare(`
        INSERT INTO credit_note_refund (credit_note_id, refund_number, refund_date, amount, payment_method)
        VALUES (?, ?, ?, ?, ?)
      `).run(creditNoteId, 'REF-001', '2026-01-27', 630.00, 'cash');

      const applications = db.prepare('SELECT * FROM credit_note_application WHERE credit_note_id = ?').all(creditNoteId) as any[];
      expect(applications.length).toBe(1);

      const refunds = db.prepare('SELECT * FROM credit_note_refund WHERE credit_note_id = ?').all(creditNoteId) as any[];
      expect(refunds.length).toBe(1);
    });
  });

  describe('Index Verification', () => {
    it('should use index on credit_note_number for lookups', async () => {
      const contactId = await createContact('Test Customer');
      await createCreditNote('CN-031', contactId);

      const query = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM credit_note WHERE credit_note_number = ?').all('CN-031');
      const usesIndex = query.some((row: any) => row.detail && row.detail.includes('credit_note_number'));

      expect(usesIndex).toBe(true);
    });

    it('should use index on credit_note_contact for contact lookups', async () => {
      const contactId = await createContact('Test Customer');
      await createCreditNote('CN-032', contactId);

      const query = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM credit_note WHERE contact_id = ?').all(contactId);
      const usesIndex = query.some((row: any) => row.detail.includes('idx_credit_note_contact'));

      expect(usesIndex).toBe(true);
    });

    it('should use index on credit_note_status for status lookups', async () => {
      const contactId = await createContact('Test Customer');
      await createCreditNote('CN-033', contactId, 'issued');

      const query = db.prepare('EXPLAIN QUERY PLAN SELECT * FROM credit_note WHERE status = ?').all('issued');
      const usesIndex = query.some((row: any) => row.detail.includes('idx_credit_note_status'));

      expect(usesIndex).toBe(true);
    });
  });
});
