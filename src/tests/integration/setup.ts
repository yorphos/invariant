import { beforeEach, afterEach } from 'vitest';
import { getTestDatabase, closeTestDatabase, resetTestDatabase } from './test-db';

beforeEach(async () => {
  await getTestDatabase();
});

afterEach(async () => {
  await resetTestDatabase();
});
