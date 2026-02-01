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
vi.mock('../../lib/services/system-accounts', () => ({
  getSystemAccount: vi.fn(async (key: string) => {
    const db = await getTestDatabase() as unknown;
    const result = await (db as any).get(
      'SELECT a.* FROM system_account WHERE key = ?',
      [key]
    );
    if (!result) {
      throw new Error(`System account '${key}' not found`);
    }
    return result as { id: number; code: string; name: string };
  }),
}));

beforeEach(async () => {
  await getTestDatabase();
});

afterEach(async () => {
  await resetTestDatabase();
});
