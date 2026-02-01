import Database from 'better-sqlite3';
import { allMigrations } from '../../../migrations/index';
import type { Migration } from '../../lib/services/database';

let testDbInstance: Database.Database | null = null;

export async function getTestDatabase(): Promise<any> {
  if (testDbInstance) {
    return testDbInstance;
  }

  testDbInstance = new Database(':memory:');
  testDbInstance.pragma('foreign_keys = ON');
  await initializeMigrations();
  await runMigrations();
  await seedDefaultData();

  // Add Tauri-like API wrapper methods
  (testDbInstance as any).select = async <T = any>(sql: string, params?: any[]): Promise<T[]> => {
    const stmt = testDbInstance!.prepare(sql);
    return stmt.all(params || []) as T[];
  };

  (testDbInstance as any).execute = async (sql: string, params?: any[]): Promise<any> => {
    const stmt = testDbInstance!.prepare(sql);
    const result = stmt.run(params || []);
    return { lastInsertId: (result as any).lastInsertRowid, changes: (result as any).changes };
  };

  return testDbInstance;
}

async function initializeMigrations(): Promise<void> {
  const db = testDbInstance!;

  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function runMigrations(): Promise<void> {
  const db = testDbInstance!;

  const applied = db.prepare('SELECT id FROM _migrations ORDER BY id').all() as Array<{ id: string }>;
  const appliedIds = new Set(applied.map(m => m.id));

  for (const migration of allMigrations) {
    if (!appliedIds.has(migration.id)) {
      db.exec(migration.up);

      db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(migration.id, migration.name);
    }
  }
}

async function seedDefaultData(): Promise<void> {
  const db = testDbInstance!;

  db.exec(`
    INSERT OR IGNORE INTO account (code, name, type) VALUES
    ('1000', 'Cash', 'asset'),
    ('1100', 'Accounts Receivable', 'asset'),
    ('1200', 'Inventory', 'asset'),
    ('2000', 'Accounts Payable', 'liability'),
    ('2100', 'HST Payable', 'liability'),
    ('2200', 'Employee Payable', 'liability'),
    ('3000', 'Owner''s Equity', 'equity'),
    ('4000', 'Sales Revenue', 'revenue'),
    ('4100', 'Service Revenue', 'revenue'),
    ('5000', 'Cost of Goods Sold', 'expense'),
    ('5100', 'Office Expenses', 'expense'),
    ('5200', 'Payroll Expenses', 'expense'),
    ('5300', 'Tax Expenses', 'expense')
  `);
}

export async function closeTestDatabase(): Promise<void> {
  if (testDbInstance) {
    testDbInstance.close();
    testDbInstance = null;
  }
}

export async function resetTestDatabase(): Promise<Database.Database> {
  await closeTestDatabase();
  return await getTestDatabase();
}
