# Invariant Accounting - Test Infrastructure

Comprehensive automated test suite for ensuring accountability, auditability, and compliance with fundamental accounting principles.

## Overview

This test infrastructure validates the core accounting principles and business logic that underpin the Invariant accounting system:

- **Double-Entry Bookkeeping** - All journal entries must balance (debits = credits)
- **FIFO Payment Allocation** - Oldest invoices paid first
- **Over-Allocation Prevention** - Cannot allocate more than available
- **Server-Side Validation** - All business rules enforced
- **Financial Accuracy** - Calculations verified and tested

## Test Framework

**Technology Stack:**
- [Vitest](https://vitest.dev/) - Fast unit test framework
- [@vitest/ui](https://vitest.dev/guide/ui.html) - Interactive test UI
- [happy-dom](https://github.com/capricorn86/happy-dom) - Lightweight DOM for testing

## Directory Structure

```
src/tests/
├── setup.ts                              # Global test configuration
└── unit/
    ├── accounting-principles.test.ts     # Core accounting logic (37 tests)
    ├── ap-operations.test.ts             # Accounts Payable (32 tests)
    ├── ar-matching.test.ts               # A/R payment matching (19 tests)
    ├── bank-import.test.ts               # Bank import logic (21 tests)
    ├── bank-reconciliation.test.ts       # Reconciliation (22 tests)
    ├── batch-operations.test.ts          # Batch workflows (32 tests)
    ├── chart-of-accounts.test.ts         # COA operations (27 tests)
    ├── csv-export.test.ts                # CSV export (21 tests)
    ├── currency-operations.test.ts       # Multi-currency (36 tests)
    ├── expense-operations.test.ts        # Expense tracking (19 tests)
    ├── inventory-operations.test.ts      # Inventory logic (39 tests)
    ├── payroll-operations.test.ts        # Payroll processing (35 tests)
    ├── period-close.test.ts              # Period close (9 tests)
    └── policy-engine.test.ts             # Policy rules (23 tests)
```

## Running Tests

```bash
# Run all tests (watch mode)
npm test

# Run tests once (CI mode)
npm run test:run

# Run tests with UI
npm run test:ui

# Run tests with coverage
npm run test:coverage
```

## Test Results

```
✓ src/tests/unit/accounting-principles.test.ts (37 tests)
✓ src/tests/unit/ap-operations.test.ts (32 tests)
✓ src/tests/unit/ar-matching.test.ts (19 tests)
✓ src/tests/unit/bank-import.test.ts (21 tests)
✓ src/tests/unit/bank-reconciliation.test.ts (22 tests)
✓ src/tests/unit/batch-operations.test.ts (32 tests)
✓ src/tests/unit/chart-of-accounts.test.ts (27 tests)
✓ src/tests/unit/csv-export.test.ts (21 tests)
✓ src/tests/unit/currency-operations.test.ts (36 tests)
✓ src/tests/unit/expense-operations.test.ts (19 tests)
✓ src/tests/unit/inventory-operations.test.ts (39 tests)
✓ src/tests/unit/payroll-operations.test.ts (35 tests)
✓ src/tests/unit/period-close.test.ts (9 tests)
✓ src/tests/unit/policy-engine.test.ts (23 tests)

Test Files  14 passed (14)
     Tests  372 passed (372)
```

All tests pass successfully! ✅

---

## Test Categories

### 1. Double-Entry Bookkeeping Principles (3 tests)

Tests fundamental accounting equation: **Debits = Credits**

#### ✅ should calculate balanced journal entries
Verifies that a complete transaction (invoice with A/R, Revenue, and HST) balances correctly.

```typescript
// Example: Invoice creates balanced entry
DR A/R          $1,130
  CR Revenue    $1,000
  CR HST Payable  $130
Total: $1,130 = $1,130 ✓
```

#### ✅ should detect unbalanced entries
Ensures the system can identify when entries don't balance.

#### ✅ should allow 1 cent tolerance for rounding
Accounts for floating-point precision issues with 1 cent tolerance.

---

### 2. Invoice Calculation Logic (5 tests)

Tests invoice amount calculations and validation.

#### ✅ should calculate line amount from quantity and unit price
```typescript
10 units × $50.00 = $500.00
```

#### ✅ should calculate subtotal from line items
Sums all line item amounts correctly.

#### ✅ should calculate tax at 13% HST
```typescript
$1,000 × 13% = $130
```

#### ✅ should calculate total as subtotal plus tax
```typescript
$1,000 + $130 = $1,130
```

#### ✅ should detect amount mismatch (client manipulation)
**Critical Security Test:** Ensures server recalculates amounts and detects when client sends manipulated values.

```typescript
Client sends: quantity=10, price=$50, amount=$600 (inflated!)
Server calculates: 10 × $50 = $500
Mismatch detected! ✓
```

---

### 3. Payment Allocation Logic (11 tests)

Tests FIFO allocation and over-allocation prevention.

#### FIFO Allocation (3 tests)

##### ✅ should sort invoices by date (oldest first)
```typescript
Invoices: 2026-01-15, 2026-01-01, 2026-01-10
Sorted:   2026-01-01, 2026-01-10, 2026-01-15 ✓
```

##### ✅ should allocate payment to oldest invoice first
With payment of $113 and 2 outstanding invoices:
- Allocates $113 to oldest invoice (2026-01-01)
- Second invoice (2026-01-10) receives $0

##### ✅ should allocate across multiple invoices in FIFO order
With payment of $113 and 2 invoices of $56.50 each:
- Oldest invoice: $56.50
- Second invoice: $56.50
- Remaining: $0

#### Over-Allocation Prevention (3 tests)

##### ✅ should detect allocation exceeding payment amount
```typescript
Payment: $50
Requested allocation: $100
Result: INVALID ✓
```

##### ✅ should detect allocation exceeding invoice outstanding
```typescript
Invoice outstanding: $50
Requested allocation: $100
Result: INVALID ✓
```

##### ✅ should allow allocation within limits
```typescript
Payment: $100
Invoice outstanding: $113
Requested allocation: $100
Result: VALID ✓
```

#### Unallocated Payment Handling (2 tests)

##### ✅ should calculate unallocated amount
```typescript
Payment: $200
Allocated: $113
Unallocated: $87 (goes to Customer Deposits)
```

##### ✅ should have zero unallocated when fully allocated
```typescript
Payment: $113
Allocated: $113
Unallocated: $0 ✓
```

---

### 4. Account Balance Calculations (2 tests)

Tests debit/credit balance calculations.

#### ✅ should calculate asset account balance (debit - credit)
```typescript
DR $1,000 - CR $300 + DR $500 = $1,200 balance
```

#### ✅ should calculate liability account balance (credit - debit)
```typescript
CR $1,000 - DR $300 = -$700 (negative = liability)
```

---

### 5. Server-Side Validation Rules (7 tests)

Tests that all business rules are enforced.

#### Invoice Validation (5 tests)

- ✅ **should reject zero quantity** - Prevents $0 line items
- ✅ **should reject negative quantity** - No negative quantities allowed
- ✅ **should reject zero unit price** - Price must be > $0
- ✅ **should reject empty description** - Description required
- ✅ **should reject due date before issue date** - Logical date validation

#### Payment Validation (2 tests)

- ✅ **should reject zero payment amount** - Payment must be > $0
- ✅ **should reject negative payment amount** - No negative payments

---

### 6. Financial Accuracy (3 tests)

Tests numerical precision and calculations.

#### ✅ should maintain precision to 2 decimal places
Ensures monetary values maintain 2 decimal precision.

#### ✅ should handle floating point precision issues
Uses `toBeCloseTo()` for safe floating-point comparisons.

#### ✅ should calculate percentage correctly
```typescript
$1,000 × 13% = $130
```

---

## Accounting Principles Tested

### 1. Double-Entry Bookkeeping ✅
**Principle:** Every transaction affects at least two accounts; debits must equal credits.

**Tests:** 3 tests verify balanced entries and detect imbalances.

---

### 2. FIFO Payment Allocation ✅
**Principle:** Payments automatically allocated to oldest invoices first.

**Tests:** 3 tests verify correct sorting and allocation order.

---

### 3. Over-Allocation Prevention ✅
**Principle:** Cannot allocate more than payment amount or invoice outstanding.

**Tests:** 3 tests verify allocation limits enforced.

---

### 4. Server-Side Validation ✅
**Principle:** Never trust client-provided calculations or data.

**Tests:** 8 tests verify all validation rules enforced, including critical security test for amount manipulation detection.

---

### 5. Financial Accuracy ✅
**Principle:** All calculations must be correct and handle floating-point precision.

**Tests:** 8 tests verify calculations including subtotals, tax, totals, percentages, and precision handling.

---

## Test Architecture

### Pure Business Logic Tests

These tests focus on **pure functions** and **business logic** without database dependencies. This approach provides:

1. **Fast Execution** - Tests run in milliseconds
2. **No External Dependencies** - No database, no Tauri runtime required
3. **Easy to Maintain** - Simple, focused tests
4. **CI/CD Ready** - Run anywhere Node.js runs
5. **TDD Friendly** - Easy to write tests first

### What We Test

- ✅ Mathematical calculations (amounts, totals, tax)
- ✅ Business logic (FIFO sorting, allocation rules)
- ✅ Validation rules (quantity > 0, price > 0, dates)
- ✅ Security (amount manipulation detection)
- ✅ Edge cases (floating point precision, rounding)

### What We Don't Test (Yet)

- ⏳ Database operations (requires Tauri runtime or mocking)
- ⏳ UI components (requires Svelte testing library)
- ⏳ API integrations
- ⏳ Full end-to-end workflows

---

## Adding New Tests

### Test Structure Template

```typescript
import { describe, it, expect } from 'vitest';

describe('Feature Name', () => {
  it('should do something', () => {
    // Arrange
    const input = 100;
    const expected = 200;
    
    // Act
    const result = input * 2;
    
    // Assert
    expect(result).toBe(expected);
  });
});
```

### Best Practices

1. **Isolation:** Each test should be independent
2. **Clarity:** Test names should describe behavior in plain English
3. **AAA Pattern:** Arrange, Act, Assert
4. **Error Testing:** Test failure cases, not just happy paths
5. **Fast:** Tests should run in milliseconds
6. **No External Dependencies:** Pure logic only

---

## CI/CD Integration

### NPM Scripts
```json
{
  "test": "vitest",                        // Watch mode for development
  "test:ui": "vitest --ui",                // Interactive UI
  "test:run": "vitest run",                // Single run for CI
  "test:coverage": "vitest run --coverage" // Coverage report
}
```

### GitHub Actions Example
```yaml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run test:run
```

---

## Test Statistics

**Total Tests:** 372 tests  
**Success Rate:** 100% (372/372 passing)  
**Execution Time:** Fast (all tests run in seconds)  
**Test Files:** 14 files  

### Coverage by Category
- Accounting Principles: 37 tests ✅
- Accounts Payable: 32 tests ✅
- A/R Matching: 19 tests ✅
- Bank Import: 21 tests ✅
- Bank Reconciliation: 22 tests ✅
- Batch Operations: 32 tests ✅
- Chart of Accounts: 27 tests ✅
- CSV Export: 21 tests ✅
- Currency Operations: 36 tests ✅
- Expense Operations: 19 tests ✅
- Inventory Operations: 39 tests ✅
- Payroll Operations: 35 tests ✅
- Period Close: 9 tests ✅
- Policy Engine: 23 tests ✅

### Principles Covered
- ✅ Double-Entry Bookkeeping
- ✅ FIFO Payment Allocation
- ✅ Over-Allocation Prevention
- ✅ Server-Side Validation
- ✅ Financial Accuracy
- ✅ Security (Amount Manipulation Detection)
- ✅ Bank Import & Matching Logic
- ✅ Multi-Currency Conversion
- ✅ Inventory FIFO/LIFO
- ✅ Payroll Tax Calculations
- ✅ Period Close Enforcement

---

## Future Enhancements

### Short Term
1. Expand test coverage to 500+ tests
2. Add integration tests for complex workflows
3. Add performance benchmarks for critical operations
4. Increase code coverage metrics

### Long Term
1. Add database integration tests (with mocking or test database)
2. Add UI component tests with Svelte Testing Library
3. Add end-to-end workflow tests
4. Add visual regression testing
5. Set up automated coverage reporting and quality gates

---

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Accounting Best Practices](https://www.aicpa.org/)
- [Double-Entry Bookkeeping](https://en.wikipedia.org/wiki/Double-entry_bookkeeping)
- [Test-Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html)

---

## Support

For questions about the test infrastructure, create an issue in the repository.

**Last Updated:** January 25, 2026  
**Test Status:** ✅ All 372 tests passing
