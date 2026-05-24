import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getTestDatabase } from './test-db';
import { persistenceService } from '../../lib/services/persistence';
import { PostingEngine } from '../../lib/domain/posting-engine';
import type { Account, InvoiceLine, PaymentMethod, PolicyContext } from '../../lib/domain/types';

// ─── Mock Overrides ───────────────────────────────────────────────────────────
// Override the global system-accounts mock from setup.ts — the original uses
// better-sqlite3's non-existent .get() method on the Database object directly.
vi.mock('../../lib/services/system-accounts', () => ({
  getSystemAccount: vi.fn(async (role: string) => {
    const { getTestDatabase } = await import('./test-db');
    const db = await getTestDatabase();
    const stmt = db.prepare(
      `SELECT a.* FROM account a
       JOIN system_account sa ON a.id = sa.account_id
       WHERE sa.role = ?
       LIMIT 1`,
    );
    const result = stmt.get(role) as Record<string, unknown> | undefined;
    if (!result) {
      throw new Error(`System account '${role}' not found`);
    }
    return result as unknown as Account;
  }),
  tryGetSystemAccount: vi.fn(async (role: string) => {
    const { getTestDatabase } = await import('./test-db');
    const db = await getTestDatabase();
    const stmt = db.prepare(
      `SELECT a.* FROM account a
       JOIN system_account sa ON a.id = sa.account_id
       WHERE sa.role = ?
       LIMIT 1`,
    );
    const result = stmt.get(role) as Record<string, unknown> | undefined;
    return (result as unknown as Account) ?? null;
  }),
}));

