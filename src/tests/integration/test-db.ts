import Database from 'better-sqlite3';
import { allMigrations } from '../../../migrations/index';
import type { Migration } from '../../lib/services/database';

/**
 * Database adapter that wraps better-sqlite3 to expose the Tauri plugin-sql API
 * (execute/select) so service-layer tests can use the real persistence layer.
 */
export type TestDatabase = Database.Database & {
  execute(sql: string, bindings?: unknown[]): Promise<{ lastInsertId?: number; rowsAffected: number }>;
  select<T = Record<string, unknown>>(sql: string, bindings?: unknown[]): Promise<T[]>;
};

let testDbInstance: TestDatabase | null = null;

function wrapBetterSqlite3(raw: Database.Database): TestDatabase {
  return new Proxy(raw, {
    get(target, prop, receiver) {
      // Async adapter for Tauri plugin-sql's execute()
      if (prop === 'execute') {
        return (sql: string, bindings?: unknown[]) => {
          try {
            const stmt = target.prepare(sql);
            const info = bindings ? stmt.run(...bindings) : stmt.run();
            return {
              lastInsertId: info.lastInsertRowid as number | undefined,
              rowsAffected: info.changes,
            };
          } catch (err: unknown) {
            if (err instanceof Error) {
              // better-sqlite3 throws SqliteError which should propagate naturally
              throw err;
            }
            throw err;
          }
        };
      }
      // Async adapter for Tauri plugin-sql's select()
      if (prop === 'select') {
        return (sql: string, bindings?: unknown[]) => {
          const stmt = target.prepare(sql);
          return bindings ? stmt.all(...bindings) : stmt.all();
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as TestDatabase;
}

export async function getTestDatabase(): Promise<TestDatabase> {
  if (testDbInstance) {
    return testDbInstance;
  }

  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  testDbInstance = wrapBetterSqlite3(raw);
  await initializeMigrations();
  await runMigrations();
  await seedDefaultData();

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

  const applied = db.prepare('SELECT id FROM _migrations ORDER BY id').all() as Array<{
    id: string;
  }>;
  const appliedIds = new Set(applied.map((m) => m.id));

  for (const migration of allMigrations) {
    if (!appliedIds.has(migration.id)) {
      db.exec(migration.up);

      db.prepare('INSERT INTO _migrations (id, name) VALUES (?, ?)').run(
        migration.id,
        migration.name,
      );
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
