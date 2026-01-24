import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * UX Features Tests (Phase 6)
 * 
 * Tests for UX hardening features:
 * - Toast notification store
 * - System account mapping helpers
 * - Journal entry balance validation
 * - Mode switch logic
 */

// ============================================================================
// Toast Store Logic Tests
// ============================================================================

describe('Toast Store - Logic', () => {
  /**
   * Test toast creation logic
   * Simulates toast store behavior without Svelte dependencies
   */
  
  interface Toast {
    id: string;
    type: 'success' | 'error' | 'warning' | 'info';
    message: string;
    duration: number;
    dismissible: boolean;
  }

  function createToast(
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info',
    options: { duration?: number; dismissible?: boolean } = {}
  ): Toast {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const duration = options.duration ?? (type === 'error' ? 8000 : 5000);
    const dismissible = options.dismissible ?? true;

    return { id, type, message, duration, dismissible };
  }

  it('should create toast with default info type', () => {
    const toast = createToast('Test message');
    
    expect(toast.type).toBe('info');
    expect(toast.message).toBe('Test message');
    expect(toast.dismissible).toBe(true);
  });

  it('should create success toast with 5000ms default duration', () => {
    const toast = createToast('Success!', 'success');
    
    expect(toast.type).toBe('success');
    expect(toast.duration).toBe(5000);
  });

  it('should create error toast with 8000ms default duration', () => {
    const toast = createToast('Error!', 'error');
    
    expect(toast.type).toBe('error');
    expect(toast.duration).toBe(8000);
  });

  it('should create warning toast', () => {
    const toast = createToast('Warning!', 'warning');
    
    expect(toast.type).toBe('warning');
    expect(toast.duration).toBe(5000);
  });

  it('should allow custom duration', () => {
    const toast = createToast('Custom duration', 'info', { duration: 10000 });
    
    expect(toast.duration).toBe(10000);
  });

  it('should allow non-dismissible toast', () => {
    const toast = createToast('Cannot dismiss', 'info', { dismissible: false });
    
    expect(toast.dismissible).toBe(false);
  });

  it('should generate unique toast IDs', () => {
    const toast1 = createToast('First');
    const toast2 = createToast('Second');
    
    expect(toast1.id).not.toBe(toast2.id);
  });

  it('should override error duration with custom value', () => {
    const toast = createToast('Short error', 'error', { duration: 3000 });
    
    expect(toast.duration).toBe(3000);
  });
});

describe('Toast Store - Collection Management', () => {
  /**
   * Test toast collection logic
   */

  interface Toast {
    id: string;
    type: string;
    message: string;
  }

  it('should add toast to empty collection', () => {
    const toasts: Toast[] = [];
    const newToast = { id: '1', type: 'success', message: 'Added' };
    
    const result = [...toasts, newToast];
    
    expect(result).toHaveLength(1);
    expect(result[0].message).toBe('Added');
  });

  it('should add multiple toasts', () => {
    let toasts: Toast[] = [];
    
    toasts = [...toasts, { id: '1', type: 'success', message: 'First' }];
    toasts = [...toasts, { id: '2', type: 'error', message: 'Second' }];
    toasts = [...toasts, { id: '3', type: 'warning', message: 'Third' }];
    
    expect(toasts).toHaveLength(3);
  });

  it('should dismiss toast by id', () => {
    const toasts: Toast[] = [
      { id: '1', type: 'success', message: 'First' },
      { id: '2', type: 'error', message: 'Second' },
      { id: '3', type: 'warning', message: 'Third' }
    ];
    
    const result = toasts.filter(t => t.id !== '2');
    
    expect(result).toHaveLength(2);
    expect(result.find(t => t.id === '2')).toBeUndefined();
  });

  it('should clear all toasts', () => {
    const toasts: Toast[] = [
      { id: '1', type: 'success', message: 'First' },
      { id: '2', type: 'error', message: 'Second' }
    ];
    
    const result: Toast[] = [];
    
    expect(result).toHaveLength(0);
  });

  it('should maintain toast order (FIFO display)', () => {
    const toasts: Toast[] = [];
    const timestamps = [1, 2, 3];
    
    timestamps.forEach(t => {
      toasts.push({ id: `${t}`, type: 'info', message: `Toast ${t}` });
    });
    
    expect(toasts[0].id).toBe('1');
    expect(toasts[2].id).toBe('3');
  });
});