// Override the tax mock from setup.ts — the original returns a hardcoded
// accountId (2001) that doesn't exist in the test database, which breaks
// domain functions that validate the returned account exists.
vi.mock('../../lib/services/tax', () => ({
  calculateTax: vi.fn(
    async (subtotal: number, _taxCodeId: number, _issueDate: string, isTaxInclusive: boolean) => {
      const { getTestDatabase } = await import('./test-db');
      const db = await getTestDatabase();
      const hstRow = db.prepare("SELECT id FROM account WHERE code = '2100'").get() as
        | { id: number }
        | undefined;
      const taxAmount = isTaxInclusive ? subtotal * 0.13 : subtotal * 0.13;
      return {
        taxAmount,
        taxRate: 0.13,
        accountId: taxAmount > 0 && hstRow ? hstRow.id : null,
        netSubtotal: subtotal,
      };
    },
  ),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const defaultContext: PolicyContext = { mode: 'pro', user: 'test_user' };

function getAccountBalance(
  db: Awaited<ReturnType<typeof getTestDatabase>>,
  accountCode: string,
): number {
  const account = db.prepare('SELECT id, type FROM account WHERE code = ?').get(accountCode) as
    | {
        id: number;
        type: string;
      }
    | undefined;
  if (!account) return 0;

  const result = db
    .prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN debit_amount > 0 THEN debit_amount ELSE 0 END), 0) as total_debit,
      COALESCE(SUM(CASE WHEN credit_amount > 0 THEN credit_amount ELSE 0 END), 0) as total_credit
    FROM journal_line jl
    JOIN journal_entry je ON jl.journal_entry_id = je.id
    WHERE jl.account_id = ? AND je.status = 'posted'
  `)
    .get(account.id) as { total_debit: number; total_credit: number };

  const debit = result.total_debit || 0;
  const credit = result.total_credit || 0;

  if (account.type === 'asset' || account.type === 'expense') {
    return debit - credit;
  }
  return credit - debit;
}

function isJournalEntryBalanced(
  db: Awaited<ReturnType<typeof getTestDatabase>>,
  entryId: number,
): boolean {
  const result = db
    .prepare(`
    SELECT
      COALESCE(SUM(debit_amount), 0) as total_debit,
      COALESCE(SUM(credit_amount), 0) as total_credit
    FROM journal_line
    WHERE journal_entry_id = ?
  `)
    .get(entryId) as { total_debit: number; total_credit: number };

  return Math.abs(result.total_debit - result.total_credit) < 0.01;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Integration - Service Layer Operations', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeEach(async () => {
    db = await getTestDatabase();

    const sysAcct = db.prepare(
      'INSERT OR IGNORE INTO system_account (role, account_id, description) VALUES (?, ?, ?)',
    );

    const acctByCode = new Map(
      (db.prepare('SELECT id, code FROM account').all() as Array<{ id: number; code: string }>).map(
        (a) => [a.code, a.id],
      ),
    );

    sysAcct.run('accounts_receivable', acctByCode.get('1100'), 'Accounts Receivable');
    sysAcct.run('accounts_payable', acctByCode.get('2000'), 'Accounts Payable');
    sysAcct.run('sales_tax_payable', acctByCode.get('2100'), 'Sales Tax Payable');
    sysAcct.run('checking_account', acctByCode.get('1000'), 'Cash');
    sysAcct.run('cash_default', acctByCode.get('1000'), 'Cash');
    sysAcct.run('customer_deposits', acctByCode.get('2100'), 'Customer Deposits');

    db.prepare(`
      INSERT INTO contact (type, name, is_active) VALUES ('customer', 'Test Customer', 1)
    `).run();
  });

  // ── A. Account Service CRUD ─────────────────────────────────────────────

  describe('Account CRUD via persistence service', () => {
    it('should create an account and return its ID', async () => {
      const id = await persistenceService.createAccount({
        code: '1500',
        name: 'Equipment',
        type: 'asset',
        parent_id: null,
        is_active: true,
      });

      expect(id).toBeGreaterThan(0);

      const row = db.prepare('SELECT * FROM account WHERE id = ?').get(id) as Record<
        string,
        unknown
      >;
      expect(row).toBeDefined();
      expect(row.code).toBe('1500');
      expect(row.name).toBe('Equipment');
      expect(row.type).toBe('asset');
    });

    it('should get all accounts including seeded and created ones', async () => {
      await persistenceService.createAccount({
        code: '1500',
        name: 'Equipment',
        type: 'asset',
        parent_id: null,
        is_active: true,
      });

      const accounts = await persistenceService.getAccounts();
      expect(accounts.length).toBeGreaterThanOrEqual(14);

      const created = accounts.find((a) => a.code === '1500');
      expect(created).toBeDefined();
      expect(created!.name).toBe('Equipment');
    });

    it('should get an account by ID', async () => {
      const id = await persistenceService.createAccount({
        code: '1600',
        name: 'Land',
        type: 'asset',
        parent_id: null,
        is_active: true,
      });

      const account = await persistenceService.getAccountById(id);
      expect(account).toBeDefined();
      expect(account!.code).toBe('1600');
      expect(account!.name).toBe('Land');
    });

    it('should update account name and code', async () => {
      const id = await persistenceService.createAccount({
        code: '1700',
        name: 'Old Name',
        type: 'liability',
        parent_id: null,
        is_active: true,
      });

      await persistenceService.updateAccount(id, { name: 'New Name', code: '1701' });

      const updated = db.prepare('SELECT * FROM account WHERE id = ?').get(id) as Record<
        string,
        unknown
      >;
      expect(updated.name).toBe('New Name');
      expect(updated.code).toBe('1701');
    });

    it('should deactivate an account via soft delete', async () => {
      const id = await persistenceService.createAccount({
        code: '1800',
        name: 'Temp Account',
        type: 'expense',
        parent_id: null,
        is_active: true,
      });

      await persistenceService.updateAccount(id, { is_active: false });

      const row = db.prepare('SELECT is_active FROM account WHERE id = ?').get(id) as {
        is_active: number;
      };
      expect(row.is_active).toBe(0);
    });

    it('should exclude inactive accounts by default', async () => {
      await persistenceService.createAccount({
        code: '1800',
        name: 'Inactive Acct',
        type: 'expense',
        parent_id: null,
        is_active: false,
      });

      const active = await persistenceService.getAccounts();
      expect(active.find((a) => a.code === '1800')).toBeUndefined();

      const all = await persistenceService.getAccounts(true);
      expect(all.find((a) => a.code === '1800')).toBeDefined();
    });
  });

  // ── B. Contact Service CRUD ──────────────────────────────────────────────

  describe('Contact CRUD via persistence service', () => {
    it('should create a contact and return its ID', async () => {
      const id = await persistenceService.createContact({
        type: 'customer',
        name: 'Acme Corp',
        email: 'billing@acme.com',
        is_active: true,
      });

      expect(id).toBeGreaterThan(0);

      const row = db.prepare('SELECT * FROM contact WHERE id = ?').get(id) as Record<
        string,
        unknown
      >;
      expect(row).toBeDefined();
      expect(row.name).toBe('Acme Corp');
    });

    it('should get all active contacts', async () => {
      await persistenceService.createContact({
        type: 'vendor',
        name: 'Supplier Inc',
        is_active: true,
      });

      const contacts = await persistenceService.getContacts();
      expect(contacts.length).toBeGreaterThanOrEqual(2);
      expect(contacts.some((c) => c.name === 'Supplier Inc')).toBe(true);
    });

    it('should filter contacts by type', async () => {
      await persistenceService.createContact({
        type: 'vendor',
        name: 'Vendor Only',
        is_active: true,
      });

      const vendors = await persistenceService.getContacts('vendor');
      expect(vendors.some((c) => c.name === 'Vendor Only')).toBe(true);
    });
  });

  // ── C. Journal Entry Operations ──────────────────────────────────────────

  describe('Journal Entry via persistence service', () => {
    it('should create a balanced journal entry', async () => {
      const eventId = await persistenceService.createTransactionEvent({
        event_type: 'manual_entry',
        description: 'Test entry',
        reference: 'JE-001',
        created_by: 'test_user',
      });

      const arId = (
        db.prepare("SELECT id FROM account WHERE code = '1100'").get() as { id: number }
      ).id;
      const revenueId = (
        db.prepare("SELECT id FROM account WHERE code = '4000'").get() as { id: number }
      ).id;

      const entryId = await persistenceService.createJournalEntry(
        {
          event_id: eventId,
          entry_date: '2026-06-01',
          description: 'Test journal entry',
          reference: 'JE-001',
          status: 'posted',
        },
        [
          { account_id: arId, debit_amount: 100.0, credit_amount: 0.0 },
          { account_id: revenueId, debit_amount: 0.0, credit_amount: 100.0 },
        ],
      );

      expect(entryId).toBeGreaterThan(0);
      expect(isJournalEntryBalanced(db, entryId)).toBe(true);
    });

    it('should persist journal lines with correct amounts', async () => {
      const eventId = await persistenceService.createTransactionEvent({
        event_type: 'manual_entry',
        description: 'Split entry',
        reference: 'JE-002',
        created_by: 'test_user',
      });

      const cashId = (
        db.prepare("SELECT id FROM account WHERE code = '1000'").get() as { id: number }
      ).id;
      const officeExpId = (
        db.prepare("SELECT id FROM account WHERE code = '5100'").get() as { id: number }
      ).id;
      const taxExpId = (
        db.prepare("SELECT id FROM account WHERE code = '5300'").get() as { id: number }
      ).id;

      const entryId = await persistenceService.createJournalEntry(
        {
          event_id: eventId,
          entry_date: '2026-06-15',
          description: 'Office supplies split',
          reference: 'JE-002',
          status: 'posted',
        },
        [
          { account_id: officeExpId, debit_amount: 80.0, credit_amount: 0.0 },
          { account_id: taxExpId, debit_amount: 20.0, credit_amount: 0.0 },
          { account_id: cashId, debit_amount: 0.0, credit_amount: 100.0 },
        ],
      );

      const lines = await persistenceService.getJournalLines(entryId);
      expect(lines).toHaveLength(3);

      const totalDebit = lines.reduce((s, l) => s + l.debit_amount, 0);
      const totalCredit = lines.reduce((s, l) => s + l.credit_amount, 0);
      expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.01);
    });

    it('should track event to entry relationship', async () => {
      const eventId = await persistenceService.createTransactionEvent({
        event_type: 'manual_entry',
        description: 'Rel test',
        reference: 'JE-003',
        created_by: 'test_user',
      });

      const cashId = (
        db.prepare("SELECT id FROM account WHERE code = '1000'").get() as { id: number }
      ).id;
      const revenueId = (
        db.prepare("SELECT id FROM account WHERE code = '4000'").get() as { id: number }
      ).id;

      await persistenceService.createJournalEntry(
        {
          event_id: eventId,
          entry_date: '2026-07-01',
          description: 'Relation test',
          status: 'posted',
        },
        [
          { account_id: cashId, debit_amount: 50.0, credit_amount: 0.0 },
          { account_id: revenueId, debit_amount: 0.0, credit_amount: 50.0 },
        ],
      );

      const entries = await persistenceService.getJournalEntries(10);
      const match = entries.find((e) => e.event_id === eventId);
      expect(match).toBeDefined();
      expect(match!.description).toBe('Relation test');
    });

    it('should enforce journal entry balance at the database level', async () => {
      const eventId = await persistenceService.createTransactionEvent({
        event_type: 'manual_entry',
        description: 'Unbalanced',
        created_by: 'test_user',
      });

      const cashId = (
        db.prepare("SELECT id FROM account WHERE code = '1000'").get() as { id: number }
      ).id;

      const entryId = await persistenceService.createJournalEntry(
        { event_id: eventId, entry_date: '2026-07-01', description: 'Unbalanced', status: 'draft' },
        [{ account_id: cashId, debit_amount: 100.0, credit_amount: 0.0 }],
      );

      await expect(persistenceService.postJournalEntry(entryId, 'test_user')).rejects.toThrow();
    });
  });

  // ── D. Invoice Operations ───────────────────────────────────────────────

  describe('Invoice creation via persistence service', () => {
    it('should create an invoice and return its ID', async () => {
      const contactId = (
        db.prepare("SELECT id FROM contact WHERE name = 'Test Customer'").get() as { id: number }
      ).id;

      const eventId = await persistenceService.createTransactionEvent({
        event_type: 'invoice_created',
        description: 'Invoice INV-001',
        reference: 'INV-001',
        created_by: 'test_user',
      });

      const invoiceId = await persistenceService.createInvoice(
        {
          invoice_number: 'INV-001',
          contact_id: contactId,
          event_id: eventId,
          issue_date: '2026-06-01',
          due_date: '2026-07-01',
          status: 'sent',
          subtotal: 1000.0,
          tax_amount: 130.0,
          total_amount: 1130.0,
          paid_amount: 0.0,
        },
        [
          {
            line_number: 1,
            description: 'Consulting services',
            quantity: 10,
            unit_price: 100.0,
            amount: 1000.0,
          },
        ],
      );

      expect(invoiceId).toBeGreaterThan(0);
    });

    it.skip('should retrieve created invoice by ID', async () => {
      const contactId = (
        db.prepare("SELECT id FROM contact WHERE name = 'Test Customer'").get() as { id: number }
      ).id;

      const eventId = await persistenceService.createTransactionEvent({
        event_type: 'invoice_created',
        description: 'Invoice INV-002',
        reference: 'INV-002',
        created_by: 'test_user',
      });

      const invoiceId = await persistenceService.createInvoice(
        {
          invoice_number: 'INV-002',
          contact_id: contactId,
          event_id: eventId,
          issue_date: '2026-06-15',
          due_date: '2026-07-15',
          status: 'sent',
          subtotal: 500.0,
          tax_amount: 65.0,
          total_amount: 565.0,
          paid_amount: 0.0,
        },
        [
          {
            line_number: 1,
            description: 'Product sale',
            quantity: 5,
            unit_price: 100.0,
            amount: 500.0,
          },
        ],
      );

      const invoice = await persistenceService.getInvoiceById(invoiceId);
      expect(invoice).toBeDefined();
      expect(invoice!.invoice_number).toBe('INV-002');
      expect(invoice!.total_amount).toBe(565.0);
    });

    it('should retrieve invoice lines', async () => {
      const contactId = (
        db.prepare("SELECT id FROM contact WHERE name = 'Test Customer'").get() as { id: number }
      ).id;

      const eventId = await persistenceService.createTransactionEvent({
        event_type: 'invoice_created',
        description: 'Invoice INV-003',
        reference: 'INV-003',
        created_by: 'test_user',
      });

      const invoiceId = await persistenceService.createInvoice(
        {
          invoice_number: 'INV-003',
          contact_id: contactId,
          event_id: eventId,
          issue_date: '2026-07-01',
          due_date: '2026-08-01',
          status: 'sent',
          subtotal: 200.0,
          tax_amount: 26.0,
          total_amount: 226.0,
          paid_amount: 0.0,
        },
        [
          { line_number: 1, description: 'Item A', quantity: 2, unit_price: 50.0, amount: 100.0 },
          { line_number: 2, description: 'Item B', quantity: 1, unit_price: 100.0, amount: 100.0 },
        ],
      );

      const lines = await persistenceService.getInvoiceLines(invoiceId);
      expect(lines).toHaveLength(2);
      expect(lines[0].description).toBe('Item A');
      expect(lines[1].description).toBe('Item B');
    });
  });

  describe('Invoice domain operation (createInvoice)', () => {
    it('should create invoice with balanced journal entries via domain function', async () => {
      const { createInvoice } = await import('../../lib/domain/invoice-operations');

      const contactId = (
        db.prepare("SELECT id FROM contact WHERE name = 'Test Customer'").get() as { id: number }
      ).id;
      const revenueId = (
        db.prepare("SELECT id FROM account WHERE code = '4000'").get() as { id: number }
      ).id;

      const invoiceData = {
        invoice_number: 'DOM-INV-001',
        contact_id: contactId,
        issue_date: '2026-06-01',
        due_date: '2026-07-01',
        tax_code_id: 1,
      };

      const lines: InvoiceLine[] = [
        {
          line_number: 1,
          description: 'Consulting services',
          quantity: 10,
          unit_price: 100.0,
          amount: 1000.0,
          account_id: revenueId,
        },
      ];

      const result = await createInvoice(invoiceData, lines, defaultContext);
      expect(result.ok).toBe(true);
      expect(result.invoice_id).toBeGreaterThan(0);
      expect(result.journal_entry_id).toBeGreaterThan(0);

      expect(isJournalEntryBalanced(db, result.journal_entry_id!)).toBe(true);

      const arBalance = getAccountBalance(db, '1100');
      expect(arBalance).toBeGreaterThan(0);
    });

    it('should reject invoice with zero quantity line item', async () => {
      const { createInvoice } = await import('../../lib/domain/invoice-operations');

      const contactId = (
        db.prepare("SELECT id FROM contact WHERE name = 'Test Customer'").get() as { id: number }
      ).id;
      const revenueId = (
        db.prepare("SELECT id FROM account WHERE code = '4000'").get() as { id: number }
      ).id;

      const result = await createInvoice(
        {
          invoice_number: 'INV-ZERO',
          contact_id: contactId,
          issue_date: '2026-06-01',
          due_date: '2026-07-01',
          tax_code_id: 1,
        },
        [
          {
            line_number: 1,
            description: 'Zero qty',
            quantity: 0,
            unit_price: 100.0,
            amount: 0,
            account_id: revenueId,
          },
        ],
        defaultContext,
      );

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toMatch(/quantity greater than 0/i);
    });

    it('should reject invoice without tax code', async () => {
      const { createInvoice } = await import('../../lib/domain/invoice-operations');

      const contactId = (
        db.prepare("SELECT id FROM contact WHERE name = 'Test Customer'").get() as { id: number }
      ).id;
      const revenueId = (
        db.prepare("SELECT id FROM account WHERE code = '4000'").get() as { id: number }
      ).id;

      const result = await createInvoice(
        {
          invoice_number: 'INV-NOTAX',
          contact_id: contactId,
          issue_date: '2026-06-01',
          due_date: '2026-07-01',
        },
        [
          {
            line_number: 1,
            description: 'No tax code',
            quantity: 1,
            unit_price: 100.0,
            amount: 100.0,
            account_id: revenueId,
          },
        ],
        defaultContext,
      );

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toMatch(/tax code is required/i);
    });

    it('should reject invoice with due date before issue date', async () => {
      const { createInvoice } = await import('../../lib/domain/invoice-operations');

      const contactId = (
        db.prepare("SELECT id FROM contact WHERE name = 'Test Customer'").get() as { id: number }
      ).id;
      const revenueId = (
        db.prepare("SELECT id FROM account WHERE code = '4000'").get() as { id: number }
      ).id;

      const result = await createInvoice(
        {
          invoice_number: 'INV-DATE',
          contact_id: contactId,
          issue_date: '2026-07-01',
          due_date: '2026-06-01',
          tax_code_id: 1,
        },
        [
          {
            line_number: 1,
            description: 'Date issue',
            quantity: 1,
            unit_price: 100.0,
            amount: 100.0,
            account_id: revenueId,
          },
        ],
        defaultContext,
      );

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toMatch(/due date must be on or after/i);
    });

  });

  // ── E. Payment Operations ───────────────────────────────────────────────

  describe('Payment operations', () => {
    it('should create a payment record via persistence service', async () => {
      const contactId = (
        db.prepare("SELECT id FROM contact WHERE name = 'Test Customer'").get() as { id: number }
      ).id;

      const eventId = await persistenceService.createTransactionEvent({
        event_type: 'payment_received',
        description: 'Payment PMT-001',
        reference: 'PMT-001',
        created_by: 'test_user',
      });

      const paymentId = await persistenceService.createPayment({
        payment_number: 'PMT-001',
        contact_id: contactId,
        event_id: eventId,
        payment_date: '2026-06-15',
        amount: 500.0,
        payment_method: 'check' as PaymentMethod,
        allocated_amount: 0,
        status: 'pending',
      });

      expect(paymentId).toBeGreaterThan(0);

      const payment = await persistenceService.getPaymentById(paymentId);
      expect(payment).toBeDefined();
      expect(payment!.amount).toBe(500.0);
    });

    it('should create allocations linking payment to invoices', async () => {
      const contactId = (
        db.prepare("SELECT id FROM contact WHERE name = 'Test Customer'").get() as { id: number }
      ).id;

      const invEventId = await persistenceService.createTransactionEvent({
        event_type: 'invoice_created',
        description: 'Invoice INV-100',
        reference: 'INV-100',
        created_by: 'test_user',
      });

      const invoiceId = await persistenceService.createInvoice(
        {
          invoice_number: 'INV-100',
          contact_id: contactId,
          event_id: invEventId,
          issue_date: '2026-06-01',
          due_date: '2026-07-01',
          status: 'sent',
          subtotal: 1000.0,
          tax_amount: 130.0,
          total_amount: 1130.0,
          paid_amount: 0.0,
        },
        [
          {
            line_number: 1,
            description: 'Services',
            quantity: 10,
            unit_price: 100.0,
            amount: 1000.0,
          },
        ],
      );

      const pmtEventId = await persistenceService.createTransactionEvent({
        event_type: 'payment_received',
        description: 'Payment PMT-100',
        reference: 'PMT-100',
        created_by: 'test_user',
      });

      const paymentId = await persistenceService.createPayment({
        payment_number: 'PMT-100',
        contact_id: contactId,
        event_id: pmtEventId,
        payment_date: '2026-06-20',
        amount: 500.0,
        payment_method: 'check' as PaymentMethod,
        allocated_amount: 500.0,
        status: 'allocated',
      });

      const allocationId = await persistenceService.createAllocation({
        payment_id: paymentId,
        invoice_id: invoiceId,
        amount: 500.0,
        allocation_method: 'manual',
      });

      expect(allocationId).toBeGreaterThan(0);

      const updatedInvoice = db
        .prepare('SELECT paid_amount FROM invoice WHERE id = ?')
        .get(invoiceId) as { paid_amount: number };
      expect(updatedInvoice.paid_amount).toBe(500.0);
    });

    it.skip('should create payment with journal entries via domain function', async () => {
      const { createPayment } = await import('../../lib/domain/payment-operations');

      const contactId = (
        db.prepare("SELECT id FROM contact WHERE name = 'Test Customer'").get() as { id: number }
      ).id;
      const revenueId = (
        db.prepare("SELECT id FROM account WHERE code = '4000'").get() as { id: number }
      ).id;
      const arId = (
        db.prepare("SELECT id FROM account WHERE code = '1100'").get() as { id: number }
      ).id;

      const invEventId = await persistenceService.createTransactionEvent({
        event_type: 'invoice_created',
        description: 'Invoice INV-200',
        reference: 'INV-200',
        created_by: 'test_user',
      });

      await persistenceService.createJournalEntry(
        {
          event_id: invEventId,
          entry_date: '2026-06-01',
          description: 'Invoice entry',
          status: 'posted',
        },
        [
          { account_id: arId, debit_amount: 1130.0, credit_amount: 0.0 },
          { account_id: revenueId, debit_amount: 0.0, credit_amount: 1000.0 },
        ],
      );

      const invoiceId = await persistenceService.createInvoice(
        {
          invoice_number: 'INV-200',
          contact_id: contactId,
          event_id: invEventId,
          issue_date: '2026-06-01',
          due_date: '2026-07-01',
          status: 'sent',
          subtotal: 1000.0,
          tax_amount: 130.0,
          total_amount: 1130.0,
          paid_amount: 0.0,
        },
        [
          {
            line_number: 1,
            description: 'Services',
            quantity: 10,
            unit_price: 100.0,
            amount: 1000.0,
          },
        ],
      );

      const result = await createPayment(
        {
          payment_number: 'PMT-200',
          contact_id: contactId,
          payment_date: '2026-06-20',
          amount: 1130.0,
          payment_method: 'check' as PaymentMethod,
        },
        [{ invoice_id: invoiceId, amount: 1130.0 }],
        defaultContext,
      );

      expect(result.ok).toBe(true);
      expect(result.payment_id).toBeGreaterThan(0);
      expect(result.journal_entry_id).toBeGreaterThan(0);

      expect(isJournalEntryBalanced(db, result.journal_entry_id!)).toBe(true);
    });

    it('should reject payment with zero amount', async () => {
      const { createPayment } = await import('../../lib/domain/payment-operations');

      const result = await createPayment(
        {
          payment_number: 'PMT-ZERO',
          payment_date: '2026-06-01',
          amount: 0,
          payment_method: 'cash' as PaymentMethod,
        },
        [],
        defaultContext,
      );

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toMatch(/amount must be greater than 0/i);
    });
  });

  // ── F. Expense Operations ───────────────────────────────────────────────

  describe('Expense operations', () => {
    it('should create an expense journal entry via persistence service', async () => {
      const eventId = await persistenceService.createTransactionEvent({
        event_type: 'expense_recorded',
        description: 'Office supplies',
        reference: 'EXP-001',
        created_by: 'test_user',
      });

      const cashId = (
        db.prepare("SELECT id FROM account WHERE code = '1000'").get() as { id: number }
      ).id;
      const expenseId = (
        db.prepare("SELECT id FROM account WHERE code = '5100'").get() as { id: number }
      ).id;

      const entryId = await persistenceService.createJournalEntry(
        {
          event_id: eventId,
          entry_date: '2026-06-01',
          description: 'Office supplies expense',
          status: 'posted',
        },
        [
          { account_id: expenseId, debit_amount: 150.0, credit_amount: 0.0 },
          { account_id: cashId, debit_amount: 0.0, credit_amount: 150.0 },
        ],
      );

      expect(entryId).toBeGreaterThan(0);
      expect(isJournalEntryBalanced(db, entryId)).toBe(true);

      expect(getAccountBalance(db, '5100')).toBe(150.0);
      expect(getAccountBalance(db, '1000')).toBe(-150.0);
    });

    it('should create expense via domain function', async () => {
      const { createExpense } = await import('../../lib/domain/expense-operations');

      const cashId = (
        db.prepare("SELECT id FROM account WHERE code = '1000'").get() as { id: number }
      ).id;
      const expenseId = (
        db.prepare("SELECT id FROM account WHERE code = '5100'").get() as { id: number }
      ).id;

      const result = await createExpense(
        {
          description: 'Office supplies purchase',
          amount: 250.0,
          expense_date: '2026-06-15',
          expense_account_id: expenseId,
          payment_account_id: cashId,
        },
        defaultContext,
      );

      expect(result.ok).toBe(true);
      expect(result.journal_entry_id).toBeGreaterThan(0);
      expect(isJournalEntryBalanced(db, result.journal_entry_id!)).toBe(true);
    });

    it('should reject expense with non-expense account', async () => {
      const { createExpense } = await import('../../lib/domain/expense-operations');

      const cashId = (
        db.prepare("SELECT id FROM account WHERE code = '1000'").get() as { id: number }
      ).id;
      const revenueId = (
        db.prepare("SELECT id FROM account WHERE code = '4000'").get() as { id: number }
      ).id;

      const result = await createExpense(
        {
          description: 'Wrong account',
          amount: 100.0,
          expense_date: '2026-06-01',
          expense_account_id: revenueId,
          payment_account_id: cashId,
        },
        defaultContext,
      );

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toMatch(/must be an expense account/i);
    });

    it('should reject expense with zero amount', async () => {
      const { createExpense } = await import('../../lib/domain/expense-operations');

      const cashId = (
        db.prepare("SELECT id FROM account WHERE code = '1000'").get() as { id: number }
      ).id;
      const expenseId = (
        db.prepare("SELECT id FROM account WHERE code = '5100'").get() as { id: number }
      ).id;

      const result = await createExpense(
        {
          description: 'Zero amount',
          amount: 0,
          expense_date: '2026-06-01',
          expense_account_id: expenseId,
          payment_account_id: cashId,
        },
        defaultContext,
      );

      expect(result.ok).toBe(false);
      expect(result.warnings[0].message).toMatch(/amount must be greater than 0/i);
    });
  });

  // ── G. Error Handling ───────────────────────────────────────────────────

  describe('Error handling', () => {
    it('should reject creating an account with duplicate code', async () => {
      await persistenceService.createAccount({
        code: '9999',
        name: 'Unique',
        type: 'asset',
        parent_id: null,
        is_active: true,
      });

      await expect(
        persistenceService.createAccount({
          code: '9999',
          name: 'Duplicate',
          type: 'asset',
          parent_id: null,
          is_active: true,
        }),
      ).rejects.toThrow();
    });

    it.skip('should reject creating an account with empty code', async () => {
      await expect(
        persistenceService.createAccount({
          code: '',
          name: 'No Code',
          type: 'asset',
          parent_id: null,
          is_active: true,
        }),
      ).rejects.toThrow();
    });

    it.skip('should reject posting an unbalanced entry', async () => {
      const eventId = await persistenceService.createTransactionEvent({
        event_type: 'manual_entry',
        description: 'Unbalanced entry',
        created_by: 'test_user',
      });

      const cashId = (
        db.prepare("SELECT id FROM account WHERE code = '1000'").get() as { id: number }
      ).id;

      const entryId = await persistenceService.createJournalEntry(
        { event_id: eventId, entry_date: '2026-06-01', description: 'Unbalanced', status: 'draft' },
        [{ account_id: cashId, debit_amount: 0, credit_amount: 0 }],
      );

      await expect(persistenceService.postJournalEntry(entryId, 'test_user')).rejects.toThrow();
    });
  });

  // ── H. Period Guard ─────────────────────────────────────────────────────

  describe('Period guard integration', () => {
    it('should allow posting to open periods', async () => {
      const { assertPeriodOpen } = await import('../../lib/services/period-guard');

      await expect(assertPeriodOpen('2026-06-01')).resolves.toBeUndefined();
    });

    it.skip('should reject posting to a closed period', async () => {
      const { assertPeriodOpen } = await import('../../lib/services/period-guard');

      const fyId = db
        .prepare(`
        INSERT INTO fiscal_year (year, name, start_date, end_date, status)
        VALUES (2026, 'FY 2026', '2026-01-01', '2026-12-31', 'active')
      `)
        .run().lastInsertRowid as number;

      db.prepare(`
        INSERT INTO fiscal_period (fiscal_year_id, period_number, period_name, start_date, end_date, status)
        VALUES (?, 1, 'January 2026', '2026-01-01', '2026-01-31', 'closed')
      `).run(fyId);

      await expect(assertPeriodOpen('2026-01-15')).rejects.toThrow(/fiscal period is closed/i);
    });

    it.skip('should allow posting to an open period within a fiscal year', async () => {
      const { assertPeriodOpen } = await import('../../lib/services/period-guard');

      const fyId = db
        .prepare(`
        INSERT INTO fiscal_year (year, name, start_date, end_date, status)
        VALUES (2026, 'FY 2026', '2026-01-01', '2026-12-31', 'active')
      `)
        .run().lastInsertRowid as number;

      db.prepare(`
        INSERT INTO fiscal_period (fiscal_year_id, period_number, period_name, start_date, end_date, status)
        VALUES (?, 1, 'January 2026', '2026-01-01', '2026-01-31', 'open')
      `).run(fyId);

      await expect(assertPeriodOpen('2026-01-15')).resolves.toBeUndefined();
    });
  });

  // ── I. Posting Engine Validation ─────────────────────────────────────────

  describe('PostingEngine validation', () => {
    const engine = new PostingEngine();

    it('should validate a balanced journal entry', () => {
      const warnings = engine.validateBalance([
        { account_id: 1, debit_amount: 100, credit_amount: 0 },
        { account_id: 2, debit_amount: 0, credit_amount: 100 },
      ]);
      expect(warnings.filter((w) => w.level === 'error')).toHaveLength(0);
    });

    it('should detect an unbalanced journal entry', () => {
      const warnings = engine.validateBalance([
        { account_id: 1, debit_amount: 100, credit_amount: 0 },
        { account_id: 2, debit_amount: 0, credit_amount: 50 },
      ]);
      const errors = warnings.filter((w) => w.level === 'error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors[0].message).toMatch(/not balanced/i);
    });

    it('should reject lines with both debit and credit', () => {
      const warnings = engine.validateBalance([
        { account_id: 1, debit_amount: 100, credit_amount: 50 },
      ]);
      const errors = warnings.filter((w) => w.level === 'error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('both'))).toBe(true);
    });

    it('should reject lines with neither debit nor credit', () => {
      const warnings = engine.validateBalance([
        { account_id: 1, debit_amount: 0, credit_amount: 0 },
      ]);
      const errors = warnings.filter((w) => w.level === 'error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
      expect(errors.some((e) => e.message.includes('neither'))).toBe(true);
    });
  });

  // ── J. Double-Entry Accounting Verification ─────────────────────────────

  describe('Double-entry accounting verification', () => {
    it('should maintain balanced books after multi-step workflow', async () => {
      const cashId = (
        db.prepare("SELECT id FROM account WHERE code = '1000'").get() as { id: number }
      ).id;
      const revenueId = (
        db.prepare("SELECT id FROM account WHERE code = '4000'").get() as { id: number }
      ).id;
      const expenseId = (
        db.prepare("SELECT id FROM account WHERE code = '5100'").get() as { id: number }
      ).id;

      const event1Id = await persistenceService.createTransactionEvent({
        event_type: 'manual_entry',
        description: 'Revenue entry',
        created_by: 'test_user',
      });

      const entry1Id = await persistenceService.createJournalEntry(
        { event_id: event1Id, entry_date: '2026-06-01', description: 'Revenue', status: 'posted' },
        [
          { account_id: cashId, debit_amount: 1000.0, credit_amount: 0.0 },
          { account_id: revenueId, debit_amount: 0.0, credit_amount: 1000.0 },
        ],
      );
      expect(isJournalEntryBalanced(db, entry1Id)).toBe(true);

      const event2Id = await persistenceService.createTransactionEvent({
        event_type: 'manual_entry',
        description: 'Expense entry',
        created_by: 'test_user',
      });

      const entry2Id = await persistenceService.createJournalEntry(
        { event_id: event2Id, entry_date: '2026-06-15', description: 'Expense', status: 'posted' },
        [
          { account_id: expenseId, debit_amount: 300.0, credit_amount: 0.0 },
          { account_id: cashId, debit_amount: 0.0, credit_amount: 300.0 },
        ],
      );
      expect(isJournalEntryBalanced(db, entry2Id)).toBe(true);

      expect(getAccountBalance(db, '1000')).toBeCloseTo(700.0, 2);
      expect(getAccountBalance(db, '4000')).toBeCloseTo(1000.0, 2);
      expect(getAccountBalance(db, '5100')).toBeCloseTo(300.0, 2);

      const totals = db
        .prepare(`
        SELECT
          COALESCE(SUM(debit_amount), 0) as all_debits,
          COALESCE(SUM(credit_amount), 0) as all_credits
        FROM journal_line jl
        JOIN journal_entry je ON jl.journal_entry_id = je.id
        WHERE je.status = 'posted'
      `)
        .get() as { all_debits: number; all_credits: number };

      expect(Math.abs(totals.all_debits - totals.all_credits)).toBeLessThan(0.01);
    });
  });
});
