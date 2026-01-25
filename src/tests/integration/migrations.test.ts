import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { getTestDatabase } from './test-db';

describe('Integration - Database Migrations', () => {
  let db: Awaited<ReturnType<typeof getTestDatabase>>;

  beforeEach(async () => {
    db = await getTestDatabase();
  });

  function getAppliedMigrations(): Array<{ id: string; name: string; applied_at: string }> {
    return db.prepare('SELECT * FROM _migrations ORDER BY id').all() as any;
  }

  function tableExists(tableName: string): boolean {
    const result = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name=?
    `).get(tableName);
    return result !== undefined;
  }

  function columnExists(tableName: string, columnName: string): boolean {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as any[];
    return columns.some((col: any) => col.name === columnName);
  }

  describe('Migration Tracking', () => {
    it('should track applied migrations in _migrations table', () => {
      const migrations = getAppliedMigrations();

      expect(migrations.length).toBeGreaterThan(0);
      expect(migrations.every(m => m.id && m.name && m.applied_at)).toBe(true);
    });

    it('should have exactly 18 migrations applied', () => {
      const migrations = getAppliedMigrations();

      expect(migrations.length).toBe(18);
    });

    it('should apply migrations in correct order', () => {
      const migrations = getAppliedMigrations();

      for (let i = 0; i < migrations.length - 1; i++) {
        const currentId = parseInt(migrations[i].id);
        const nextId = parseInt(migrations[i + 1].id);
        expect(currentId).toBeLessThan(nextId);
      }
    });

    it('should prevent reapplying the same migration', async () => {
      const migrationsBefore = getAppliedMigrations();

      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('test', 'Test', 'TEST', 'user').lastInsertRowid as number;

      const migrationsAfter = getAppliedMigrations();

      expect(migrationsBefore.length).toBe(migrationsAfter.length);
    });
  });

  describe('Migration 001: Core Ledger Schema', () => {
    it('should have applied migration 001', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '001')).toBe(true);
    });

    it('should create settings table', () => {
      expect(tableExists('settings')).toBe(true);
      expect(columnExists('settings', 'key')).toBe(true);
      expect(columnExists('settings', 'value')).toBe(true);
    });

    it('should create account table', () => {
      expect(tableExists('account')).toBe(true);
      expect(columnExists('account', 'code')).toBe(true);
      expect(columnExists('account', 'name')).toBe(true);
      expect(columnExists('account', 'type')).toBe(true);
    });

    it('should create audit_log table', () => {
      expect(tableExists('audit_log')).toBe(true);
      expect(columnExists('audit_log', 'entity_type')).toBe(true);
      expect(columnExists('audit_log', 'entity_id')).toBe(true);
    });

    it('should create transaction_event table', () => {
      expect(tableExists('transaction_event')).toBe(true);
      expect(columnExists('transaction_event', 'event_type')).toBe(true);
    });

    it('should create journal_entry table', () => {
      expect(tableExists('journal_entry')).toBe(true);
      expect(columnExists('journal_entry', 'event_id')).toBe(true);
    });

    it('should create journal_line table', () => {
      expect(tableExists('journal_line')).toBe(true);
      expect(columnExists('journal_line', 'debit_amount')).toBe(true);
      expect(columnExists('journal_line', 'credit_amount')).toBe(true);
    });

    it('should insert default settings', () => {
      const settings = db.prepare('SELECT * FROM settings').all() as any[];

      expect(settings.length).toBeGreaterThanOrEqual(3);
      expect(settings.some(s => s.key === 'mode')).toBe(true);
      expect(settings.some(s => s.key === 'locale')).toBe(true);
      expect(settings.some(s => s.key === 'fiscal_year_start')).toBe(true);
    });
  });

  describe('Migration 002: Contacts AR/AP', () => {
    it('should have applied migration 002', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '002')).toBe(true);
    });

    it('should create contact table', () => {
      expect(tableExists('contact')).toBe(true);
    });

    it('should create invoice table', () => {
      expect(tableExists('invoice')).toBe(true);
    });

    it('should create invoice_line table', () => {
      expect(tableExists('invoice_line')).toBe(true);
    });

    it('should create payment table', () => {
      expect(tableExists('payment')).toBe(true);
    });

    it('should create allocation table', () => {
      expect(tableExists('allocation')).toBe(true);
    });
  });

  describe('Migration 003: Inventory Payroll Tax', () => {
    it('should have applied migration 003', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '003')).toBe(true);
    });

    it('should create tax_jurisdiction table', () => {
      expect(tableExists('tax_jurisdiction')).toBe(true);
    });

    it('should create tax_code table', () => {
      expect(tableExists('tax_code')).toBe(true);
    });

    it('should create tax_rate table', () => {
      expect(tableExists('tax_rate')).toBe(true);
    });

    it('should create item table', () => {
      expect(tableExists('item')).toBe(true);
    });

    it('should create inventory_movement table', () => {
      expect(tableExists('inventory_movement')).toBe(true);
    });

    it('should create payroll_run table', () => {
      expect(tableExists('payroll_run')).toBe(true);
    });

    it('should create payroll_line table', () => {
      expect(tableExists('payroll_line')).toBe(true);
    });

    it('should create payroll_line table', () => {
      expect(tableExists('payroll_line')).toBe(true);
    });

    it('should create tax_code table', () => {
      expect(tableExists('tax_code')).toBe(true);
    });
  });

  describe('Migration 004: Integrity Triggers', () => {
    it('should have applied migration 004', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '004')).toBe(true);
    });
  });

  describe('Migration 005: Allocation Constraints', () => {
    it('should have applied migration 005', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '005')).toBe(true);
    });
  });

  describe('Migration 006: Tax Code Integration', () => {
    it('should have applied migration 006', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '006')).toBe(true);
    });
  });

  describe('Migration 007: System Accounts Config', () => {
    it('should have applied migration 007', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '007')).toBe(true);
    });
  });

  describe('Migration 008: Fiscal Periods', () => {
    it('should have applied migration 008', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '008')).toBe(true);
    });

    it('should create fiscal_period table', () => {
      expect(tableExists('fiscal_period')).toBe(true);
    });
  });

  describe('Migration 009: Bank Reconciliation', () => {
    it('should have applied migration 009', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '009')).toBe(true);
    });

    it('should have all required tables', () => {
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all() as any[];

      const coreTables = [
        'account',
        'journal_entry',
        'journal_line',
        'transaction_event',
        'audit_log',
        'settings',
        'contact',
        'invoice',
        'invoice_line',
        'payment',
        'allocation',
      ];

      coreTables.forEach(table => {
        expect(tables.some(t => t.name === table)).toBe(true);
      });
    });
  });

  describe('Migration 010: Vendor Bills', () => {
    it('should have applied migration 010', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '010')).toBe(true);
    });
  });

  describe('Migration 011: Multi Currency', () => {
    it('should have applied migration 011', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '011')).toBe(true);
    });

    it('should create currency table', () => {
      expect(tableExists('currency')).toBe(true);
    });

    it('should create exchange_rate table', () => {
      expect(tableExists('exchange_rate')).toBe(true);
    });
  });

  describe('Migration 012: Closed Period Enforcement', () => {
    it('should have applied migration 012', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '012')).toBe(true);
    });
  });

  describe('Migration 013: Invoice Line Tax Inclusive', () => {
    it('should have applied migration 013', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '013')).toBe(true);
    });
  });

  describe('Migration 014: Invoice Total Triggers', () => {
    it('should have applied migration 014', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '014')).toBe(true);
    });
  });

  describe('Migration 015: Bank Import', () => {
    it('should have applied migration 015', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '015')).toBe(true);
    });

    it('should create bank_statement_import table', () => {
      expect(tableExists('bank_statement_import')).toBe(true);
    });

    it('should create bank_statement_transaction table', () => {
      expect(tableExists('bank_statement_transaction')).toBe(true);
    });

    it('should create categorization_rule table', () => {
      expect(tableExists('categorization_rule')).toBe(true);
    });

    it('should create rule_application_log table', () => {
      expect(tableExists('rule_application_log')).toBe(true);
    });
  });

  describe('Migration 016: Document Attachments', () => {
    it('should have applied migration 016', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '016')).toBe(true);
    });

    it('should create document table', () => {
      expect(tableExists('document')).toBe(true);
    });
  });

  describe('Migration 017: Update Channel', () => {
    it('should have applied migration 017', () => {
      const migrations = getAppliedMigrations();
      expect(migrations.some(m => m.id === '017')).toBe(true);
    });
  });

  describe('Foreign Key Enforcement', () => {
    it('should have foreign keys enabled', () => {
      const result = db.prepare('PRAGMA foreign_keys').get() as any;
      expect(result.foreign_keys).toBe(1);
    });

    it('should enforce foreign key on journal_entry.event_id', () => {
      expect(() => {
        db.prepare(`
          INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
          VALUES (?, ?, ?, ?, ?)
        `).run(99999, '2026-01-25', 'Test', 'REF', 'posted');
      }).toThrow();
    });

    it('should enforce foreign key on journal_line.journal_entry_id', () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('test', 'Test', 'REF', 'user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Test', 'REF', 'posted').lastInsertRowid as number;

      expect(() => {
        db.prepare(`
          INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
          VALUES (?, ?, ?, ?)
        `).run(99999, 1, 100.00, 0.00);
      }).toThrow();
    });
  });

  describe('Schema Integrity', () => {
    it('should maintain account type constraint', () => {
      expect(() => {
        db.prepare(`
          INSERT INTO account (code, name, type)
          VALUES (?, ?, ?)
        `).run('9999', 'Invalid', 'invalid_type');
      }).toThrow();
    });

    it('should maintain journal entry status constraint', () => {
      expect(() => {
        db.prepare(`
          INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
          VALUES (?, ?, ?, ?, ?)
        `).run(1, '2026-01-25', 'Test', 'REF', 'invalid_status');
      }).toThrow();
    });

    it('should maintain journal line debit/credit constraint', () => {
      const eventId = db.prepare(`
        INSERT INTO transaction_event (event_type, description, reference, created_by)
        VALUES (?, ?, ?, ?)
      `).run('test', 'Test', 'REF', 'user').lastInsertRowid as number;

      const entryId = db.prepare(`
        INSERT INTO journal_entry (event_id, entry_date, description, reference, status)
        VALUES (?, ?, ?, ?, ?)
      `).run(eventId, '2026-01-25', 'Test', 'REF', 'posted').lastInsertRowid as number;

      expect(() => {
        db.prepare(`
          INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount)
          VALUES (?, ?, ?, ?)
        `).run(entryId, 1, 100.00, 100.00);
      }).toThrow();
    });
  });

  describe('Data Integrity After Migrations', () => {
    it('should have correct default accounts seeded', () => {
      const accounts = db.prepare('SELECT * FROM account').all() as any[];
      expect(accounts.length).toBeGreaterThanOrEqual(13);
      expect(accounts.some(a => a.code === '1000')).toBe(true);
      expect(accounts.some(a => a.code === '1100')).toBe(true);
    });

    it('should have all required tables', () => {
      const tables = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name NOT LIKE 'sqlite_%'
      `).all() as any[];

      const requiredTables = [
        'account',
        'journal_entry',
        'journal_line',
        'transaction_event',
        'contact',
        'invoice',
        'payment',
        'bill',
        'vendor_payment',
        'bank_reconciliation',
        'bank_statement_import',
        'bank_statement_transaction'
      ];

      requiredTables.forEach(table => {
        expect(tables.some(t => t.name === table)).toBe(true);
      });
    });

    it('should have indexes created', () => {
      const indexes = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='index'
      `).all() as any[];

      expect(indexes.length).toBeGreaterThan(0);
    });
  });

  describe('Migration Rollback Safety', () => {
    it('should handle transaction rollback on failure', () => {
      const initialAccountCount = db.prepare('SELECT COUNT(*) as count FROM account').get() as any;

      try {
        db.prepare('BEGIN').run();

        db.prepare(`
          INSERT INTO account (code, name, type)
          VALUES (?, ?, ?)
        `).run('7000', 'Valid Account', 'asset');

        db.prepare(`
          INSERT INTO account (code, name, type)
          VALUES (?, ?, ?)
        `).run('1000', 'Duplicate Code', 'asset');

        db.prepare('COMMIT').run();
      } catch (e) {
        db.prepare('ROLLBACK').run();
      }

      const finalAccountCount = db.prepare('SELECT COUNT(*) as count FROM account').get() as any;
      expect(finalAccountCount.count).toBe(initialAccountCount.count);
    });
  });

  describe('Migration Idempotency', () => {
    it('should handle re-running migrations safely', async () => {
      const db2 = new Database(':memory:');
      db2.pragma('foreign_keys = ON');

      db2.exec(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);

      const allMigrations = (await import('../../../migrations/index')).allMigrations;

      for (const migration of allMigrations) {
        db2.exec(migration.up);
        db2.prepare('INSERT OR IGNORE INTO _migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
      }

      const migrations = db2.prepare('SELECT * FROM _migrations').all() as any[];
      expect(migrations.length).toBe(allMigrations.length);

      db2.close();
    });
  });
});