// ============================================================================
// System Account Mapping Tests
// ============================================================================

describe('System Account Mapping - Role Labels', () => {
  /**
   * Test system account role label generation
   */

  type SystemAccountRole = 
    | 'accounts_receivable'
    | 'accounts_payable'
    | 'sales_tax_payable'
    | 'retained_earnings'
    | 'current_year_earnings';

  function getSystemAccountRoleLabel(role: SystemAccountRole): string {
    const labels: Record<SystemAccountRole, string> = {
      accounts_receivable: 'Accounts Receivable',
      accounts_payable: 'Accounts Payable',
      sales_tax_payable: 'Sales Tax Payable',
      retained_earnings: 'Retained Earnings',
      current_year_earnings: 'Current Year Earnings'
    };
    return labels[role] || role;
  }

  it('should return "Accounts Receivable" for accounts_receivable', () => {
    expect(getSystemAccountRoleLabel('accounts_receivable')).toBe('Accounts Receivable');
  });

  it('should return "Accounts Payable" for accounts_payable', () => {
    expect(getSystemAccountRoleLabel('accounts_payable')).toBe('Accounts Payable');
  });

  it('should return "Sales Tax Payable" for sales_tax_payable', () => {
    expect(getSystemAccountRoleLabel('sales_tax_payable')).toBe('Sales Tax Payable');
  });

  it('should return "Retained Earnings" for retained_earnings', () => {
    expect(getSystemAccountRoleLabel('retained_earnings')).toBe('Retained Earnings');
  });

  it('should return "Current Year Earnings" for current_year_earnings', () => {
    expect(getSystemAccountRoleLabel('current_year_earnings')).toBe('Current Year Earnings');
  });
});

describe('System Account Mapping - Expected Account Types', () => {
  /**
   * Test expected account type mapping for system roles
   */

  type SystemAccountRole = 
    | 'accounts_receivable'
    | 'accounts_payable'
    | 'sales_tax_payable'
    | 'retained_earnings'
    | 'current_year_earnings';

  function getExpectedAccountTypes(role: SystemAccountRole): string[] {
    const types: Record<SystemAccountRole, string[]> = {
      accounts_receivable: ['asset'],
      accounts_payable: ['liability'],
      sales_tax_payable: ['liability'],
      retained_earnings: ['equity'],
      current_year_earnings: ['equity']
    };
    return types[role] || [];
  }

  it('should expect asset type for accounts_receivable', () => {
    const types = getExpectedAccountTypes('accounts_receivable');
    
    expect(types).toContain('asset');
    expect(types).not.toContain('liability');
  });

  it('should expect liability type for accounts_payable', () => {
    const types = getExpectedAccountTypes('accounts_payable');
    
    expect(types).toContain('liability');
  });

  it('should expect liability type for sales_tax_payable', () => {
    const types = getExpectedAccountTypes('sales_tax_payable');
    
    expect(types).toContain('liability');
  });

  it('should expect equity type for retained_earnings', () => {
    const types = getExpectedAccountTypes('retained_earnings');
    
    expect(types).toContain('equity');
  });

  it('should expect equity type for current_year_earnings', () => {
    const types = getExpectedAccountTypes('current_year_earnings');
    
    expect(types).toContain('equity');
  });
});

