import Database from '@tauri-apps/plugin-sql';
import { appDataDir } from '@tauri-apps/api/path';

let dbInstance: Database | null = null;

export interface Migration {
  id: string;
  name: string;
  up: string;
}

export async function getDatabase(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const appDataPath = await appDataDir();
  dbInstance = await Database.load(`sqlite:${appDataPath}/invariant.db`);
  
  await initializeMigrations();
  await runMigrations();
  
  return dbInstance;
}

async function initializeMigrations(): Promise<void> {
  const db = dbInstance!;
  
  await db.execute(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

async function runMigrations(): Promise<void> {
  const db = dbInstance!;
  
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

export async function closeDatabase(): Promise<void> {
  if (dbInstance) {
    await dbInstance.close();
    dbInstance = null;
  }
}
