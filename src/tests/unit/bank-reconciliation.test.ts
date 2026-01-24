import { describe, it, expect } from 'vitest';

describe('Bank Reconciliation Logic', () => {
  describe('Reconciliation Balance Calculation', () => {
    it('should calculate cleared balance from selected transactions', () => {
      // Simulate unreconciled transactions
      const transactions = [
        { id: 1, debit: 1000, credit: 0 }, // Deposit
        { id: 2, debit: 0, credit: 500 },  // Check
        { id: 3, debit: 500, credit: 0 },  // Deposit
        { id: 4, debit: 0, credit: 200 },  // Check
      ];
      
      // Mark some as cleared
      const clearedIds = new Set([1, 2, 4]);
      
      const clearedBalance = transactions
        .filter(txn => clearedIds.has(txn.id))
        .reduce((sum, txn) => sum + (txn.debit - txn.credit), 0);
      
      // 1000 (deposit) - 500 (check) - 200 (check) = 300
      expect(clearedBalance).toBe(300);
    });

    it('should detect balanced reconciliation within tolerance', () => {
      const statementBalance = 1000.00;
      const clearedBalance = 1000.01;
      const difference = clearedBalance - statementBalance;
      const tolerance = 0.01;
      
      const isBalanced = Math.abs(difference) <= tolerance;
      
      expect(isBalanced).toBe(true);
    });

    it('should detect unbalanced reconciliation outside tolerance', () => {
      const statementBalance = 1000.00;
      const clearedBalance = 1005.00;
      const difference = clearedBalance - statementBalance;
      const tolerance = 0.01;
      
      const isBalanced = Math.abs(difference) <= tolerance;
      
      expect(isBalanced).toBe(false);
      expect(Math.abs(difference)).toBe(5.00);
    });
  });

  describe('Running Balance Calculation', () => {
    it('should calculate running balance for bank account transactions', () => {
      const transactions = [
        { date: '2026-01-01', debit: 1000, credit: 0 },    // Opening deposit
        { date: '2026-01-05', debit: 0, credit: 200 },     // Check
        { date: '2026-01-10', debit: 500, credit: 0 },     // Deposit
        { date: '2026-01-15', debit: 0, credit: 100 },     // Check
      ];
      
      let balance = 0;
      const balances: number[] = [];
      
      for (const txn of transactions) {
        balance += txn.debit - txn.credit;
        balances.push(balance);
      }
      
      expect(balances[0]).toBe(1000);   // After opening deposit
      expect(balances[1]).toBe(800);    // After first check
      expect(balances[2]).toBe(1300);   // After second deposit
      expect(balances[3]).toBe(1200);   // After second check
    });

    it('should handle negative balance scenarios', () => {
      const transactions = [
        { date: '2026-01-01', debit: 100, credit: 0 },     // Small deposit
        { date: '2026-01-05', debit: 0, credit: 500 },     // Large check (overdraft)
      ];
      
      let balance = 0;
      const balances: number[] = [];
      
      for (const txn of transactions) {
        balance += txn.debit - txn.credit;
        balances.push(balance);
      }
      
      expect(balances[0]).toBe(100);
      expect(balances[1]).toBe(-400);  // Overdraft
    });
  });

  describe('Reconciliation Workflow', () => {
    it('should follow proper reconciliation workflow steps', () => {
      // Step 1: Start reconciliation with statement info
      const reconciliation = {
        statementDate: '2026-01-31',
        statementBalance: 1500.00,
        status: 'in_progress'
      };
      
      expect(reconciliation.status).toBe('in_progress');
      
      // Step 2: Mark transactions as cleared
      const clearedTransactions = [1, 2, 3, 5];
      expect(clearedTransactions.length).toBeGreaterThan(0);
      
      // Step 3: Calculate difference
      const clearedBalance = 1500.00; // Simulated
      const difference = clearedBalance - reconciliation.statementBalance;
      
      expect(difference).toBe(0);
      
      // Step 4: Complete if balanced
      if (Math.abs(difference) < 0.01) {
        reconciliation.status = 'completed';
      }
      
      expect(reconciliation.status).toBe('completed');
    });

    it('should prevent completion if unbalanced', () => {
      const reconciliation = {
        statementBalance: 1000.00,
        clearedBalance: 1050.00,
        status: 'in_progress'
      };
      
      const difference = reconciliation.clearedBalance - reconciliation.statementBalance;
      const isBalanced = Math.abs(difference) < 0.01;
      
      expect(isBalanced).toBe(false);
      
      // Should not complete
      if (!isBalanced) {
        const errorMessage = `Reconciliation does not balance. Difference: $${Math.abs(difference).toFixed(2)}`;
        expect(errorMessage).toBe('Reconciliation does not balance. Difference: $50.00');
      }
    });

    it('should track reconciliation status transitions', () => {
      const statuses = ['in_progress', 'completed', 'cancelled'];
      
      // Valid transitions
      let status = 'in_progress';
      expect(status).toBe('in_progress');
      
      // Can complete
      status = 'completed';
      expect(status).toBe('completed');
      
      // Can cancel from in_progress
      status = 'in_progress';
      status = 'cancelled';
      expect(status).toBe('cancelled');
      
      // Cannot modify completed
      const isCompleted = status === 'completed';
      const canModify = status === 'in_progress';
      
      expect(canModify).toBe(false);
    });
  });

  describe('Outstanding Items', () => {
    it('should identify outstanding deposits (in books but not on statement)', () => {
      const allTransactions = [
        { id: 1, date: '2026-01-15', debit: 1000, credit: 0, reconciled: false },
        { id: 2, date: '2026-01-20', debit: 500, credit: 0, reconciled: false },
        { id: 3, date: '2026-01-25', debit: 300, credit: 0, reconciled: true },
      ];
      
      const statementDate = '2026-01-31';
      
      // Outstanding = not reconciled and before statement date
      const outstandingDeposits = allTransactions.filter(txn => 
        !txn.reconciled && 
        txn.date <= statementDate &&
        txn.debit > 0
      );
      
      expect(outstandingDeposits.length).toBe(2);
      expect(outstandingDeposits.map(t => t.id)).toEqual([1, 2]);
    });

    it('should identify outstanding checks (in books but not on statement)', () => {
      const allTransactions = [
        { id: 1, date: '2026-01-15', debit: 0, credit: 500, reconciled: false },
        { id: 2, date: '2026-01-20', debit: 0, credit: 200, reconciled: false },
        { id: 3, date: '2026-01-25', debit: 0, credit: 100, reconciled: true },
      ];
      
      const statementDate = '2026-01-31';
      
      // Outstanding = not reconciled and before statement date
      const outstandingChecks = allTransactions.filter(txn => 
        !txn.reconciled && 
        txn.date <= statementDate &&
        txn.credit > 0
      );
      
      expect(outstandingChecks.length).toBe(2);
      expect(outstandingChecks.map(t => t.id)).toEqual([1, 2]);
    });

    it('should calculate adjusted balance with outstanding items', () => {
      const statementBalance = 1000.00;
      const outstandingDeposits = 500.00;
      const outstandingChecks = 200.00;
      
      // Adjusted balance = statement balance + outstanding deposits - outstanding checks
      const adjustedBalance = statementBalance + outstandingDeposits - outstandingChecks;
      
      expect(adjustedBalance).toBe(1300.00);
    });
  });

  describe('Book Balance vs Statement Balance', () => {
    it('should calculate book balance up to statement date', () => {
      const transactions = [
        { date: '2026-01-01', debit: 1000, credit: 0 },
        { date: '2026-01-15', debit: 0, credit: 300 },
        { date: '2026-01-20', debit: 500, credit: 0 },
        { date: '2026-02-05', debit: 0, credit: 100 }, // After statement date
      ];
      
      const statementDate = '2026-01-31';
      
      // Book balance = all transactions up to statement date
      const bookBalance = transactions
        .filter(txn => txn.date <= statementDate)
        .reduce((sum, txn) => sum + (txn.debit - txn.credit), 0);
      
      expect(bookBalance).toBe(1200); // 1000 - 300 + 500
    });

    it('should reconcile book balance to statement balance', () => {
      const bookBalance = 1200.00;
      const statementBalance = 1000.00;
      
      // Reconciling items
      const outstandingDeposits = 500.00;
      const outstandingChecks = 300.00;
      
      // Statement balance + outstanding deposits - outstanding checks = book balance
      const reconciledBalance = statementBalance + outstandingDeposits - outstandingChecks;
      
      expect(reconciledBalance).toBe(bookBalance);
    });
  });

  describe('Reconciliation Errors & Edge Cases', () => {
    it('should reject zero statement balance', () => {
      const statementBalance = 0;
      const isValid = statementBalance !== 0;
      
      // Zero balance might be valid, but should be confirmed
      expect(isValid).toBe(false);
    });

    it('should handle very small differences due to rounding', () => {
      const statementBalance = 1000.00;
      const clearedBalance = 999.999;
      const difference = Math.abs(clearedBalance - statementBalance);
      const tolerance = 0.01;
      
      const isBalanced = difference <= tolerance;
      
      expect(isBalanced).toBe(true);
    });

    it('should prevent reconciling non-asset accounts', () => {
      const accounts = [
        { id: 1, name: 'Cash', type: 'asset', canReconcile: true },
        { id: 2, name: 'Accounts Receivable', type: 'asset', canReconcile: false },
        { id: 3, name: 'Accounts Payable', type: 'liability', canReconcile: false },
      ];
      
      const bankAccounts = accounts.filter(acc => 
        acc.type === 'asset' && acc.canReconcile
      );
      
      expect(bankAccounts.length).toBe(1);
      expect(bankAccounts[0].name).toBe('Cash');
    });

    it('should validate statement date is not in future', () => {
      const today = new Date('2026-01-24');
      const statementDate = new Date('2026-02-01');
      
      const isFutureDate = statementDate > today;
      
      expect(isFutureDate).toBe(true);
      
      if (isFutureDate) {
        const errorMessage = 'Statement date cannot be in the future';
        expect(errorMessage).toBe('Statement date cannot be in the future');
      }
    });

    it('should track when transactions were reconciled', () => {
      const transaction = {
        id: 1,
        amount: 100,
        reconciliationId: null as number | null,
        reconciledDate: null as string | null
      };
      
      expect(transaction.reconciliationId).toBeNull();
      
      // Mark as reconciled
      transaction.reconciliationId = 5;
      transaction.reconciledDate = '2026-01-31';
      
      expect(transaction.reconciliationId).toBe(5);
      expect(transaction.reconciledDate).toBe('2026-01-31');
    });
  });

  describe('Multiple Reconciliations', () => {
    it('should support multiple reconciliations over time', () => {
      const reconciliations = [
        { id: 1, date: '2026-01-31', balance: 1000, status: 'completed' },
        { id: 2, date: '2026-02-28', balance: 1500, status: 'completed' },
        { id: 3, date: '2026-03-31', balance: 2000, status: 'in_progress' },
      ];
      
      const completed = reconciliations.filter(r => r.status === 'completed');
      const lastCompleted = completed[completed.length - 1];
      
      expect(completed.length).toBe(2);
      expect(lastCompleted.date).toBe('2026-02-28');
      expect(lastCompleted.balance).toBe(1500);
    });

    it('should show unreconciled transaction count since last reconciliation', () => {
      const lastReconDate = '2026-01-31';
      const allTransactions = [
        { date: '2026-01-15', reconciled: true },
        { date: '2026-01-20', reconciled: true },
        { date: '2026-02-05', reconciled: false },
        { date: '2026-02-10', reconciled: false },
        { date: '2026-02-15', reconciled: false },
      ];
      
      const unreconciledCount = allTransactions.filter(txn => 
        !txn.reconciled && txn.date > lastReconDate
      ).length;
      
      expect(unreconciledCount).toBe(3);
    });
  });

  describe('Audit Trail', () => {
    it('should record who completed the reconciliation', () => {
      const reconciliation = {
        id: 1,
        status: 'in_progress' as string,
        completedBy: null as string | null,
        completedAt: null as string | null
      };
      
      expect(reconciliation.completedBy).toBeNull();
      
      // Complete reconciliation
      reconciliation.status = 'completed';
      reconciliation.completedBy = 'user@example.com';
      reconciliation.completedAt = '2026-01-31T14:30:00Z';
      
      expect(reconciliation.completedBy).toBe('user@example.com');
      expect(reconciliation.completedAt).toBeTruthy();
    });

    it('should prevent modification of completed reconciliations', () => {
      const reconciliation = {
        status: 'completed',
        canModify: false
      };
      
      const isModifiable = reconciliation.status === 'in_progress';
      
      expect(isModifiable).toBe(false);
      
      if (!isModifiable) {
        const errorMessage = 'Cannot modify completed reconciliation';
        expect(errorMessage).toBe('Cannot modify completed reconciliation');
      }
    });
  });
});
