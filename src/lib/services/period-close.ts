/**
 * Period Close Service
 * 
 * Handles fiscal year closing process:
 * - Generates closing journal entries
 * - Zeros out revenue and expense accounts
 * - Transfers net income to Retained Earnings
 * - Marks fiscal year as closed
 */

import { getDatabase } from './database';
import { getSystemAccountId } from './system-accounts';
import { persistenceService } from './persistence';
import type { PolicyContext } from '../domain/types';

export interface FiscalYear {
  id: number;
  year: number;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
  closed_at?: string;
  closed_by?: string;
  closing_journal_entry_id?: number;
  created_at: string;
  updated_at: string;
}

export interface FiscalPeriod {
  id: number;
  fiscal_year_id: number;
  period_number: number;
  period_name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
  closed_at?: string;
  closed_by?: string;
  created_at: string;
  updated_at: string;
}

export interface ClosingEntry {
  account_id: number;
  account_code: string;
  account_name: string;
  debit_amount: number;
  credit_amount: number;
  description: string;
}

/**
 * Get all fiscal years
 */
export async function getFiscalYears(): Promise<FiscalYear[]> {
  const db = await getDatabase();
  return db.select<FiscalYear[]>(
    'SELECT * FROM fiscal_year ORDER BY year DESC'
  );
}

/**
 * Get fiscal year by year number
 */
export async function getFiscalYear(year: number): Promise<FiscalYear | null> {
  const db = await getDatabase();
  const results = await db.select<FiscalYear[]>(
    'SELECT * FROM fiscal_year WHERE year = ? LIMIT 1',
    [year]
  );
  return results[0] || null;
}

/**
 * Create a new fiscal year
 */
export async function createFiscalYear(year: number): Promise<number> {
  const db = await getDatabase();
  
  // Check if year already exists
  const existing = await getFiscalYear(year);
  if (existing) {
    throw new Error(`Fiscal year ${year} already exists`);
  }
  
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;
  
  const result = await db.execute(
    `INSERT INTO fiscal_year (year, start_date, end_date, status)
     VALUES (?, ?, ?, 'open')`,
    [year, startDate, endDate]
  );
  
  const fiscalYearId = result.lastInsertId;
  
  if (!fiscalYearId) {
    throw new Error('Failed to create fiscal year');
  }
  
  // Create 12 monthly periods
  const months = [
    { num: 1, name: 'January', days: 31 },
    { num: 2, name: 'February', days: 28 }, // Simplified - doesn't handle leap years
    { num: 3, name: 'March', days: 31 },
    { num: 4, name: 'April', days: 30 },
    { num: 5, name: 'May', days: 31 },
    { num: 6, name: 'June', days: 30 },
    { num: 7, name: 'July', days: 31 },
    { num: 8, name: 'August', days: 31 },
    { num: 9, name: 'September', days: 30 },
    { num: 10, name: 'October', days: 31 },
    { num: 11, name: 'November', days: 30 },
    { num: 12, name: 'December', days: 31 },
  ];
  
  for (const month of months) {
    const monthStr = month.num.toString().padStart(2, '0');
    const periodStart = `${year}-${monthStr}-01`;
    const periodEnd = `${year}-${monthStr}-${month.days}`;
    
    await db.execute(
      `INSERT INTO fiscal_period 
       (fiscal_year_id, period_number, period_name, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?, 'open')`,
      [fiscalYearId, month.num, `${month.name} ${year}`, periodStart, periodEnd]
    );
  }
  
  return fiscalYearId;
}

/**
 * Preview closing entries for a fiscal year without actually closing
 */
