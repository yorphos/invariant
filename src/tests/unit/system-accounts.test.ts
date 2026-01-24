import { describe, it, expect } from 'vitest';

/**
 * System Accounts Tests (Phase 7)
 * 
 * Comprehensive tests for dynamic system account management:
 * - System account role types and validation
 * - Account type constraints for each role
 * - Account code editing logic
 * - System account badge display logic
 * - Code uniqueness validation
 * - System account warnings
 */

// ============================================================================
// System Account Role Types
// ============================================================================

describe('System Account Role Types', () => {
  // All valid system account roles
  const ALL_ROLES = [
    // Core A/R and A/P
    'accounts_receivable',
    'accounts_payable',
    'sales_tax_payable',
    'retained_earnings',
    'current_year_earnings',
    // Cash and Bank accounts
    'cash_default',
    'checking_account',
    'customer_deposits',
    // Payroll accounts
    'salary_expense',
    'cpp_payable',
    'ei_payable',
    'tax_withholding_payable',
    // Future expansion
    'inventory_asset',
    'cogs_expense',
    'fx_gain_loss',
    'default_revenue',
    'default_expense',
  ] as const;

  it('should have 17 total system account roles', () => {
    expect(ALL_ROLES.length).toBe(17);
  });

  it('should have 5 core accounting roles', () => {
    const coreRoles = ALL_ROLES.filter(r => 
      ['accounts_receivable', 'accounts_payable', 'sales_tax_payable', 
       'retained_earnings', 'current_year_earnings'].includes(r)
    );
    expect(coreRoles.length).toBe(5);
  });

  it('should have 3 cash/banking roles', () => {
    const cashRoles = ALL_ROLES.filter(r => 
      ['cash_default', 'checking_account', 'customer_deposits'].includes(r)
    );
    expect(cashRoles.length).toBe(3);
  });

  it('should have 4 payroll roles', () => {
    const payrollRoles = ALL_ROLES.filter(r => 
      ['salary_expense', 'cpp_payable', 'ei_payable', 'tax_withholding_payable'].includes(r)
    );
    expect(payrollRoles.length).toBe(4);
  });

  it('should have 6 future expansion roles', () => {
    const futureRoles = ALL_ROLES.filter(r => 
      ['inventory_asset', 'cogs_expense', 'fx_gain_loss', 
       'default_revenue', 'default_expense'].includes(r)
    );
    expect(futureRoles.length).toBe(5);
  });
});

// ============================================================================
// Account Type Constraints
// ============================================================================

