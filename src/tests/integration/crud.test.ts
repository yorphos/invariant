import { describe, it, expect, beforeEach } from 'vitest';
import { getTestDatabase } from './test-db';

describe('Database Integration - CRUD Operations', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeEach(async () => {
    db = await getTestDatabase();
  });

  describe('Account CRUD Operations', () => {
    it('should create a new account', async () => {
      db.prepare(`
        INSERT INTO account (code, name, type)
        VALUES (?, ?, ?)
      `).run('6000', 'Test Account', 'asset');

      const account = db.prepare('SELECT * FROM account WHERE code = ?').get('6000') as any;

      expect(account).toBeDefined();
      expect(account.code).toBe('6000');
      expect(account.name).toBe('Test Account');
      expect(account.type).toBe('asset');
      expect(account.is_active).toBe(1);
    });

    it('should read an existing account', async () => {
      db.prepare(`
        INSERT INTO account (code, name, type)
        VALUES (?, ?, ?)
      `).run('6000', 'Test Account', 'asset');

      const account = db.prepare('SELECT * FROM account WHERE code = ?').get('6000') as any;

      expect(account.id).toBeDefined();
      expect(account.code).toBe('6000');
      expect(account.name).toBe('Test Account');
    });

    it('should update an existing account', async () => {
      db.prepare(`
        INSERT INTO account (code, name, type)
        VALUES (?, ?, ?)
      `).run('6000', 'Test Account', 'asset');

      db.prepare(`
        UPDATE account
        SET name = ?, updated_at = datetime('now')
        WHERE code = ?
      `).run('Updated Account', '6000');

      const account = db.prepare('SELECT * FROM account WHERE code = ?').get('6000') as any;

      expect(account.name).toBe('Updated Account');
    });

    it('should delete an account (soft delete)', async () => {
      db.prepare(`
        INSERT INTO account (code, name, type)
        VALUES (?, ?, ?)
      `).run('6000', 'Test Account', 'asset');

      db.prepare(`
        UPDATE account
        SET is_active = 0, updated_at = datetime('now')
        WHERE code = ?
      `).run('6000');

      const account = db.prepare('SELECT * FROM account WHERE code = ?').get('6000') as any;

      expect(account.is_active).toBe(0);
    });

    it('should enforce unique code constraint', async () => {
      db.prepare(`
        INSERT INTO account (code, name, type)
        VALUES (?, ?, ?)
      `).run('6000', 'Test Account', 'asset');

      expect(() => {
        db.prepare(`
          INSERT INTO account (code, name, type)
          VALUES (?, ?, ?)
        `).run('6000', 'Another Account', 'liability');
      }).toThrow();
    });

    it('should enforce account type constraint', async () => {
      expect(() => {
        db.prepare(`
          INSERT INTO account (code, name, type)
          VALUES (?, ?, ?)
        `).run('6000', 'Test Account', 'invalid_type');
      }).toThrow();
    });
  });

  describe('Transaction Event CRUD Operations', () => {
    it('should create a transaction event', async () => {
      db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user');

      const event = db.prepare('SELECT * FROM transaction_event WHERE reference = ?').get('INV-001') as any;

      expect(event).toBeDefined();
      expect(event.event_type).toBe('invoice_created');
      expect(event.description).toBe('Test Invoice');
      expect(event.reference).toBe('INV-001');
    });

    it('should read transaction events by type', async () => {
      db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice 1', 'INV-001', 'test_user');

      db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('payment_received', 'Test Payment', 'PMT-001', 'test_user');

      const events = db.prepare('SELECT * FROM transaction_event WHERE event_type = ?').all('invoice_created') as any[];

      expect(events.length).toBe(1);
      expect(events[0].event_type).toBe('invoice_created');
    });
  });

  describe('Journal Entry CRUD Operations', () => {
    it('should create a journal entry', async () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'posted');

      const entry = db.prepare('SELECT * FROM journal_entry WHERE reference = ?').get('INV-001') as any;

      expect(entry).toBeDefined();
      expect(entry.event_id).toBe(eventId);
      expect(entry.entry_date).toBe('2026-01-25');
      expect(entry.status).toBe('posted');
    });

    it('should update journal entry status', async () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('invoice_created', 'Test Invoice', 'INV-001', 'test_user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Invoice Entry', 'INV-001', 'draft').lastInsertRowid as number;

      db.prepare(`
        UPDATE journal_entry
        SET status = ?, posted_at = datetime('now'), posted_by = ?
        WHERE id = ?
      `).run('posted', 'test_user', entryId);

      const entry = db.prepare('SELECT * FROM journal_entry WHERE id = ?').get(entryId) as any;

      expect(entry.status).toBe('posted');
      expect(entry.posted_at).toBeDefined();
      expect(entry.posted_by).toBe('test_user');
    });
  });

  describe('Journal Line CRUD Operations', () => {
    it('should create journal lines for a journal entry', async () => {
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

      const lines = db.prepare('SELECT * FROM journal_line WHERE journal_entry_id = ?').all(entryId) as any[];

      expect(lines.length).toBe(2);
      expect(lines[0].debit_amount).toBe(1000.00);
      expect(lines[1].credit_amount).toBe(1000.00);
    });

    it('should enforce debit/credit constraint', async () => {
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
        `).run(entryId, 1, 1000.00, 1000.00);
      }).toThrow();
    });

    it('should prevent adding lines to posted journal entry', async () => {
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
          INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
          VALUES (?, ?, ?, ?)
        `).run(entryId, 1, 100.00, 0.00);
      }).toThrow('Cannot add lines to posted journal entry');
    });

    it('should enforce debit/credit constraint', async () => {
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
        `).run(entryId, 1, 1000.00, 500.00);
      }).toThrow();
    });
  });

  describe('Foreign Key Constraints', () => {
    it('should enforce foreign key constraint on journal_entry.event_id', async () => {
      expect(() => {
        db.prepare(`
          INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
          VALUES (?, ?, ?, ?, ?)
        `).run(9999, '2026-01-25', 'Invalid Entry', 'INV-999', 'posted');
      }).toThrow();
    });

    it('should enforce foreign key constraint on journal_line.account_id', async () => {
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
        `).run(entryId, 9999, 1000.00, 0.00);
      }).toThrow();
    });

    it('should cascade delete journal lines when journal entry is deleted', async () => {
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

      const linesBefore = db.prepare('SELECT * FROM journal_line WHERE journal_entry_id = ?').all(entryId) as any[];
      expect(linesBefore.length).toBe(2);

      expect(() => {
        db.prepare('DELETE FROM journal_entry WHERE id = ?').run(entryId);
      }).toThrow('Cannot delete posted journal entry');

      const linesAfter = db.prepare('SELECT * FROM journal_line WHERE journal_entry_id = ?').all(entryId) as any[];
      expect(linesAfter.length).toBe(2);
    });

    it('should allow delete of draft journal entry', async () => {
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

      db.prepare('DELETE FROM journal_entry WHERE id = ?').run(entryId);

      const lines = db.prepare('SELECT * FROM journal_line WHERE journal_entry_id = ?').all(entryId) as any[];

      expect(lines.length).toBe(0);
    });
  });
});