export async function previewClosingEntries(year: number): Promise<{
  entries: ClosingEntry[];
  netIncome: number;
  totalRevenue: number;
  totalExpenses: number;
}> {
  const db = await getDatabase();
  
  const fiscalYear = await getFiscalYear(year);
  if (!fiscalYear) {
    throw new Error(`Fiscal year ${year} not found`);
  }
  
  if (fiscalYear.status === 'closed') {
    throw new Error(`Fiscal year ${year} is already closed`);
  }
  
  // Get all revenue accounts with their balances for this year
  const revenueAccounts = await db.select<Array<{
    id: number;
    code: string;
    name: string;
    balance: number;
  }>>(
    `SELECT 
      a.id,
      a.code,
      a.name,
      COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0) as balance
    FROM account a
    LEFT JOIN journal_line jl ON jl.account_id = a.id
    LEFT JOIN journal_entry je ON je.id = jl.journal_entry_id
    WHERE a.type = 'revenue'
      AND a.is_active = 1
      AND je.status = 'posted'
      AND DATE(je.entry_date) >= ?
      AND DATE(je.entry_date) <= ?
    GROUP BY a.id, a.code, a.name
    HAVING ABS(balance) > 0.01
    ORDER BY a.code`,
    [fiscalYear.start_date, fiscalYear.end_date]
  );
  
  // Get all expense accounts with their balances for this year
  const expenseAccounts = await db.select<Array<{
    id: number;
    code: string;
    name: string;
    balance: number;
  }>>(
    `SELECT 
      a.id,
      a.code,
      a.name,
      COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) as balance
    FROM account a
    LEFT JOIN journal_line jl ON jl.account_id = a.id
    LEFT JOIN journal_entry je ON je.id = jl.journal_entry_id
    WHERE a.type = 'expense'
      AND a.is_active = 1
      AND je.status = 'posted'
      AND DATE(je.entry_date) >= ?
      AND DATE(je.entry_date) <= ?
    GROUP BY a.id, a.code, a.name
    HAVING ABS(balance) > 0.01
    ORDER BY a.code`,
    [fiscalYear.start_date, fiscalYear.end_date]
  );
  
  const totalRevenue = revenueAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalExpenses = expenseAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const netIncome = totalRevenue - totalExpenses;
  
  const entries: ClosingEntry[] = [];
  
  // Step 1: Debit all revenue accounts (zero them out)
  for (const acc of revenueAccounts) {
    if (Math.abs(acc.balance) > 0.01) {
      entries.push({
        account_id: acc.id,
        account_code: acc.code,
        account_name: acc.name,
        debit_amount: acc.balance,
        credit_amount: 0,
        description: `Close ${year} revenue to Retained Earnings`,
      });
    }
  }
  
  // Step 2: Credit all expense accounts (zero them out)
  for (const acc of expenseAccounts) {
    if (Math.abs(acc.balance) > 0.01) {
      entries.push({
        account_id: acc.id,
        account_code: acc.code,
        account_name: acc.name,
        debit_amount: 0,
        credit_amount: acc.balance,
        description: `Close ${year} expenses to Retained Earnings`,
      });
    }
  }
  
  // Step 3: Post net income to Retained Earnings
  const retainedEarningsId = await getSystemAccountId('retained_earnings');
  const accounts = await persistenceService.getAccounts();
  const retainedEarningsAccount = accounts.find(a => a.id === retainedEarningsId);
  
  if (!retainedEarningsAccount) {
    throw new Error('Retained Earnings account not found');
  }
  
  if (netIncome > 0) {
    // Profit: Credit Retained Earnings
    entries.push({
      account_id: retainedEarningsAccount.id,
      account_code: retainedEarningsAccount.code,
      account_name: retainedEarningsAccount.name,
      debit_amount: 0,
      credit_amount: netIncome,
      description: `${year} net income transferred to Retained Earnings`,
    });
  } else if (netIncome < 0) {
    // Loss: Debit Retained Earnings
    entries.push({
      account_id: retainedEarningsAccount.id,
      account_code: retainedEarningsAccount.code,
      account_name: retainedEarningsAccount.name,
      debit_amount: Math.abs(netIncome),
      credit_amount: 0,
      description: `${year} net loss transferred to Retained Earnings`,
    });
  }
  
  return {
    entries,
    netIncome,
    totalRevenue,
    totalExpenses,
  };
}

/**
 * Close a fiscal year
 * - Generates closing journal entries
 * - Zeros out all revenue and expense accounts
 * - Transfers net income to Retained Earnings
 * - Marks fiscal year as closed
 */
