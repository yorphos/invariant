import Database from '@tauri-apps/plugin-sql';
import { appDataDir } from '@tauri-apps/api/path';
import { seedDefaultAccounts } from './seed';

let dbPromise: Promise<Database> | null = null;

export interface Migration {
  id: string;
  name: string;
  up: string;
}

/**
 * Check if the database connection has been initialized.
 */
export function isDatabaseReady(): boolean {
  return dbPromise !== null;
}

export async function getDatabase(): Promise<Database> {
  if (dbPromise) {
    const existingPromise = dbPromise;

    try {
      const db = await existingPromise;
      await db.select<Array<{ count: number }>>('SELECT 1 as count');
      return db;
    } catch (error) {
      console.warn('Database connection lost, reinitializing...', error);

      try {
        const db = await existingPromise;
        await db.close();
      } catch {
        // Ignore close failures while resetting the connection state.
      }

      dbPromise = null;
    }
  }

  let nextPromise: Promise<Database>;

  nextPromise = initializeDatabase().catch((error) => {
    if (dbPromise === nextPromise) {
      dbPromise = null;
    }

    throw error;
  });

  dbPromise = nextPromise;
  return nextPromise;
}

async function initializeDatabase(): Promise<Database> {
  const appDataPath = await appDataDir();
  const db = await Database.load(`sqlite:${appDataPath}/invariant.db`);
  const readyPromise = Promise.resolve(db);

  try {
    await initializeMigrations(db);
    await runMigrations(db);

    dbPromise = readyPromise;

    await seedDefaultData(db);

    return db;
  } catch (error) {
    if (dbPromise === readyPromise) {
      dbPromise = null;
    }

    await db.close().catch(() => undefined);
    throw error;
  }
}

async function initializeMigrations(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function runMigrations(db: Database): Promise<void> {
  // Enable foreign keys
  await db.execute('PRAGMA foreign_keys = ON');
  
  // Get list of applied migrations
  const applied = await db.select<Array<{ id: string }>>(
    'SELECT id FROM _migrations ORDER BY id'
  );
  const appliedIds = new Set(applied.map(m => m.id));
  
  // Import all migrations
  const migrations = await import('../../../migrations');
  
  // Apply pending migrations in order
  for (const migration of migrations.allMigrations) {
    if (!appliedIds.has(migration.id)) {
      console.log(`Applying migration ${migration.id}: ${migration.name}`);
      
      // Execute migration
      await db.execute(migration.up);
      
      // Record migration
      await db.execute(
        'INSERT INTO _migrations (id, name) VALUES (?, ?)',
        [migration.id, migration.name]
      );
      
      console.log(`Migration ${migration.id} applied successfully`);
    }
  }
}

async function seedDefaultData(_db: Database): Promise<void> {
  await seedDefaultAccounts();
}

/**
 * Reinitialize the database connection on next access.
 */
export async function reinitializeDatabase(): Promise<void> {
  if (!dbPromise) {
    return;
  }

  const existingPromise = dbPromise;
  dbPromise = null;

  try {
    const db = await existingPromise;
    await db.close();
  } catch {
    // Ignore close failures; the next getDatabase call will rebuild the connection.
  }
}

export const closeDatabase = reinitializeDatabase;
