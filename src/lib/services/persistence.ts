import { getDatabase } from './database';
import { getCurrentVersion as getCurrentVersionTauri } from './updater';
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
  Bill,
  BillLine,
  VendorPayment,
  BillAllocation,
  PolicyMode,
  CreditNote,
  CreditNoteLine,
  CreditNoteApplication,
  CreditNoteRefund,
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

  async getUpdateChannel(): Promise<'stable' | 'beta'> {
    const channel = await this.getSetting('update_channel');
    return (channel === 'beta' ? 'beta' : 'stable') as 'stable' | 'beta';
  }

  async setUpdateChannel(channel: 'stable' | 'beta'): Promise<void> {
    await this.setSetting('update_channel', channel);
  }

  async getLastUpdateCheck(): Promise<string | null> {
    return await this.getSetting('last_update_check');
  }

  async setLastUpdateCheck(timestamp: string): Promise<void> {
    await this.setSetting('last_update_check', timestamp);
  }

  async getCurrentVersion(): Promise<string> {
    return await getCurrentVersionTauri();
  }

  // Account operations
  async getAccounts(includeInactive: boolean = false): Promise<Account[]> {
    const db = await getDatabase();
    if (includeInactive) {
      return await db.select<Account[]>(
        'SELECT * FROM account ORDER BY code'
      );
    }
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

  async updateAccount(id: number, account: Partial<Omit<Account, 'id' | 'created_at' | 'updated_at'>>): Promise<void> {
    const db = await getDatabase();
    const fields: string[] = [];
    const values: any[] = [];

    if (account.code !== undefined) {
      fields.push('code = ?');
      values.push(account.code);
    }
    if (account.name !== undefined) {
      fields.push('name = ?');
      values.push(account.name);
    }
    if (account.type !== undefined) {
      fields.push('type = ?');
      values.push(account.type);
    }
    if (account.parent_id !== undefined) {
      fields.push('parent_id = ?');
      values.push(account.parent_id);
    }
    if (account.is_active !== undefined) {
      fields.push('is_active = ?');
      values.push(account.is_active ? 1 : 0);
    }

    if (fields.length > 0) {
      fields.push('updated_at = datetime("now")');
      await db.execute(
        `UPDATE account SET ${fields.join(', ')} WHERE id = ?`,
        [...values, id]
      );
    }
  }

  async hasAccountTransactions(accountId: number): Promise<boolean> {
    const db = await getDatabase();
    const result = await db.select<Array<{ count: number }>>(
      'SELECT COUNT(*) as count FROM journal_line WHERE account_id = ?',
      [accountId]
    );
    return result[0].count > 0;
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

  async getJournalEntries(limit: number = 100): Promise<JournalEntry[]> {
    const db = await getDatabase();
    return await db.select<JournalEntry[]>(
      'SELECT * FROM journal_entry ORDER BY entry_date DESC, id DESC LIMIT ?',
      [limit]
    );
  }

  /**
   * Get journal entries with their lines in a single optimized query.
   * Reduces N+1 query pattern from (1 + N) queries to 2 queries.
   * 
   * @param limit Maximum number of entries to fetch
   * @returns Journal entries with embedded lines array
   */
  async getJournalEntriesWithLines(limit: number = 50): Promise<(JournalEntry & { lines: JournalLine[] })[]> {
    const db = await getDatabase();
    
    // Query 1: Get the entries
    const entries = await db.select<JournalEntry[]>(
      'SELECT * FROM journal_entry ORDER BY entry_date DESC, id DESC LIMIT ?',
      [limit]
    );
    
    if (entries.length === 0) {
      return [];
    }
    
    // Query 2: Get all lines for these entries in one query
    const entryIds = entries.map(e => e.id);
    const placeholders = entryIds.map(() => '?').join(', ');
    
    const allLines = await db.select<JournalLine[]>(
      `SELECT * FROM journal_line 
       WHERE journal_entry_id IN (${placeholders})
       ORDER BY journal_entry_id, id`,
      entryIds
    );
    
    // Group lines by journal_entry_id
    const linesByEntryId = new Map<number, JournalLine[]>();
    for (const line of allLines) {
      const entryId = line.journal_entry_id!;
      if (!linesByEntryId.has(entryId)) {
        linesByEntryId.set(entryId, []);
      }
      linesByEntryId.get(entryId)!.push(line);
    }
    
    // Attach lines to entries
    return entries.map(entry => ({
      ...entry,
      lines: linesByEntryId.get(entry.id!) || []
    }));
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
        
        // For now, we don't check vendor→customer since expenses aren't linked to vendors in the schema
        // This could be enhanced in the future if vendor tracking is added to expenses
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

  /**
   * Get available contact type options for a contact
   * Returns only valid options based on existing transactions
   */
  async getAvailableContactTypes(contactId: number): Promise<Array<'customer' | 'vendor' | 'both'>> {
    const db = await getDatabase();
    
    // Get current contact
    const existingContact = await db.select<Contact[]>(
      'SELECT * FROM contact WHERE id = ?',
      [contactId]
    );
    
    if (existingContact.length === 0) {
      // For new contacts, all options are available
      return ['customer', 'vendor', 'both'];
    }
    
    const currentType = existingContact[0].type;
    
    // Check for existing invoices
    const invoiceCount = await db.select<Array<{ count: number }>>(
      'SELECT COUNT(*) as count FROM invoice WHERE contact_id = ?',
      [contactId]
    );
    const hasInvoices = invoiceCount[0].count > 0;
    
    // Check for existing payments
    const paymentCount = await db.select<Array<{ count: number }>>(
      'SELECT COUNT(*) as count FROM payment WHERE contact_id = ?',
      [contactId]
    );
    const hasPayments = paymentCount[0].count > 0;
    
    const hasCustomerTransactions = hasInvoices || hasPayments;
    
    // Build available options
    const availableTypes: Array<'customer' | 'vendor' | 'both'> = ['both']; // 'both' is always available
    
    if (!hasCustomerTransactions) {
      // No customer transactions, so can change to vendor-only
      availableTypes.push('vendor');
    }
    
    // Can always select customer if they have customer transactions, or no transactions at all
    availableTypes.push('customer');
    
    return availableTypes;
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
        `INSERT INTO invoice_line (invoice_id, line_number, description, quantity, unit_price, amount, is_tax_inclusive, tax_code_id, account_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId,
          line.line_number,
          line.description,
          line.quantity,
          line.unit_price,
          line.amount,
          line.is_tax_inclusive ? 1 : 0,
          line.tax_code_id,
          line.account_id,
        ]
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
        "SELECT * FROM invoice WHERE contact_id = ? AND status IN ("sent", "partial", "overdue") ORDER BY issue_date",
        [contactId]
      );
    }
    return await db.select<Invoice[]>(
      "SELECT * FROM invoice WHERE status IN ("sent", "partial", "overdue") ORDER BY issue_date",
    );
  }

  async getInvoiceById(id: number): Promise<Invoice | null> {
    const db = await getDatabase();
    const results = await db.select<Invoice[]>(
      'SELECT * FROM invoice WHERE id = ?',
      [id]
    );
    return results.length > 0 ? results[0] : null;
  }

  async getInvoiceLines(invoiceId: number): Promise<InvoiceLine[]> {
    const db = await getDatabase();
    const lines = await db.select<Array<InvoiceLine & { is_tax_inclusive?: number }>>(
      'SELECT * FROM invoice_line WHERE invoice_id = ? ORDER BY line_number',
      [invoiceId]
    );
    return lines.map(line => ({
      ...line,
      is_tax_inclusive: Boolean(line.is_tax_inclusive),
    }));
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

  async getPaymentById(id: number): Promise<Payment | null> {
    const db = await getDatabase();
    const results = await db.select<Payment[]>(
      'SELECT * FROM payment WHERE id = ?',
      [id]
    );
    return results.length > 0 ? results[0] : null;
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

  // Bill operations (Accounts Payable)
  async createBill(
    bill: Omit<Bill, 'id' | 'created_at' | 'updated_at'>,
    lines: Omit<BillLine, 'id' | 'bill_id'>[]
  ): Promise<number> {
    const db = await getDatabase();

    const billResult = await db.execute(
      `INSERT INTO bill (bill_number, vendor_id, event_id, bill_date, due_date, status, subtotal, tax_amount, total_amount, paid_amount, reference, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [bill.bill_number, bill.vendor_id, bill.event_id, bill.bill_date, bill.due_date, 
       bill.status, bill.subtotal, bill.tax_amount, bill.total_amount, bill.paid_amount, bill.reference, bill.notes]
    );
    const billId = billResult.lastInsertId ?? 0;

    for (const line of lines) {
      await db.execute(
        `INSERT INTO bill_line (bill_id, line_number, description, quantity, unit_price, amount, account_id, item_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [billId, line.line_number, line.description, line.quantity, line.unit_price, line.amount, line.account_id, line.item_id]
      );
    }

    return billId;
  }

  async getBills(vendorId?: number): Promise<Bill[]> {
    const db = await getDatabase();
    if (vendorId) {
      return await db.select<Bill[]>(
        'SELECT * FROM bill WHERE vendor_id = ? ORDER BY bill_date DESC',
        [vendorId]
      );
    }
    return await db.select<Bill[]>(
      'SELECT * FROM bill ORDER BY bill_date DESC'
    );
  }

  async getOpenBills(vendorId?: number): Promise<Bill[]> {
    const db = await getDatabase();
    if (vendorId) {
      return await db.select<Bill[]>(
        "SELECT * FROM bill WHERE vendor_id = ? AND status IN ("pending", "partial", "overdue") ORDER BY bill_date",
        [vendorId]
      );
    }
    return await db.select<Bill[]>(
      "SELECT * FROM bill WHERE status IN ("pending", "partial", "overdue") ORDER BY bill_date",
    );
  }

  async getBillById(id: number): Promise<Bill | null> {
    const db = await getDatabase();
    const results = await db.select<Bill[]>(
      'SELECT * FROM bill WHERE id = ?',
      [id]
    );
    return results.length > 0 ? results[0] : null;
  }

  async getBillLines(billId: number): Promise<BillLine[]> {
    const db = await getDatabase();
    return await db.select<BillLine[]>(
      'SELECT * FROM bill_line WHERE bill_id = ? ORDER BY line_number',
      [billId]
    );
  }

  // Vendor payment operations
  async createVendorPayment(payment: Omit<VendorPayment, 'id' | 'created_at' | 'updated_at'>): Promise<number> {
    const db = await getDatabase();
    const result = await db.execute(
      `INSERT INTO vendor_payment (payment_number, vendor_id, event_id, payment_date, amount, payment_method, check_number, reference, notes, allocated_amount, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [payment.payment_number, payment.vendor_id, payment.event_id, payment.payment_date, payment.amount, 
       payment.payment_method, payment.check_number, payment.reference, payment.notes, payment.allocated_amount, payment.status]
    );
    return result.lastInsertId ?? 0;
  }

  async getVendorPayments(vendorId?: number): Promise<VendorPayment[]> {
    const db = await getDatabase();
    if (vendorId) {
      return await db.select<VendorPayment[]>(
        'SELECT * FROM vendor_payment WHERE vendor_id = ? ORDER BY payment_date DESC',
        [vendorId]
      );
    }
    return await db.select<VendorPayment[]>(
      'SELECT * FROM vendor_payment ORDER BY payment_date DESC'
    );
  }

  async getVendorPaymentById(id: number): Promise<VendorPayment | null> {
    const db = await getDatabase();
    const results = await db.select<VendorPayment[]>(
      'SELECT * FROM vendor_payment WHERE id = ?',
      [id]
    );
    return results.length > 0 ? results[0] : null;
  }

  // Bill allocation operations
  async createBillAllocation(allocation: Omit<BillAllocation, 'id' | 'created_at'>): Promise<number> {
    const db = await getDatabase();
    const result = await db.execute(
      `INSERT INTO bill_allocation (vendor_payment_id, bill_id, amount, allocation_date, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [allocation.vendor_payment_id, allocation.bill_id, allocation.amount, allocation.allocation_date, allocation.notes]
    );
    return result.lastInsertId ?? 0;
  }

  async getBillAllocations(vendorPaymentId?: number, billId?: number): Promise<BillAllocation[]> {
    const db = await getDatabase();
    if (vendorPaymentId) {
      return await db.select<BillAllocation[]>(
        'SELECT * FROM bill_allocation WHERE vendor_payment_id = ?',
        [vendorPaymentId]
      );
    }
    if (billId) {
      return await db.select<BillAllocation[]>(
        'SELECT * FROM bill_allocation WHERE bill_id = ?',
        [billId]
      );
    }
    return await db.select<BillAllocation[]>('SELECT * FROM bill_allocation');
  }

  // Credit Note operations
  async createCreditNote(
    creditNote: Omit<CreditNote, 'id' | 'created_at' | 'updated_at'>,
    lines: Omit<CreditNoteLine, 'id' | 'credit_note_id'>[]
  ): Promise<number> {
    const db = await getDatabase();

    const creditNoteResult = await db.execute(
      `INSERT INTO credit_note (credit_note_number, contact_id, event_id, issue_date, status, subtotal, tax_amount, total_amount, applied_amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [creditNote.credit_note_number, creditNote.contact_id, creditNote.event_id, creditNote.issue_date,
       creditNote.status, creditNote.subtotal, creditNote.tax_amount, creditNote.total_amount,
       creditNote.applied_amount, creditNote.notes]
    );
    const creditNoteId = creditNoteResult.lastInsertId ?? 0;

    for (const line of lines) {
      await db.execute(
        `INSERT INTO credit_note_line (credit_note_id, line_number, description, quantity, unit_price, amount, is_tax_inclusive, tax_code_id, account_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          creditNoteId,
          line.line_number,
          line.description,
          line.quantity,
          line.unit_price,
          line.amount,
          line.is_tax_inclusive ? 1 : 0,
          line.tax_code_id,
          line.account_id,
        ]
      );
    }

    return creditNoteId;
  }

  async getCreditNotes(contactId?: number): Promise<CreditNote[]> {
    const db = await getDatabase();
    if (contactId) {
      return await db.select<CreditNote[]>(
        'SELECT * FROM credit_note WHERE contact_id = ? ORDER BY issue_date DESC',
        [contactId]
      );
    }
    return await db.select<CreditNote[]>(
      'SELECT * FROM credit_note ORDER BY issue_date DESC'
    );
  }

  async getCreditNoteById(id: number): Promise<CreditNote | null> {
    const db = await getDatabase();
    const results = await db.select<CreditNote[]>(
      'SELECT * FROM credit_note WHERE id = ?',
      [id]
    );
    return results.length > 0 ? results[0] : null;
  }

  async getCreditNoteLines(creditNoteId: number): Promise<CreditNoteLine[]> {
    const db = await getDatabase();
    return await db.select<CreditNoteLine[]>(
      'SELECT * FROM credit_note_line WHERE credit_note_id = ? ORDER BY line_number',
      [creditNoteId]
    );
  }

  async getCreditNoteApplications(creditNoteId?: number, invoiceId?: number): Promise<CreditNoteApplication[]> {
    const db = await getDatabase();
    if (creditNoteId) {
      return await db.select<CreditNoteApplication[]>(
        'SELECT * FROM credit_note_application WHERE credit_note_id = ? ORDER BY application_date DESC',
        [creditNoteId]
      );
    }
    if (invoiceId) {
      return await db.select<CreditNoteApplication[]>(
        'SELECT * FROM credit_note_application WHERE invoice_id = ? ORDER BY application_date DESC',
        [invoiceId]
      );
    }
    return await db.select<CreditNoteApplication[]>('SELECT * FROM credit_note_application ORDER BY application_date DESC');
  }
}

export const persistenceService = new PersistenceService();