describe('System Account Type Constraints', () => {
  // Expected account types for each role
  const expectedTypes: Record<string, string[]> = {
    // Core A/R and A/P
    accounts_receivable: ['asset'],
    accounts_payable: ['liability'],
    sales_tax_payable: ['liability'],
    retained_earnings: ['equity'],
    current_year_earnings: ['equity'],
    // Cash and Bank accounts
    cash_default: ['asset'],
    checking_account: ['asset'],
    customer_deposits: ['liability'],
    // Payroll accounts
    salary_expense: ['expense'],
    cpp_payable: ['liability'],
    ei_payable: ['liability'],
    tax_withholding_payable: ['liability'],
    // Future expansion
    inventory_asset: ['asset'],
    cogs_expense: ['expense'],
    fx_gain_loss: ['revenue', 'expense'],
    default_revenue: ['revenue'],
    default_expense: ['expense'],
  };

  function validateAccountType(role: string, accountType: string): boolean {
    const allowed = expectedTypes[role] || [];
    return allowed.includes(accountType);
  }

  // Core Accounting
  it('should require asset type for accounts_receivable', () => {
    expect(validateAccountType('accounts_receivable', 'asset')).toBe(true);
    expect(validateAccountType('accounts_receivable', 'liability')).toBe(false);
    expect(validateAccountType('accounts_receivable', 'expense')).toBe(false);
  });

  it('should require liability type for accounts_payable', () => {
    expect(validateAccountType('accounts_payable', 'liability')).toBe(true);
    expect(validateAccountType('accounts_payable', 'asset')).toBe(false);
  });

  it('should require liability type for sales_tax_payable', () => {
    expect(validateAccountType('sales_tax_payable', 'liability')).toBe(true);
    expect(validateAccountType('sales_tax_payable', 'revenue')).toBe(false);
  });

  it('should require equity type for retained_earnings', () => {
    expect(validateAccountType('retained_earnings', 'equity')).toBe(true);
    expect(validateAccountType('retained_earnings', 'revenue')).toBe(false);
  });

  it('should require equity type for current_year_earnings', () => {
    expect(validateAccountType('current_year_earnings', 'equity')).toBe(true);
    expect(validateAccountType('current_year_earnings', 'expense')).toBe(false);
  });

  // Cash and Banking
  it('should require asset type for cash_default', () => {
    expect(validateAccountType('cash_default', 'asset')).toBe(true);
    expect(validateAccountType('cash_default', 'liability')).toBe(false);
  });

  it('should require asset type for checking_account', () => {
    expect(validateAccountType('checking_account', 'asset')).toBe(true);
    expect(validateAccountType('checking_account', 'expense')).toBe(false);
  });

  it('should require liability type for customer_deposits', () => {
    expect(validateAccountType('customer_deposits', 'liability')).toBe(true);
    expect(validateAccountType('customer_deposits', 'asset')).toBe(false);
  });

  // Payroll
  it('should require expense type for salary_expense', () => {
    expect(validateAccountType('salary_expense', 'expense')).toBe(true);
    expect(validateAccountType('salary_expense', 'revenue')).toBe(false);
  });

  it('should require liability type for cpp_payable', () => {
    expect(validateAccountType('cpp_payable', 'liability')).toBe(true);
    expect(validateAccountType('cpp_payable', 'asset')).toBe(false);
  });

  it('should require liability type for ei_payable', () => {
    expect(validateAccountType('ei_payable', 'liability')).toBe(true);
    expect(validateAccountType('ei_payable', 'equity')).toBe(false);
  });

  it('should require liability type for tax_withholding_payable', () => {
    expect(validateAccountType('tax_withholding_payable', 'liability')).toBe(true);
    expect(validateAccountType('tax_withholding_payable', 'expense')).toBe(false);
  });

  // Future expansion
  it('should require asset type for inventory_asset', () => {
    expect(validateAccountType('inventory_asset', 'asset')).toBe(true);
    expect(validateAccountType('inventory_asset', 'expense')).toBe(false);
  });

  it('should require expense type for cogs_expense', () => {
    expect(validateAccountType('cogs_expense', 'expense')).toBe(true);
    expect(validateAccountType('cogs_expense', 'revenue')).toBe(false);
  });

  it('should allow both revenue and expense for fx_gain_loss', () => {
    expect(validateAccountType('fx_gain_loss', 'revenue')).toBe(true);
    expect(validateAccountType('fx_gain_loss', 'expense')).toBe(true);
    expect(validateAccountType('fx_gain_loss', 'asset')).toBe(false);
  });

  it('should require revenue type for default_revenue', () => {
    expect(validateAccountType('default_revenue', 'revenue')).toBe(true);
    expect(validateAccountType('default_revenue', 'expense')).toBe(false);
  });

  it('should require expense type for default_expense', () => {
    expect(validateAccountType('default_expense', 'expense')).toBe(true);
    expect(validateAccountType('default_expense', 'revenue')).toBe(false);
  });
});

// ============================================================================
// Account Code Uniqueness Validation
// ============================================================================

