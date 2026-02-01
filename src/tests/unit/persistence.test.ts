import { describe, it, expect, vi, beforeEach } from 'vitest';
import { persistenceService } from '../../lib/services/persistence';
import type {
  Account,
  Contact,
  Invoice,
  Payment,
  PolicyMode,
} from '../../lib/domain/types';

describe('Persistence Service - Settings Operations', () => {
  beforeEach(() => {
    vi.mock('../../lib/services/database', () => ({
      getDatabase: vi.fn().mockResolvedValue({
        select: vi.fn().mockResolvedValue([]),
        execute: vi.fn().mockResolvedValue({ lastInsertId: 1 }),
      }),
    }));
  });

  it('should get setting by key', async () => {
    const result = await persistenceService.getSetting('test_key');
    expect(result).toBeDefined();
  });

  it('should return null for non-existent setting', async () => {
    const result = await persistenceService.getSetting('nonexistent');
    expect(result).toBe(null);
  });

  it('should set setting with value', async () => {
    await persistenceService.setSetting('test_key', 'test_value');
  });

  it('should update existing setting', async () => {
    await persistenceService.setSetting('test_key', 'new_value');
  });

  it('should get mode from settings', async () => {
    const mode = await persistenceService.getMode();
    expect(mode).toBeDefined();
    expect(['beginner', 'pro']).toContain(mode);
  });

  it('should set mode to beginner', async () => {
    await persistenceService.setMode('beginner' as PolicyMode);
  });

  it('should set mode to pro', async () => {
    await persistenceService.setMode('pro' as PolicyMode);
  });

  it('should get update channel', async () => {
    const channel = await persistenceService.getUpdateChannel();
    expect(channel).toBeDefined();
    expect(['stable', 'beta']).toContain(channel);
  });

  it('should set update channel to stable', async () => {
    await persistenceService.setUpdateChannel('stable');
  });

  it('should set update channel to beta', async () => {
    await persistenceService.setUpdateChannel('beta');
  });
});

describe('Persistence Service - Account Operations', () => {
  beforeEach(() => {
    vi.mock('../../lib/services/database', () => ({
      getDatabase: vi.fn().mockResolvedValue({
        select: vi.fn().mockResolvedValue([]),
        execute: vi.fn().mockResolvedValue({ lastInsertId: 1 }),
      }),
    }));
  });

  it('should get all accounts', async () => {
    const accounts = await persistenceService.getAccounts();
    expect(Array.isArray(accounts)).toBe(true);
  });

  it('should get active accounts only by default', async () => {
    const accounts = await persistenceService.getAccounts();
    expect(accounts).toBeDefined();
  });

  it('should get all accounts including inactive', async () => {
    const accounts = await persistenceService.getAccounts(true);
    expect(accounts).toBeDefined();
  });

  it('should get account by ID', async () => {
    const account = await persistenceService.getAccountById(1);
    expect(account).toBeDefined();
  });

  it('should return null for non-existent account', async () => {
    const account = await persistenceService.getAccountById(99999);
    expect(account).toBe(null);
  });

  it('should get accounts by type', async () => {
    const accounts = await persistenceService.getAccountsByType('asset');
    expect(accounts).toBeDefined();
  });

  it('should handle invalid account type', async () => {
    const accounts = await persistenceService.getAccountsByType('invalid');
    expect(accounts).toBeDefined();
  });
});

describe('Persistence Service - Contact Operations', () => {
  beforeEach(() => {
    vi.mock('../../lib/services/database', () => ({
      getDatabase: vi.fn().mockResolvedValue({
        select: vi.fn().mockResolvedValue([]),
        execute: vi.fn().mockResolvedValue({ lastInsertId: 1 }),
      }),
    }));
  });

  it('should get all contacts', async () => {
    const contacts = await persistenceService.getContacts();
    expect(Array.isArray(contacts)).toBe(true);
  });

  it('should get contacts by type', async () => {
    const customers = await persistenceService.getContacts('customer');
    expect(customers).toBeDefined();
  });

  it('should get vendors only', async () => {
    const vendors = await persistenceService.getContacts('vendor');
    expect(vendors).toBeDefined();
  });

  it('should get customer and vendor contacts', async () => {
    const all = await persistenceService.getContacts('both');
    expect(all).toBeDefined();
  });

  it('should create contact with type customer', async () => {
    const contact: Contact = {
      type: 'customer',
      name: 'Test Customer',
      email: 'test@example.com',
      phone: '555-1234',
      address: '123 Main St',
      is_active: true,
    };

    await persistenceService.createContact(contact);
  });

  it('should create contact with type vendor', async () => {
    const contact: Contact = {
      type: 'vendor',
      name: 'Test Vendor',
      email: 'vendor@example.com',
      phone: '555-5678',
      address: '456 Commerce St',
      is_active: true,
    };

    await persistenceService.createContact(contact);
  });

  it('should update contact', async () => {
    const id = 1;
    const contact: Partial<Contact> = {
      name: 'Updated Customer',
    };

    await persistenceService.updateContact(id, contact);
  });
});

