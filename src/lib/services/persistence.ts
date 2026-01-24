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

    // IMPORTANT: Insert journal entry as 'draft' first
    // We cannot add lines to a posted entry due to the prevent_modify_posted_lines_insert trigger
    const entryResult = await db.execute(
      `INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
       VALUES (?, ?, ?, ?, ?)`,
      [entry.event_id, entry.entry_date, entry.description, entry.reference, 'draft']
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

    // Now update to posted status if requested
    // This will trigger the balance validation
    if (entry.status === 'posted') {
      await db.execute(
        `UPDATE journal_entry SET status = 'posted', posted_at = datetime('now'), posted_by = 'system' WHERE id = ?`,
        [journalEntryId]
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

  async updateContact(id: number, contact: Partial<Omit<Contact, 'id' | 'created_at' | 'updated_at'>>): Promise<void> {
    const db = await getDatabase();
    
    // Validate contact type changes
    if (contact.type !== undefined) {
      const existingContact = await db.select<Contact[]>(
        'SELECT * FROM contact WHERE id = ?',
        [id]
      );
      
      if (existingContact.length === 0) {
        throw new Error('Contact not found');
      }
      
      const currentType = existingContact[0].type;
      const newType = contact.type;
      
      // Always allow changing TO 'both'
      if (newType !== 'both' && currentType !== newType) {
        // Check if we're removing 'customer' capability
        if ((currentType === 'customer' || currentType === 'both') && newType === 'vendor') {
          // Check for existing invoices
          const invoiceCount = await db.select<Array<{ count: number }>>(
            'SELECT COUNT(*) as count FROM invoice WHERE contact_id = ?',
            [id]
          );
          if (invoiceCount[0].count > 0) {
            throw new Error('Cannot change to vendor-only: contact has existing invoices. Change to "Both" instead.');
          }
          
          // Check for existing payments
          const paymentCount = await db.select<Array<{ count: number }>>(
            'SELECT COUNT(*) as count FROM payment WHERE contact_id = ?',
            [id]
          );
          if (paymentCount[0].count > 0) {
            throw new Error('Cannot change to vendor-only: contact has existing payments. Change to "Both" instead.');
          }
        }
        
        // Check if we're removing 'vendor' capability
        if ((currentType === 'vendor' || currentType === 'both') && newType === 'customer') {
          // Check for existing expenses (vendor references in transaction events)
          const expenseCount = await db.select<Array<{ count: number }>>(
            `SELECT COUNT(*) as count 
             FROM transaction_event 
             WHERE event_type = 'expense_recorded' 
             AND json_extract(notes, '$.vendor_id') = ?`,
            [id.toString()]
          );
          if (expenseCount[0].count > 0) {
            throw new Error('Cannot change to customer-only: contact has existing expenses. Change to "Both" instead.');
          }
        }
      }
    }
    
    const fields: string[] = [];
    const values: any[] = [];

    if (contact.type !== undefined) {
      fields.push('type = ?');
      values.push(contact.type);
    }
    if (contact.name !== undefined) {
      fields.push('name = ?');
      values.push(contact.name);
    }
    if (contact.email !== undefined) {
      fields.push('email = ?');
      values.push(contact.email);
    }
    if (contact.phone !== undefined) {
      fields.push('phone = ?');
      values.push(contact.phone);
    }
    if (contact.address !== undefined) {
      fields.push('address = ?');
      values.push(contact.address);
    }
    if (contact.tax_id !== undefined) {
      fields.push('tax_id = ?');
      values.push(contact.tax_id);
    }
    if (contact.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(contact.is_active ? 1 : 0);
    }

    if (fields.length > 0) {
      fields.push('updated_at = datetime("now")');
      await db.execute(
        `UPDATE contact SET ${fields.join(', ')} WHERE id = ?`,
        [...values, id]
      );
    }
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

  async updatePayment(id: number, payment: Partial<Omit<Payment, 'id' | 'created_at' | 'updated_at'>>): Promise<void> {
    const db = await getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    if (payment.payment_number !== undefined) {
      fields.push('payment_number = ?');
      values.push(payment.payment_number);
    }
    if (payment.contact_id !== undefined) {
      fields.push('contact_id = ?');
      values.push(payment.contact_id);
    }
    if (payment.event_id !== undefined) {
      fields.push('event_id = ?');
      values.push(payment.event_id);
    }
    if (payment.payment_date !== undefined) {
      fields.push('payment_date = ?');
      values.push(payment.payment_date);
    }
    if (payment.amount !== undefined) {
      fields.push('amount = ?');
      values.push(payment.amount);
    }
    if (payment.payment_method !== undefined) {
      fields.push('payment_method = ?');
      values.push(payment.payment_method);
    }
    if (payment.reference !== undefined) {
      fields.push('reference = ?');
      values.push(payment.reference);
    }
    if (payment.notes !== undefined) {
      fields.push('notes = ?');
      values.push(payment.notes);
    }
    if (payment.allocated_amount !== undefined) {
      fields.push('allocated_amount = ?');
      values.push(payment.allocated_amount);
    }
    if (payment.status !== undefined) {
      fields.push('status = ?');
      values.push(payment.status);
    }

    if (fields.length > 0) {
      fields.push('updated_at = datetime("now")');
      await db.execute(
        `UPDATE payment SET ${fields.join(', ')} WHERE id = ?`,
        [...values, id]
      );
    }
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