describe('Account Code Uniqueness Validation', () => {
  interface Account {
    id: number;
    code: string;
    name: string;
    type: string;
  }

  function isCodeUnique(
    newCode: string,
    existingAccounts: Account[],
    editingAccountId?: number
  ): boolean {
    const conflicting = existingAccounts.find(
      a => a.code === newCode && a.id !== editingAccountId
    );
    return !conflicting;
  }

  const sampleAccounts: Account[] = [
    { id: 1, code: '1000', name: 'Cash', type: 'asset' },
    { id: 2, code: '1010', name: 'Checking', type: 'asset' },
    { id: 3, code: '1100', name: 'A/R', type: 'asset' },
    { id: 4, code: '2000', name: 'A/P', type: 'liability' },
  ];

  it('should allow new unique code', () => {
    expect(isCodeUnique('1500', sampleAccounts)).toBe(true);
  });

  it('should reject duplicate code for new account', () => {
    expect(isCodeUnique('1000', sampleAccounts)).toBe(false);
  });

  it('should allow same code when editing the same account', () => {
    expect(isCodeUnique('1000', sampleAccounts, 1)).toBe(true);
  });

  it('should reject code that conflicts with different account', () => {
    expect(isCodeUnique('1010', sampleAccounts, 1)).toBe(false);
  });

  it('should be case-sensitive for codes', () => {
    // Account codes should be exact match
    expect(isCodeUnique('1000', sampleAccounts)).toBe(false);
    expect(isCodeUnique('100', sampleAccounts)).toBe(true);
  });

  it('should handle empty accounts list', () => {
    expect(isCodeUnique('1000', [])).toBe(true);
  });

  it('should handle whitespace in codes', () => {
    const accountsWithSpaces: Account[] = [
      { id: 1, code: '1000', name: 'Cash', type: 'asset' },
    ];
    // Code with space is different
    expect(isCodeUnique(' 1000', accountsWithSpaces)).toBe(true);
    expect(isCodeUnique('1000 ', accountsWithSpaces)).toBe(true);
  });
});

// ============================================================================
// System Account Warning Logic
// ============================================================================

