import { beforeEach, afterEach, vi } from 'vitest';
import { getTestDatabase, closeTestDatabase, resetTestDatabase } from './test-db';

// Mock getDatabase to return test database instead of using Tauri API
vi.mock('../../lib/services/database', async (importOriginal) => {
  const original: any = await importOriginal();
  return {
    ...original,
    getDatabase: vi.fn(() => getTestDatabase()),
  };
});

// Mock getSystemAccount to use test database
vi.mock('../../lib/services/system-accounts', async (importOriginal) => {
  const original = await importOriginal() as any;
  return {
    ...original,
    getSystemAccount: vi.fn(async (key: string) => {
      const db = await getTestDatabase() as unknown;
      let result;
      
      // Handle both better-sqlite3 (.get()) and Tauri database (.select()) mocks
      if (typeof (db as any).get === 'function') {
        // better-sqlite3 test database
        result = await (db as any).get(
          'SELECT a.* FROM account a JOIN system_account sa ON a.id = sa.account_id WHERE sa.role = ?',
          [key]
        );
      } else if (typeof (db as any).select === 'function') {
        // Tauri database or mocked database
        const results = await (db as any).select(
          'SELECT a.* FROM account a JOIN system_account sa ON a.id = sa.account_id WHERE sa.role = ?',
          [key]
        );
        result = results?.[0];
      }
      
      if (!result) {
        // Fail loudly in integration tests when system account is missing
        throw new Error(`System account not found for role: ${key}. Check migrations/seed data.`);
      }
      return result as { id: number; code: string; name: string };
    }),
  };
});

beforeEach(async () => {
  await getTestDatabase();
});

afterEach(async () => {
  await resetTestDatabase();
});