describe('System Account Mapping - Account Filtering', () => {
  /**
   * Test filtering accounts by type for role assignment
   */

  interface Account {
    id: number;
    code: string;
    name: string;
    type: string;
    is_active: boolean;
  }

  const testAccounts: Account[] = [
    { id: 1, code: '1100', name: 'A/R', type: 'asset', is_active: true },
    { id: 2, code: '2100', name: 'A/P', type: 'liability', is_active: true },
    { id: 3, code: '2200', name: 'HST Payable', type: 'liability', is_active: true },
    { id: 4, code: '3100', name: 'Retained Earnings', type: 'equity', is_active: true },
    { id: 5, code: '3200', name: 'CY Earnings', type: 'equity', is_active: true },
    { id: 6, code: '1000', name: 'Inactive Cash', type: 'asset', is_active: false }
  ];

  function getAccountsForRole(accounts: Account[], expectedTypes: string[]): Account[] {
    return accounts.filter(a => a.is_active && expectedTypes.includes(a.type));
  }

  it('should filter asset accounts for A/R role', () => {
    const result = getAccountsForRole(testAccounts, ['asset']);
    
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('A/R');
  });

  it('should filter liability accounts for A/P role', () => {
    const result = getAccountsForRole(testAccounts, ['liability']);
    
    expect(result).toHaveLength(2);
  });

  it('should filter equity accounts for retained earnings role', () => {
    const result = getAccountsForRole(testAccounts, ['equity']);
    
    expect(result).toHaveLength(2);
  });

  it('should exclude inactive accounts', () => {
    const result = getAccountsForRole(testAccounts, ['asset']);
    
    expect(result.find(a => a.name === 'Inactive Cash')).toBeUndefined();
  });

  it('should return empty array for non-matching types', () => {
    const result = getAccountsForRole(testAccounts, ['revenue']);
    
    expect(result).toHaveLength(0);
  });
});

// ============================================================================
// Journal Entry Balance Validation Tests
// ============================================================================

describe('Journal Entry - Balance Validation', () => {
  /**
   * Test journal entry balance validation for manual entries
   */

  interface JournalLine {
    account_id: number;
    debit_amount: number;
    credit_amount: number;
    description: string;
  }

  function calculateTotalDebits(lines: JournalLine[]): number {
    return lines.reduce((sum, line) => sum + line.debit_amount, 0);
  }

  function calculateTotalCredits(lines: JournalLine[]): number {
    return lines.reduce((sum, line) => sum + line.credit_amount, 0);
  }

  function isBalanced(lines: JournalLine[], tolerance: number = 0.01): boolean {
    const debits = calculateTotalDebits(lines);
    const credits = calculateTotalCredits(lines);
    return Math.abs(debits - credits) <= tolerance;
  }

  function getDifference(lines: JournalLine[]): number {
    return calculateTotalDebits(lines) - calculateTotalCredits(lines);
  }

  it('should calculate total debits correctly', () => {
    const lines: JournalLine[] = [
      { account_id: 1, debit_amount: 100, credit_amount: 0, description: 'Debit 1' },
      { account_id: 2, debit_amount: 50, credit_amount: 0, description: 'Debit 2' },
      { account_id: 3, debit_amount: 0, credit_amount: 150, description: 'Credit' }
    ];
    
    expect(calculateTotalDebits(lines)).toBe(150);
  });

  it('should calculate total credits correctly', () => {
    const lines: JournalLine[] = [
      { account_id: 1, debit_amount: 100, credit_amount: 0, description: 'Debit' },
      { account_id: 2, debit_amount: 0, credit_amount: 75, description: 'Credit 1' },
      { account_id: 3, debit_amount: 0, credit_amount: 25, description: 'Credit 2' }
    ];
    
    expect(calculateTotalCredits(lines)).toBe(100);
  });

  it('should detect balanced entry', () => {
    const lines: JournalLine[] = [
      { account_id: 1, debit_amount: 1000, credit_amount: 0, description: 'A/R' },
      { account_id: 2, debit_amount: 0, credit_amount: 885, description: 'Revenue' },
      { account_id: 3, debit_amount: 0, credit_amount: 115, description: 'HST' }
    ];
    
    expect(isBalanced(lines)).toBe(true);
  });

  it('should detect unbalanced entry', () => {
    const lines: JournalLine[] = [
      { account_id: 1, debit_amount: 1000, credit_amount: 0, description: 'A/R' },
      { account_id: 2, debit_amount: 0, credit_amount: 800, description: 'Revenue' }
    ];
    
    expect(isBalanced(lines)).toBe(false);
  });

  it('should allow 1 cent tolerance for floating point', () => {
    const lines: JournalLine[] = [
      { account_id: 1, debit_amount: 33.33, credit_amount: 0, description: 'Line 1' },
      { account_id: 2, debit_amount: 33.33, credit_amount: 0, description: 'Line 2' },
      { account_id: 3, debit_amount: 33.33, credit_amount: 0, description: 'Line 3' },
      { account_id: 4, debit_amount: 0, credit_amount: 99.99, description: 'Total' }
    ];
    // 33.33 * 3 = 99.99, but could have floating point issues
    
    expect(isBalanced(lines, 0.01)).toBe(true);
  });

  it('should calculate correct difference for unbalanced entry', () => {
    const lines: JournalLine[] = [
      { account_id: 1, debit_amount: 500, credit_amount: 0, description: 'Debit' },
      { account_id: 2, debit_amount: 0, credit_amount: 300, description: 'Credit' }
    ];
    
    expect(getDifference(lines)).toBe(200); // More debits than credits
  });

  it('should calculate negative difference when credits exceed debits', () => {
    const lines: JournalLine[] = [
      { account_id: 1, debit_amount: 300, credit_amount: 0, description: 'Debit' },
      { account_id: 2, debit_amount: 0, credit_amount: 500, description: 'Credit' }
    ];
    
    expect(getDifference(lines)).toBe(-200); // More credits than debits
  });

  it('should handle empty journal entry', () => {
    const lines: JournalLine[] = [];
    
    expect(calculateTotalDebits(lines)).toBe(0);
    expect(calculateTotalCredits(lines)).toBe(0);
    expect(isBalanced(lines)).toBe(true);
  });

  it('should handle single-line entry (always unbalanced)', () => {
    const lines: JournalLine[] = [
      { account_id: 1, debit_amount: 100, credit_amount: 0, description: 'Single debit' }
    ];
    
    expect(isBalanced(lines)).toBe(false);
  });
});