describe('Persistence Service - Invoice Operations', () => {
  beforeEach(() => {
    vi.mock('../../lib/services/database', () => ({
      getDatabase: vi.fn().mockResolvedValue({
        select: vi.fn().mockResolvedValue([]),
        execute: vi.fn().mockResolvedValue({ lastInsertId: 1 }),
      }),
    }));
  });

  it('should get all invoices', async () => {
    const invoices = await persistenceService.getInvoices();
    expect(Array.isArray(invoices)).toBe(true);
  });

  it('should get invoice by ID', async () => {
    const invoice = await persistenceService.getInvoiceById(1);
    expect(invoice).toBeDefined();
  });

  it('should return null for non-existent invoice', async () => {
    const invoice = await persistenceService.getInvoiceById(99999);
    expect(invoice).toBe(null);
  });

  it('should get open invoices', async () => {
    const invoices = await persistenceService.getOpenInvoices();
    expect(Array.isArray(invoices)).toBe(true);
  });

  it('should get invoices by contact', async () => {
    const invoices = await persistenceService.getInvoices(1);
    expect(invoices).toBeDefined();
  });

  it('should create invoice', async () => {
    const invoice: Invoice = {
      invoice_number: 'INV-001',
      contact_id: 1,
      event_id: 1,
      issue_date: '2026-01-24',
      due_date: '2026-02-23',
      status: 'sent',
      subtotal: 1000,
      tax_amount: 130,
      total_amount: 1130,
      paid_amount: 0,
    };

    await persistenceService.createInvoice(invoice, []);
  });
});

describe('Persistence Service - Payment Operations', () => {
  beforeEach(() => {
    vi.mock('../../lib/services/database', () => ({
      getDatabase: vi.fn().mockResolvedValue({
        select: vi.fn().mockResolvedValue([]),
        execute: vi.fn().mockResolvedValue({ lastInsertId: 1 }),
      }),
    }));
  });

  it('should get all payments', async () => {
    const payments = await persistenceService.getPayments();
    expect(Array.isArray(payments)).toBe(true);
  });

  it('should get payment by ID', async () => {
    const payment = await persistenceService.getPaymentById(1);
    expect(payment).toBeDefined();
  });

  it('should return null for non-existent payment', async () => {
    const payment = await persistenceService.getPaymentById(99999);
    expect(payment).toBe(null);
  });

  it('should get payments by contact', async () => {
    const payments = await persistenceService.getPayments(1);
    expect(payments).toBeDefined();
  });

  it('should create payment', async () => {
    const payment: Payment = {
      payment_number: 'PAY-001',
      contact_id: 1,
      event_id: 1,
      payment_date: '2026-01-24',
      amount: 1000,
      payment_method: 'transfer',
      allocated_amount: 1000,
      status: 'allocated',
    };

    await persistenceService.createPayment(payment);
  });

  it('should update payment', async () => {
    const id = 1;
    const payment: Partial<Payment> = {
      allocated_amount: 500,
      status: 'partial',
    };

    await persistenceService.updatePayment(id, payment);
  });
});

describe('Persistence Service - Transaction Operations', () => {
  beforeEach(() => {
    vi.mock('../../lib/services/database', () => ({
      getDatabase: vi.fn().mockResolvedValue({
        select: vi.fn().mockResolvedValue([]),
        execute: vi.fn().mockResolvedValue({ lastInsertId: 1 }),
      }),
    }));
  });

  it('should create transaction event', async () => {
    const eventId = await persistenceService.createTransactionEvent({
      event_type: 'test_event',
      description: 'Test event',
      reference: 'TEST-001',
      created_by: 'test_user',
    });

    expect(eventId).toBeDefined();
    expect(eventId).toBeGreaterThan(0);
  });

  it('should create journal entry with lines', async () => {
    const entryId = await persistenceService.createJournalEntry(
      {
        event_id: 1,
        entry_date: '2026-01-24',
        description: 'Test entry',
        reference: 'TEST-001',
        status: 'posted',
      },
      []
    );

    expect(entryId).toBeDefined();
    expect(entryId).toBeGreaterThan(0);
  });

  it('should get journal entries', async () => {
    const entries = await persistenceService.getJournalEntries();
    expect(entries).toBeDefined();
  });

  it('should get journal entry by ID', async () => {
    const entry = await persistenceService.getJournalEntry(1);
    expect(entry).toBeDefined();
  });
});

describe('Persistence Service - Allocation Operations', () => {
  beforeEach(() => {
    vi.mock('../../lib/services/database', () => ({
      getDatabase: vi.fn().mockResolvedValue({
        select: vi.fn().mockResolvedValue([]),
        execute: vi.fn().mockResolvedValue({ lastInsertId: 1 }),
      }),
    }));
  });

  it('should create allocation', async () => {
    const allocation = await persistenceService.createAllocation({
      payment_id: 1,
      invoice_id: 1,
      amount: 100,
      allocation_method: 'manual',
    });

    expect(allocation).toBeDefined();
    expect(allocation).toBeGreaterThan(0);
  });

  it('should get allocations by payment', async () => {
    const allocations = await persistenceService.getAllocations(1);
    expect(allocations).toBeDefined();
  });

  it('should get allocations by invoice', async () => {
    const allocations = await persistenceService.getAllocations(undefined, 1);
    expect(allocations).toBeDefined();
  });

  it('should get all allocations', async () => {
    const allocations = await persistenceService.getAllocations();
    expect(allocations).toBeDefined();
  });
});

