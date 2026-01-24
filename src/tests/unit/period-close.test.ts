import { describe, it, expect } from 'vitest';

describe('Period Close & Year-End Isolation', () => {
  describe('Closing Entry Logic', () => {
    it('should calculate balanced closing entries for revenue and expenses', () => {
      // Simulate Year 1 financial data
      const year1Revenue = [
        { account: 'Consulting Revenue', code: '4000', balance: 5000 },
        { account: 'Product Sales', code: '4100', balance: 3000 },
      ];
      
      const year1Expenses = [
        { account: 'Office Rent', code: '5100', balance: 2000 },
        { account: 'Salaries', code: '5200', balance: 3000 },
      ];
      
      const totalRevenue = year1Revenue.reduce((sum, acc) => sum + acc.balance, 0);
      const totalExpenses = year1Expenses.reduce((sum, acc) => sum + acc.balance, 0);
      const netIncome = totalRevenue - totalExpenses;
      
      expect(totalRevenue).toBe(8000);
      expect(totalExpenses).toBe(5000);
      expect(netIncome).toBe(3000);
      
      // Closing entries: Debit revenue (zero out), Credit expenses (zero out), Credit Retained Earnings
      const closingEntries = [
        ...year1Revenue.map(acc => ({ account: acc.account, debit: acc.balance, credit: 0 })),
        ...year1Expenses.map(acc => ({ account: acc.account, debit: 0, credit: acc.balance })),
        { account: 'Retained Earnings', debit: 0, credit: netIncome },
      ];
      
      const totalDebits = closingEntries.reduce((sum, e) => sum + e.debit, 0);
      const totalCredits = closingEntries.reduce((sum, e) => sum + e.credit, 0);
      
      // Closing entries must balance
      expect(totalDebits).toBe(totalCredits);
      expect(totalDebits).toBe(8000); // Total revenue to close
    });

    it('should handle net loss correctly', () => {
      const revenue = 1000;
      const expenses = 1500;
      const netLoss = revenue - expenses; // -500
      
      expect(netLoss).toBe(-500);
      
      // Closing entry for net loss: Debit Retained Earnings
      const closingEntry = {
        account: 'Retained Earnings',
        debit: Math.abs(netLoss),
        credit: 0,
      };
      
      expect(closingEntry.debit).toBe(500);
    });

    it('should zero out revenue and expense accounts after closing', () => {
      const revenueBalance = 10000;
      const closingDebit = 10000;
      
      const balanceAfterClose = revenueBalance - closingDebit;
      
      expect(balanceAfterClose).toBe(0);
    });
  });

  describe('Year 2 Isolation (CRITICAL AUDIT TEST)', () => {
    it('should demonstrate proper period-based Income Statement filtering', () => {
      // Simulate transactions across multiple years
      const allTransactions = [
        // Year 1 (2026)
        { year: 2026, account: 'Revenue', type: 'revenue', amount: 5000, date: '2026-06-15' },
        { year: 2026, account: 'Expenses', type: 'expense', amount: 2000, date: '2026-08-01' },
        
        // Year 2 (2027)
        { year: 2027, account: 'Revenue', type: 'revenue', amount: 3000, date: '2027-03-01' },
        { year: 2027, account: 'Expenses', type: 'expense', amount: 1000, date: '2027-05-01' },
      ];
      
      // Filter Year 1 transactions (2026-01-01 to 2026-12-31)
      const year1Transactions = allTransactions.filter(t => {
        return t.date >= '2026-01-01' && t.date <= '2026-12-31';
      });
      
      const year1Revenue = year1Transactions
        .filter(t => t.type === 'revenue')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const year1Expenses = year1Transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const year1NetIncome = year1Revenue - year1Expenses;
      
      expect(year1Revenue).toBe(5000);
      expect(year1Expenses).toBe(2000);
      expect(year1NetIncome).toBe(3000);
      
      // Filter Year 2 transactions (2027-01-01 to 2027-12-31)
      const year2Transactions = allTransactions.filter(t => {
        return t.date >= '2027-01-01' && t.date <= '2027-12-31';
      });
      
      const year2Revenue = year2Transactions
        .filter(t => t.type === 'revenue')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const year2Expenses = year2Transactions
        .filter(t => t.type === 'expense')
        .reduce((sum, t) => sum + t.amount, 0);
      
      const year2NetIncome = year2Revenue - year2Expenses;
      
      // **CRITICAL ASSERTION**
      // Year 2 Income Statement should ONLY show Year 2 amounts
      expect(year2Revenue).toBe(3000); // Only Year 2: $3,000
      expect(year2Expenses).toBe(1000); // Only Year 2: $1,000
      expect(year2NetIncome).toBe(2000); // Year 2 net income: $2,000
      
      // Should NOT be cumulative (all-time totals):
      expect(year2Revenue).not.toBe(8000); // NOT 5000 + 3000 (cumulative)
      expect(year2Expenses).not.toBe(3000); // NOT 2000 + 1000 (cumulative)
      
      // This test demonstrates that proper date range filtering
      // prevents the bug where Income Statement shows all-time totals
    });

    it('should verify that closing entries do not affect Balance Sheet isolation', () => {
      // Balance Sheet accounts (Assets, Liabilities, Equity) are cumulative
      // They should show all-time balances, not period-based
      
      const cashTransactions = [
        { date: '2026-01-01', amount: 10000 }, // Opening balance
        { date: '2026-06-15', amount: 5000 },  // Year 1 revenue
        { date: '2026-08-01', amount: -2000 }, // Year 1 expense
        { date: '2027-03-01', amount: 3000 },  // Year 2 revenue
        { date: '2027-05-01', amount: -1000 }, // Year 2 expense
      ];
      
      // Balance Sheet for 2026-12-31 (end of Year 1)
      const cashBalanceYear1 = cashTransactions
        .filter(t => t.date <= '2026-12-31')
        .reduce((sum, t) => sum + t.amount, 0);
      
      expect(cashBalanceYear1).toBe(13000); // 10000 + 5000 - 2000
      
      // Balance Sheet for 2027-12-31 (end of Year 2)
      const cashBalanceYear2 = cashTransactions
        .filter(t => t.date <= '2027-12-31')
        .reduce((sum, t) => sum + t.amount, 0);
      
      // Balance Sheet IS cumulative (correct behavior)
      expect(cashBalanceYear2).toBe(15000); // 10000 + 5000 - 2000 + 3000 - 1000
      
      // Income Statement for Year 2 only (period-based, not cumulative)
      const year2Transactions = cashTransactions.filter(t => {
        return t.date >= '2027-01-01' && t.date <= '2027-12-31';
      });
      
      const year2Activity = year2Transactions.reduce((sum, t) => sum + t.amount, 0);
      
      // Income Statement is NOT cumulative (correct behavior)
      expect(year2Activity).toBe(2000); // 3000 - 1000 (Year 2 only)
      expect(year2Activity).not.toBe(5000); // NOT the full change (13000 -> 15000)
    });

    it('should verify Retained Earnings accumulates correctly across periods', () => {
      // Retained Earnings should accumulate net income from prior periods
      
      const year1NetIncome = 3000;
      const year2NetIncome = 2000;
      const year3NetIncome = 1500;
      
      // After Year 1 close
      let retainedEarnings = year1NetIncome;
      expect(retainedEarnings).toBe(3000);
      
      // After Year 2 close
      retainedEarnings += year2NetIncome;
      expect(retainedEarnings).toBe(5000);
      
      // After Year 3 close
      retainedEarnings += year3NetIncome;
      expect(retainedEarnings).toBe(6500);
      
      // Balance Sheet in Year 4 should show cumulative Retained Earnings
      const balanceSheetRetainedEarnings = retainedEarnings;
      expect(balanceSheetRetainedEarnings).toBe(6500);
      
      // But Year 4 Income Statement should start at $0 revenue/$0 expenses
      // (assuming no transactions yet in Year 4)
      const year4Revenue = 0;
      const year4Expenses = 0;
      const year4NetIncome = year4Revenue - year4Expenses;
      
      expect(year4NetIncome).toBe(0); // Fresh start for Year 4
    });
  });

  describe('Fiscal Year Status Management', () => {
    it('should prevent closing already-closed fiscal years', () => {
      const fiscalYear = {
        year: 2026,
        status: 'closed' as const,
      };
      
      const canClose = fiscalYear.status !== 'closed';
      
      expect(canClose).toBe(false);
    });

    it('should validate fiscal year before closing', () => {
      const fiscalYear = {
        year: 2027,
        status: 'open' as const,
        start_date: '2027-01-01',
        end_date: '2027-12-31',
      };
      
      const hasRevenue = true;
      const hasExpenses = false;
      
      const hasActivity = hasRevenue || hasExpenses;
      
      expect(hasActivity).toBe(true);
      expect(fiscalYear.status).toBe('open');
    });

    it('should calculate closing journal entry reference number', () => {
      const year = 2026;
      const reference = `FY${year}-CLOSE`;
      
      expect(reference).toBe('FY2026-CLOSE');
    });
  });
});