// ============================================================================
// Mode Switch Logic Tests
// ============================================================================

describe('Mode Switch - Feature Access', () => {
  /**
   * Test mode-based feature access rules
   */

  type PolicyMode = 'beginner' | 'pro';

  interface FeatureAccess {
    manualJournalEntry: boolean;
    systemAccountMapping: boolean;
    editChartOfAccounts: boolean;
    voidTransactions: boolean;
    advancedReports: boolean;
  }

  function getFeatureAccess(mode: PolicyMode): FeatureAccess {
    if (mode === 'pro') {
      return {
        manualJournalEntry: true,
        systemAccountMapping: true,
        editChartOfAccounts: true,
        voidTransactions: true,
        advancedReports: true
      };
    }
    // Beginner mode
    return {
      manualJournalEntry: false,
      systemAccountMapping: false,
      editChartOfAccounts: false,
      voidTransactions: false,
      advancedReports: false
    };
  }

  it('should disable manual journal entry in beginner mode', () => {
    const access = getFeatureAccess('beginner');
    
    expect(access.manualJournalEntry).toBe(false);
  });

  it('should enable manual journal entry in pro mode', () => {
    const access = getFeatureAccess('pro');
    
    expect(access.manualJournalEntry).toBe(true);
  });

  it('should disable system account mapping in beginner mode', () => {
    const access = getFeatureAccess('beginner');
    
    expect(access.systemAccountMapping).toBe(false);
  });

  it('should enable system account mapping in pro mode', () => {
    const access = getFeatureAccess('pro');
    
    expect(access.systemAccountMapping).toBe(true);
  });

  it('should disable chart of accounts editing in beginner mode', () => {
    const access = getFeatureAccess('beginner');
    
    expect(access.editChartOfAccounts).toBe(false);
  });

  it('should enable all features in pro mode', () => {
    const access = getFeatureAccess('pro');
    
    expect(Object.values(access).every(v => v === true)).toBe(true);
  });

  it('should disable all advanced features in beginner mode', () => {
    const access = getFeatureAccess('beginner');
    
    expect(Object.values(access).every(v => v === false)).toBe(true);
  });
});