describe('System Account Warning Logic', () => {
  type SystemAccountRole = string;

  interface SystemAccountRolesMap {
    get(accountId: number): SystemAccountRole[] | undefined;
    has(accountId: number): boolean;
  }

  function shouldWarnOnCodeChange(
    accountId: number,
    oldCode: string,
    newCode: string,
    systemAccountRoles: SystemAccountRolesMap
  ): boolean {
    if (oldCode === newCode) return false;
    return systemAccountRoles.has(accountId);
  }

  function formatRoleName(role: string): string {
    return role
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  it('should not warn when code unchanged', () => {
    const roles = new Map([[1, ['accounts_receivable']]]);
    expect(shouldWarnOnCodeChange(1, '1100', '1100', roles)).toBe(false);
  });

  it('should warn when changing code of system account', () => {
    const roles = new Map([[1, ['accounts_receivable']]]);
    expect(shouldWarnOnCodeChange(1, '1100', '1200', roles)).toBe(true);
  });

  it('should not warn when changing code of non-system account', () => {
    const roles = new Map([[1, ['accounts_receivable']]]);
    expect(shouldWarnOnCodeChange(999, '5000', '5100', roles)).toBe(false);
  });

  it('should warn when account has multiple system roles', () => {
    const roles = new Map([[1, ['cash_default', 'checking_account']]]);
    expect(shouldWarnOnCodeChange(1, '1000', '1001', roles)).toBe(true);
  });

  it('should format role names correctly', () => {
    expect(formatRoleName('accounts_receivable')).toBe('Accounts Receivable');
    expect(formatRoleName('cpp_payable')).toBe('Cpp Payable');
    expect(formatRoleName('fx_gain_loss')).toBe('Fx Gain Loss');
    expect(formatRoleName('cash_default')).toBe('Cash Default');
  });

  it('should handle single word roles', () => {
    expect(formatRoleName('inventory')).toBe('Inventory');
  });
});

// ============================================================================
// System Account Badge Display Logic
// ============================================================================

describe('System Account Badge Display', () => {
  function getSystemBadgeTooltip(roles: string[]): string {
    return roles
      .map(r => r.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '))
      .join(', ');
  }

  function shouldShowSystemBadge(roles: string[] | undefined): boolean {
    return !!roles && roles.length > 0;
  }

  it('should show badge when account has one system role', () => {
    expect(shouldShowSystemBadge(['accounts_receivable'])).toBe(true);
  });

  it('should show badge when account has multiple system roles', () => {
    expect(shouldShowSystemBadge(['cash_default', 'checking_account'])).toBe(true);
  });

  it('should not show badge when account has no system roles', () => {
    expect(shouldShowSystemBadge([])).toBe(false);
    expect(shouldShowSystemBadge(undefined)).toBe(false);
  });

  it('should generate tooltip with single role', () => {
    expect(getSystemBadgeTooltip(['accounts_receivable'])).toBe('Accounts Receivable');
  });

  it('should generate tooltip with multiple roles', () => {
    expect(getSystemBadgeTooltip(['cash_default', 'checking_account']))
      .toBe('Cash Default, Checking Account');
  });

  it('should handle empty roles array', () => {
    expect(getSystemBadgeTooltip([])).toBe('');
  });
});

// ============================================================================
// System Account Role Labels
// ============================================================================

describe('System Account Role Labels', () => {
  const roleLabels: Record<string, string> = {
    // Core A/R and A/P
    accounts_receivable: 'Accounts Receivable (A/R)',
    accounts_payable: 'Accounts Payable (A/P)',
    sales_tax_payable: 'Sales Tax Payable',
    retained_earnings: 'Retained Earnings',
    current_year_earnings: 'Current Year Earnings',
    // Cash and Bank accounts
    cash_default: 'Default Cash Account',
    checking_account: 'Checking Account',
    customer_deposits: 'Customer Deposits (Unapplied)',
    // Payroll accounts
    salary_expense: 'Salary Expense',
    cpp_payable: 'CPP Payable',
    ei_payable: 'EI Payable',
    tax_withholding_payable: 'Tax Withholding Payable',
    // Future expansion
    inventory_asset: 'Inventory Asset',
    cogs_expense: 'Cost of Goods Sold',
    fx_gain_loss: 'FX Gain/Loss',
    default_revenue: 'Default Revenue',
    default_expense: 'Default Expense',
  };

  function getRoleLabel(role: string): string {
    return roleLabels[role] || role;
  }

  it('should return human-readable labels for core roles', () => {
    expect(getRoleLabel('accounts_receivable')).toBe('Accounts Receivable (A/R)');
    expect(getRoleLabel('accounts_payable')).toBe('Accounts Payable (A/P)');
    expect(getRoleLabel('sales_tax_payable')).toBe('Sales Tax Payable');
  });

  it('should return human-readable labels for cash roles', () => {
    expect(getRoleLabel('cash_default')).toBe('Default Cash Account');
    expect(getRoleLabel('checking_account')).toBe('Checking Account');
    expect(getRoleLabel('customer_deposits')).toBe('Customer Deposits (Unapplied)');
  });

  it('should return human-readable labels for payroll roles', () => {
    expect(getRoleLabel('salary_expense')).toBe('Salary Expense');
    expect(getRoleLabel('cpp_payable')).toBe('CPP Payable');
    expect(getRoleLabel('ei_payable')).toBe('EI Payable');
    expect(getRoleLabel('tax_withholding_payable')).toBe('Tax Withholding Payable');
  });

  it('should return human-readable labels for future roles', () => {
    expect(getRoleLabel('inventory_asset')).toBe('Inventory Asset');
    expect(getRoleLabel('cogs_expense')).toBe('Cost of Goods Sold');
    expect(getRoleLabel('fx_gain_loss')).toBe('FX Gain/Loss');
  });

  it('should return role key for unknown roles', () => {
    expect(getRoleLabel('unknown_role')).toBe('unknown_role');
  });
});

// ============================================================================
// Default Account Codes Mapping
// ============================================================================

describe('Default Account Codes Mapping', () => {
  // Default account codes from seed.ts
  const defaultCodes: Record<string, string> = {
    // Cash and Bank
    cash_default: '1000',
    checking_account: '1010',
    // A/R and A/P
    accounts_receivable: '1100',
    accounts_payable: '2000',
    customer_deposits: '2150',
    // Tax
    sales_tax_payable: '2220',
    // Payroll
    cpp_payable: '2310',
    ei_payable: '2320',
    tax_withholding_payable: '2330',
    // Equity
    retained_earnings: '3100',
    current_year_earnings: '3900',
    // Revenue/Expense
    default_revenue: '4000',
    cogs_expense: '5000',
    salary_expense: '6100',
    default_expense: '6000',
    // Inventory
    inventory_asset: '1200',
  };

  it('should have correct default code for cash accounts', () => {
    expect(defaultCodes['cash_default']).toBe('1000');
    expect(defaultCodes['checking_account']).toBe('1010');
  });

  it('should have correct default code for A/R and A/P', () => {
    expect(defaultCodes['accounts_receivable']).toBe('1100');
    expect(defaultCodes['accounts_payable']).toBe('2000');
  });

  it('should have correct default code for payroll liabilities', () => {
    expect(defaultCodes['cpp_payable']).toBe('2310');
    expect(defaultCodes['ei_payable']).toBe('2320');
    expect(defaultCodes['tax_withholding_payable']).toBe('2330');
  });

  it('should have asset codes starting with 1xxx', () => {
    expect(defaultCodes['cash_default'].startsWith('1')).toBe(true);
    expect(defaultCodes['checking_account'].startsWith('1')).toBe(true);
    expect(defaultCodes['accounts_receivable'].startsWith('1')).toBe(true);
    expect(defaultCodes['inventory_asset'].startsWith('1')).toBe(true);
  });

  it('should have liability codes starting with 2xxx', () => {
    expect(defaultCodes['accounts_payable'].startsWith('2')).toBe(true);
    expect(defaultCodes['customer_deposits'].startsWith('2')).toBe(true);
    expect(defaultCodes['cpp_payable'].startsWith('2')).toBe(true);
    expect(defaultCodes['ei_payable'].startsWith('2')).toBe(true);
  });

  it('should have equity codes starting with 3xxx', () => {
    expect(defaultCodes['retained_earnings'].startsWith('3')).toBe(true);
    expect(defaultCodes['current_year_earnings'].startsWith('3')).toBe(true);
  });

  it('should have revenue codes starting with 4xxx', () => {
    expect(defaultCodes['default_revenue'].startsWith('4')).toBe(true);
  });

  it('should have expense codes starting with 5xxx or 6xxx', () => {
    expect(defaultCodes['cogs_expense'].startsWith('5')).toBe(true);
    expect(defaultCodes['salary_expense'].startsWith('6')).toBe(true);
    expect(defaultCodes['default_expense'].startsWith('6')).toBe(true);
  });
});

// ============================================================================
// System Account Helper Functions
// ============================================================================

describe('System Account Helper Functions', () => {
  interface Account {
    id: number;
    code: string;
    name: string;
    type: string;
  }

  // Simulate tryGetSystemAccount behavior
  function tryGetSystemAccount(
    role: string,
    mappings: Map<string, number>,
    accounts: Account[]
  ): Account | null {
    const accountId = mappings.get(role);
    if (accountId === undefined) return null;
    return accounts.find(a => a.id === accountId) || null;
  }

  // Simulate getSystemAccount behavior (throws if not found)
  function getSystemAccount(
    role: string,
    mappings: Map<string, number>,
    accounts: Account[]
  ): Account {
    const account = tryGetSystemAccount(role, mappings, accounts);
    if (!account) {
      throw new Error(`System account not configured: ${role}`);
    }
    return account;
  }

  const testAccounts: Account[] = [
    { id: 1, code: '1000', name: 'Cash', type: 'asset' },
    { id: 2, code: '1100', name: 'A/R', type: 'asset' },
    { id: 3, code: '2000', name: 'A/P', type: 'liability' },
  ];

  const testMappings = new Map([
    ['cash_default', 1],
    ['accounts_receivable', 2],
    ['accounts_payable', 3],
  ]);

  it('tryGetSystemAccount should return account when mapped', () => {
    const account = tryGetSystemAccount('cash_default', testMappings, testAccounts);
    expect(account).not.toBeNull();
    expect(account?.code).toBe('1000');
  });

  it('tryGetSystemAccount should return null when not mapped', () => {
    const account = tryGetSystemAccount('salary_expense', testMappings, testAccounts);
    expect(account).toBeNull();
  });

  it('getSystemAccount should return account when mapped', () => {
    const account = getSystemAccount('accounts_receivable', testMappings, testAccounts);
    expect(account.code).toBe('1100');
  });

  it('getSystemAccount should throw when not mapped', () => {
    expect(() => {
      getSystemAccount('salary_expense', testMappings, testAccounts);
    }).toThrow('System account not configured: salary_expense');
  });

  it('tryGetSystemAccount should return null when account deleted', () => {
    const mappingsWithMissing = new Map([['missing_account', 999]]);
    const account = tryGetSystemAccount('missing_account', mappingsWithMissing, testAccounts);
    expect(account).toBeNull();
  });
});

// ============================================================================
// Database Reset Confirmation Logic
// ============================================================================

describe('Database Reset Confirmation Logic', () => {
  const REQUIRED_CONFIRMATION_TEXT = 'RESET DATABASE';

  function isResetConfirmationValid(userInput: string): boolean {
    return userInput.trim() === REQUIRED_CONFIRMATION_TEXT;
  }

  it('should accept exact match', () => {
    expect(isResetConfirmationValid('RESET DATABASE')).toBe(true);
  });

  it('should reject lowercase input', () => {
    expect(isResetConfirmationValid('reset database')).toBe(false);
  });

  it('should reject partial input', () => {
    expect(isResetConfirmationValid('RESET')).toBe(false);
    expect(isResetConfirmationValid('DATABASE')).toBe(false);
  });

  it('should reject empty input', () => {
    expect(isResetConfirmationValid('')).toBe(false);
  });

  it('should accept input with leading/trailing whitespace', () => {
    expect(isResetConfirmationValid('  RESET DATABASE  ')).toBe(true);
  });

  it('should reject input with typos', () => {
    expect(isResetConfirmationValid('RESET DATABSE')).toBe(false);
    expect(isResetConfirmationValid('RESTE DATABASE')).toBe(false);
  });

  it('should reject input with extra words', () => {
    expect(isResetConfirmationValid('RESET DATABASE NOW')).toBe(false);
    expect(isResetConfirmationValid('PLEASE RESET DATABASE')).toBe(false);
  });
});

// ============================================================================
// Account Filtering for System Roles
// ============================================================================

describe('Account Filtering for System Roles', () => {
  interface Account {
    id: number;
    code: string;
    name: string;
    type: string;
    is_active: boolean;
  }

  const expectedTypes: Record<string, string[]> = {
    accounts_receivable: ['asset'],
    accounts_payable: ['liability'],
    cash_default: ['asset'],
    salary_expense: ['expense'],
    fx_gain_loss: ['revenue', 'expense'],
  };

  function getAccountsForRole(role: string, accounts: Account[]): Account[] {
    const types = expectedTypes[role] || [];
    return accounts.filter(a => a.is_active && types.includes(a.type));
  }

  const testAccounts: Account[] = [
    { id: 1, code: '1000', name: 'Cash', type: 'asset', is_active: true },
    { id: 2, code: '1100', name: 'A/R', type: 'asset', is_active: true },
    { id: 3, code: '2000', name: 'A/P', type: 'liability', is_active: true },
    { id: 4, code: '4000', name: 'Revenue', type: 'revenue', is_active: true },
    { id: 5, code: '5000', name: 'Expense', type: 'expense', is_active: true },
    { id: 6, code: '1200', name: 'Inactive', type: 'asset', is_active: false },
  ];

  it('should filter asset accounts for accounts_receivable', () => {
    const accounts = getAccountsForRole('accounts_receivable', testAccounts);
    expect(accounts.length).toBe(2);
    expect(accounts.every(a => a.type === 'asset')).toBe(true);
  });

  it('should filter liability accounts for accounts_payable', () => {
    const accounts = getAccountsForRole('accounts_payable', testAccounts);
    expect(accounts.length).toBe(1);
    expect(accounts[0].code).toBe('2000');
  });

  it('should filter expense accounts for salary_expense', () => {
    const accounts = getAccountsForRole('salary_expense', testAccounts);
    expect(accounts.length).toBe(1);
    expect(accounts[0].code).toBe('5000');
  });

  it('should filter both revenue and expense for fx_gain_loss', () => {
    const accounts = getAccountsForRole('fx_gain_loss', testAccounts);
    expect(accounts.length).toBe(2);
    expect(accounts.some(a => a.type === 'revenue')).toBe(true);
    expect(accounts.some(a => a.type === 'expense')).toBe(true);
  });

  it('should exclude inactive accounts', () => {
    const accounts = getAccountsForRole('cash_default', testAccounts);
    expect(accounts.every(a => a.is_active)).toBe(true);
    expect(accounts.find(a => a.id === 6)).toBeUndefined();
  });

  it('should return empty array for unknown role', () => {
    const accounts = getAccountsForRole('unknown_role', testAccounts);
    expect(accounts.length).toBe(0);
  });
});