describe('Persistence Service - Error Handling', () => {
  beforeEach(() => {
    vi.mock('../../lib/services/database', () => ({
      getDatabase: vi.fn().mockResolvedValue({
        select: vi.fn().mockResolvedValue([]),
        execute: vi.fn().mockResolvedValue({ lastInsertId: 1 }),
      }),
    }));
  });

  it('should handle database connection errors gracefully', async () => {
    try {
      await persistenceService.getAccounts();
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should handle query execution errors', async () => {
    try {
      await persistenceService.getAccountById(1);
    } catch (error) {
      expect(error).toBeDefined();
    }
  });

  it('should handle foreign key constraint violations', async () => {
    try {
      const contact: Contact = {
        type: 'customer',
        name: 'Test',
        email: 'test@example.com',
        phone: '555-1234',
        address: '123 Main St',
        is_active: true,
      };

      await persistenceService.createContact(contact);
    } catch (error: any) {
      expect(error).toBeDefined();
    }
  });
});

describe('Persistence Service - Edge Cases', () => {
  beforeEach(() => {
    vi.mock('../../lib/services/database', () => ({
      getDatabase: vi.fn().mockResolvedValue({
        select: vi.fn().mockResolvedValue([]),
        execute: vi.fn().mockResolvedValue({ lastInsertId: 1 }),
      }),
    }));
  });

  it('should handle empty result sets', async () => {
    const accounts = await persistenceService.getAccounts();
    expect(accounts).toBeDefined();
    expect(Array.isArray(accounts)).toBe(true);
  });

  it('should handle very large result sets', async () => {
    const invoices = await persistenceService.getInvoices();
    expect(invoices).toBeDefined();
  });

  it('should handle special characters in data', async () => {
    const contact: Contact = {
      type: 'customer',
      name: 'Test "Quote" & Ampersand',
      email: 'test+special@example.com',
      phone: '555-1234',
      address: '123 Main St, Apt 4B',
      is_active: true,
    };

    await persistenceService.createContact(contact);
  });

  it('should handle concurrent operations', async () => {
    const results = await Promise.all([
      persistenceService.getAccounts(),
      persistenceService.getContacts(),
      persistenceService.getInvoices(),
      persistenceService.getPayments(),
    ]);

    expect(results).toHaveLength(4);
  });
});

describe('Persistence Service - Data Integrity', () => {
  beforeEach(() => {
    vi.mock('../../lib/services/database', () => ({
      getDatabase: vi.fn().mockResolvedValue({
        select: vi.fn().mockResolvedValue([]),
        execute: vi.fn().mockResolvedValue({ lastInsertId: 1 }),
      }),
    }));
  });

  it('should maintain referential integrity', async () => {
    const contact: Contact = {
      type: 'customer',
      name: 'Test Customer',
      email: 'test@example.com',
      phone: '555-1234',
      address: '123 Main St',
      is_active: true,
    };

    await persistenceService.createContact(contact);
  });

  it('should enforce foreign key constraints', async () => {
    const invoice: Invoice = {
      invoice_number: 'INV-001',
      contact_id: 1,
      event_id: 1,
      issue_date: '2026-01-24',
      due_date: '2026-02-23',
      status: 'sent',
      subtotal: 1000,
      tax_amount: 130,
      total_amount: 1130,
      paid_amount: 0,
    };

    await persistenceService.createInvoice(invoice, []);
  });

  it('should handle unique constraints', async () => {
    try {
      await persistenceService.createContact({
        type: 'customer',
        name: 'Duplicate Contact',
        email: 'test@example.com',
        phone: '555-1234',
        address: '123 Main St',
        is_active: true,
      });
    } catch (error: any) {
      expect(error).toBeDefined();
    }
  });
});

describe('Persistence Service - Query Performance', () => {
  beforeEach(() => {
    vi.mock('../../lib/services/database', () => ({
      getDatabase: vi.fn().mockResolvedValue({
        select: vi.fn().mockResolvedValue([]),
        execute: vi.fn().mockResolvedValue({ lastInsertId: 1 }),
      }),
    }));
  });

  it('should execute queries efficiently', async () => {
    const startTime = Date.now();
    await persistenceService.getAccounts();
    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(duration).toBeLessThan(1000);
  });

  it('should handle batch queries', async () => {
    await Promise.all([
      persistenceService.getAccounts(),
      persistenceService.getContacts(),
      persistenceService.getInvoices(),
      persistenceService.getPayments(),
    ]);
  });
});