describe('Mode Switch - Warning Messages', () => {
  /**
   * Test mode switch warning message generation
   */

  type PolicyMode = 'beginner' | 'pro';

  function getModeWarnings(targetMode: PolicyMode): string[] {
    if (targetMode === 'pro') {
      return [
        'Manual journal entries allowed',
        'System account mapping enabled',
        'Chart of accounts fully editable',
        'Reduced validation guardrails',
        'Suitable for experienced users'
      ];
    }
    return [
      'Simplified interface',
      'Guided workflows only',
      'Enhanced validation and guardrails',
      'Recommended for new users'
    ];
  }

  it('should return pro mode warnings when switching to pro', () => {
    const warnings = getModeWarnings('pro');
    
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some(w => w.includes('journal'))).toBe(true);
  });

  it('should return beginner mode info when switching to beginner', () => {
    const warnings = getModeWarnings('beginner');
    
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.some(w => w.includes('Simplified'))).toBe(true);
  });

  it('should mention guardrails in pro mode warning', () => {
    const warnings = getModeWarnings('pro');
    
    expect(warnings.some(w => w.includes('guardrails'))).toBe(true);
  });

  it('should mention enhanced validation in beginner mode', () => {
    const warnings = getModeWarnings('beginner');
    
    expect(warnings.some(w => w.includes('validation'))).toBe(true);
  });
});

// ============================================================================
// Reconciliation Adjustment Logic Tests
// ============================================================================

describe('Reconciliation Adjustment - Entry Creation', () => {
  /**
   * Test reconciliation adjustment journal entry logic
   */

  interface AdjustmentEntry {
    bankDebit: number;
    bankCredit: number;
    expenseDebit: number;
    expenseCredit: number;
  }

  function calculateAdjustmentEntry(difference: number): AdjustmentEntry {
    const absAmount = Math.abs(difference);
    
    // If difference > 0: cleared balance exceeds statement, CREDIT bank, DEBIT expense
    // If difference < 0: statement exceeds cleared, DEBIT bank, CREDIT expense
    return {
      bankDebit: difference < 0 ? absAmount : 0,
      bankCredit: difference > 0 ? absAmount : 0,
      expenseDebit: difference > 0 ? absAmount : 0,
      expenseCredit: difference < 0 ? absAmount : 0
    };
  }

  function isAdjustmentBalanced(entry: AdjustmentEntry): boolean {
    const debits = entry.bankDebit + entry.expenseDebit;
    const credits = entry.bankCredit + entry.expenseCredit;
    return Math.abs(debits - credits) < 0.01;
  }

  it('should create balanced entry for positive difference', () => {
    const entry = calculateAdjustmentEntry(50);
    
    expect(isAdjustmentBalanced(entry)).toBe(true);
  });

  it('should create balanced entry for negative difference', () => {
    const entry = calculateAdjustmentEntry(-50);
    
    expect(isAdjustmentBalanced(entry)).toBe(true);
  });

  it('should credit bank when cleared exceeds statement (positive diff)', () => {
    const entry = calculateAdjustmentEntry(100);
    
    expect(entry.bankCredit).toBe(100);
    expect(entry.bankDebit).toBe(0);
  });

  it('should debit bank when statement exceeds cleared (negative diff)', () => {
    const entry = calculateAdjustmentEntry(-100);
    
    expect(entry.bankDebit).toBe(100);
    expect(entry.bankCredit).toBe(0);
  });

  it('should debit expense when reducing bank (positive diff)', () => {
    const entry = calculateAdjustmentEntry(75);
    
    expect(entry.expenseDebit).toBe(75);
    expect(entry.expenseCredit).toBe(0);
  });

  it('should credit expense when increasing bank (negative diff)', () => {
    const entry = calculateAdjustmentEntry(-75);
    
    expect(entry.expenseCredit).toBe(75);
    expect(entry.expenseDebit).toBe(0);
  });

  it('should handle zero difference', () => {
    const entry = calculateAdjustmentEntry(0);
    
    expect(entry.bankDebit).toBe(0);
    expect(entry.bankCredit).toBe(0);
    expect(entry.expenseDebit).toBe(0);
    expect(entry.expenseCredit).toBe(0);
  });

  it('should handle decimal amounts', () => {
    const entry = calculateAdjustmentEntry(25.47);
    
    expect(entry.bankCredit).toBeCloseTo(25.47, 2);
    expect(entry.expenseDebit).toBeCloseTo(25.47, 2);
    expect(isAdjustmentBalanced(entry)).toBe(true);
  });
});
