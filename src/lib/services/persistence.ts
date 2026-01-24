import { getDatabase } from './database';
import type {
  Account,
  JournalEntry,
  JournalLine,
  TransactionEvent,
  Contact,
  Invoice,
  InvoiceLine,
  Payment,
  Allocation,
  PolicyMode
} from '../domain/types';

/**
 * Persistence service - handles all database operations
 * High-level API for domain operations
 */
export class PersistenceService {
  // Settings operations
  async getSetting(key: string): Promise<string | null> {
    const db = await getDatabase();
    const result = await db.select<Array<{ value: string }>>(
      'SELECT value FROM settings WHERE key = ?',
      [key]
    );
    return result.length > 0 ? result[0].value : null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime("now"))',
      [key, value]
    );
  }

  async getMode(): Promise<PolicyMode> {
    const mode = await this.getSetting('mode');
    return (mode as PolicyMode) || 'beginner';
  }

  async setMode(mode: PolicyMode): Promise<void> {
    await this.setSetting('mode', mode);
  }

  // Account operations
  async getAccounts(): Promise<Account[]> {
    const db = await getDatabase();
    return await db.select<Account[]>(
      'SELECT * FROM account WHERE is_active = 1 ORDER BY code'
    );
  }

  async getAccountById(id: number): Promise<Account | null> {
    const db = await getDatabase();
    const results = await db.select<Account[]>(
      'SELECT * FROM account WHERE id = ?',
      [id]
    );
    return results.length > 0 ? results[0] : null;
  }

  async getAccountsByType(type: string): Promise<Account[]> {
    const db = await getDatabase();
    return await db.select<Account[]>(
      'SELECT * FROM account WHERE type = ? AND is_active = 1 ORDER BY code',
      [type]
    );
  }

  async createAccount(account: Omit<Account, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const db = await getDatabase();
    const result = await db.execute(
      `INSERT INTO account (code, name, type, parent_id, is_active) 
       VALUES (?, ?, ?, ?, ?)`,
      [account.code, account.name, account.type, account.parent_id, account.is_active ? 1 : 0]
    );
    return result.lastInsertId ?? 0;
  }

  // Transaction event operations
  async createTransactionEvent(event: Omit<TransactionEvent, 'id' | 'created_at'>): Promise<number> {
    const db = await getDatabase();
    const result = await db.execute(
      `INSERT INTO transaction_event (event_type, description, reference, created_by, metadata)
       VALUES (?, ?, ?, ?, ?)`,
      [event.event_type, event.description, event.reference, event.created_by, event.metadata]
    );
    return result.lastInsertId ?? 0;
  }

  // Journal entry operations
  async createJournalEntry(
    entry: Omit<JournalEntry, 'id' | 'created_at' | 'updated_at'>,
    lines: Omit<JournalLine, 'id' | 'journal_entry_id' | 'created_at'>[]
  ): Promise<number> {
    const db = await getDatabase();

    // Insert journal entry
    const entryResult = await db.execute(
      `INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
       VALUES (?, ?, ?, ?, ?)`,
      [entry.event_id, entry.entry_date, entry.description, entry.reference, entry.status]
    );
    const journalEntryId = entryResult.lastInsertId ?? 0;

    // Insert journal lines
    for (const line of lines) {
      await db.execute(
        `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
         VALUES (?, ?, ?, ?, ?)`,
        [journalEntryId, line.account_id, line.debit_amount, line.credit_amount, line.description]
      );
    }

    return journalEntryId;
  }

  async postJournalEntry(id: number, postedBy: string): Promise<void> {
    const db = await getDatabase();
    await db.execute(
      `UPDATE journal_entry 
       SET status = 'posted', posted_at = datetime('now'), posted_by = ?
       WHERE id = ?`,
      [postedBy, id]
    );
  }

  async getJournalEntry(id: number): Promise<JournalEntry | null> {
    const db = await getDatabase();
    const results = await db.select<JournalEntry[]>(
      'SELECT * FROM journal_entry WHERE id = ?',
      [id]
    );
    return results.length > 0 ? results[0] : null;
  }

  async getJournalLines(journalEntryId: number): Promise<JournalLine[]> {
    const db = await getDatabase();
    return await db.select<JournalLine[]>(
      'SELECT * FROM journal_line WHERE journal_entry_id = ?',
      [journalEntryId]
    );
  }

  // Contact operations
  async getContacts(type?: 'customer' | 'vendor' | 'both'): Promise<Contact[]> {
    const db = await getDatabase();
    if (type) {
      return await db.select<Contact[]>(
        'SELECT * FROM contact WHERE type IN (?, "both") AND is_active = 1 ORDER BY name',
        [type]
      );
    }
    return await db.select<Contact[]>(
      'SELECT * FROM contact WHERE is_active = 1 ORDER BY name'
    );
  }

  async createContact(contact: Omit<Contact, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const db = await getDatabase();
    const result = await db.execute(
      `INSERT INTO contact (type, name, email, phone, address, tax_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [contact.type, contact.name, contact.email, contact.phone, contact.address, contact.tax_id, contact.is_active ? 1 : 0]
    );
    return result.lastInsertId ?? 0;
  }

  // Invoice operations
  async createInvoice(
    invoice: Omit<Invoice, 'id' | 'created_at' | 'updated_at'>,
    lines: Omit<InvoiceLine, 'id' | 'invoice_id'>[]
  ): Promise<number> {
    const db = await getDatabase();

    const invoiceResult = await db.execute(
      `INSERT INTO invoice (invoice_number, contact_id, event_id, issue_date, due_date, status, subtotal, tax_amount, total_amount, paid_amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoice.invoice_number, invoice.contact_id, invoice.event_id, invoice.issue_date, invoice.due_date, 
       invoice.status, invoice.subtotal, invoice.tax_amount, invoice.total_amount, invoice.paid_amount, invoice.notes]
    );
    const invoiceId = invoiceResult.lastInsertId ?? 0;

    for (const line of lines) {
      await db.execute(
        `INSERT INTO invoice_line (invoice_id, line_number, description, quantity, unit_price, amount, tax_code_id, account_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [invoiceId, line.line_number, line.description, line.quantity, line.unit_price, line.amount, line.tax_code_id, line.account_id]
      );
    }

    return invoiceId;
  }

  async getInvoices(contactId?: number): Promise<Invoice[]> {
    const db = await getDatabase();
    if (contactId) {
      return await db.select<Invoice[]>(
        'SELECT * FROM invoice WHERE contact_id = ? ORDER BY issue_date DESC',
        [contactId]
      );
    }
    return await db.select<Invoice[]>(
      'SELECT * FROM invoice ORDER BY issue_date DESC'
    );
  }

  async getOpenInvoices(contactId?: number): Promise<Invoice[]> {
    const db = await getDatabase();
    if (contactId) {
      return await db.select<Invoice[]>(
        'SELECT * FROM invoice WHERE contact_id = ? AND status IN ("sent", "partial", "overdue") ORDER BY issue_date',
        [contactId]
      );
    }
    return await db.select<Invoice[]>(
      'SELECT * FROM invoice WHERE status IN ("sent", "partial", "overdue") ORDER BY issue_date'
    );
  }

  // Payment operations
  async createPayment(payment: Omit<Payment, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const db = await getDatabase();
    const result = await db.execute(
      `INSERT INTO payment (payment_number, contact_id, event_id, payment_date, amount, payment_method, reference, notes, allocated_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [payment.payment_number, payment.contact_id, payment.event_id, payment.payment_date, payment.amount, 
       payment.payment_method, payment.reference, payment.notes, payment.allocated_amount, payment.status]
    );
    return result.lastInsertId ?? 0;
  }

  async getPayments(contactId?: number): Promise<Payment[]> {
    const db = await getDatabase();
    if (contactId) {
      return await db.select<Payment[]>(
        'SELECT * FROM payment WHERE contact_id = ? ORDER BY payment_date DESC',
        [contactId]
      );
    }
    return await db.select<Payment[]>(
      'SELECT * FROM payment ORDER BY payment_date DESC'
    );
  }

  // Allocation operations
  async createAllocation(allocation: Omit<Allocation, 'id' | 'created_at'>): Promise<number> {
    const db = await getDatabase();
    const result = await db.execute(
      `INSERT INTO allocation (payment_id, invoice_id, amount, allocation_method, confidence_score, explanation)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [allocation.payment_id, allocation.invoice_id, allocation.amount, allocation.allocation_method, 
       allocation.confidence_score, allocation.explanation]
    );
    return result.lastInsertId ?? 0;
  }

  async getAllocations(paymentId?: number, invoiceId?: number): Promise<Allocation[]> {
    const db = await getDatabase();
    if (paymentId) {
      return await db.select<Allocation[]>(
        'SELECT * FROM allocation WHERE payment_id = ?',
        [paymentId]
      );
    }
    if (invoiceId) {
      return await db.select<Allocation[]>(
        'SELECT * FROM allocation WHERE invoice_id = ?',
        [invoiceId]
      );
    }
    return await db.select<Allocation[]>('SELECT * FROM allocation');
  }
}

export const persistenceService = new PersistenceService();
