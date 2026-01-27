/**
 * Test Setup
 * Initializes test environment and provides global utilities
 */

import { beforeEach, afterEach, vi } from 'vitest';

// Mock calculateTax for unit tests (no database access in Node.js)
vi.mock('../lib/services/tax', () => ({
  calculateTax: vi.fn(async (subtotal, taxCodeId, issueDate, isTaxInclusive) => {
    const taxAmount = isTaxInclusive ? subtotal * 0.13 : subtotal * 0.13;
    return {
      taxAmount,
      taxRate: 0.13,
      accountId: taxAmount > 0 ? 2001 : null,
      netSubtotal: subtotal,
    };
  }),
}));

// Global test setup runs before each test
beforeEach(async () => {
  // Reset any global state if needed
});

// Global test cleanup runs after each test
afterEach(async () => {
  // Clean up any test data
});