export async function closeFiscalYear(
  year: number,
  context: PolicyContext
): Promise<{
  ok: boolean;
  journal_entry_id?: number;
  net_income?: number;
  warnings: Array<{ level: 'warning' | 'error'; message: string }>;
}> {
  try {
    const db = await getDatabase();
    
    // Get fiscal year
    const fiscalYear = await getFiscalYear(year);
    if (!fiscalYear) {
      return {
        ok: false,
        warnings: [{ level: 'error', message: `Fiscal year ${year} not found` }],
      };
    }
    
    if (fiscalYear.status === 'closed') {
      return {
        ok: false,
        warnings: [{ level: 'error', message: `Fiscal year ${year} is already closed` }],
      };
    }
    
    // Check if next year exists, create if not
    const nextYear = await getFiscalYear(year + 1);
    if (!nextYear) {
      await createFiscalYear(year + 1);
    }
    
    // Preview closing entries
    const preview = await previewClosingEntries(year);
    
    if (preview.entries.length === 0) {
      return {
        ok: false,
        warnings: [{ 
          level: 'error', 
          message: `No revenue or expense transactions found for ${year}. Nothing to close.` 
        }],
      };
    }
    
    // Create transaction event
    const eventId = await persistenceService.createTransactionEvent({
      event_type: 'fiscal_year_closed',
      description: `Close Fiscal Year ${year}`,
      reference: `FY${year}`,
      created_by: context.mode === 'pro' ? 'user' : 'system',
    });
    
    // Create closing journal entry
    const journalLines = preview.entries.map(entry => ({
      account_id: entry.account_id,
      debit_amount: entry.debit_amount,
      credit_amount: entry.credit_amount,
      description: entry.description,
    }));
    
    const journalEntryId = await persistenceService.createJournalEntry(
      {
        event_id: eventId,
        entry_date: fiscalYear.end_date,
        description: `Year End Close ${year}`,
        reference: `FY${year}-CLOSE`,
        status: 'posted',
      },
      journalLines
    );
    
    // Update fiscal year status
    await db.execute(
      `UPDATE fiscal_year 
       SET status = 'closed',
           closed_at = datetime('now'),
           closed_by = ?,
           closing_journal_entry_id = ?,
           updated_at = datetime('now')
       WHERE id = ?`,
      [context.mode === 'pro' ? 'user' : 'system', journalEntryId, fiscalYear.id]
    );
    
    return {
      ok: true,
      journal_entry_id: journalEntryId,
      net_income: preview.netIncome,
      warnings: [],
    };
  } catch (error) {
    console.error('Fiscal year close error:', error);
    
    let errorMessage = 'Unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return {
      ok: false,
      warnings: [{ level: 'error', message: errorMessage }],
    };
  }
}

/**
 * Reopen a closed fiscal year (Pro mode only - use with extreme caution)
 */
export async function reopenFiscalYear(
  year: number,
  context: PolicyContext
): Promise<{
  ok: boolean;
  warnings: Array<{ level: 'warning' | 'error'; message: string }>;
}> {
  if (context.mode !== 'pro') {
    return {
      ok: false,
      warnings: [{ 
        level: 'error', 
        message: 'Reopening closed fiscal years is only allowed in Pro mode' 
      }],
    };
  }
  
  try {
    const db = await getDatabase();
    
    const fiscalYear = await getFiscalYear(year);
    if (!fiscalYear) {
      return {
        ok: false,
        warnings: [{ level: 'error', message: `Fiscal year ${year} not found` }],
      };
    }
    
    if (fiscalYear.status === 'open') {
      return {
        ok: false,
        warnings: [{ level: 'error', message: `Fiscal year ${year} is already open` }],
      };
    }
    
    // Void the closing journal entry if it exists
    if (fiscalYear.closing_journal_entry_id) {
      await db.execute(
        `UPDATE journal_entry 
         SET status = 'void', updated_at = datetime('now')
         WHERE id = ?`,
        [fiscalYear.closing_journal_entry_id]
      );
    }
    
    // Reopen the fiscal year
    await db.execute(
      `UPDATE fiscal_year 
       SET status = 'open',
           closed_at = NULL,
           closed_by = NULL,
           closing_journal_entry_id = NULL,
           updated_at = datetime('now')
       WHERE id = ?`,
      [fiscalYear.id]
    );
    
    return {
      ok: true,
      warnings: [
        { 
          level: 'warning', 
          message: 'Fiscal year reopened. Revenue and expense accounts will need to be re-closed.' 
        }
      ],
    };
  } catch (error) {
    console.error('Fiscal year reopen error:', error);
    
    let errorMessage = 'Unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return {
      ok: false,
      warnings: [{ level: 'error', message: errorMessage }],
    };
  }
}
