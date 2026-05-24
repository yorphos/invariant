/**
 * Budget Service
 *
 * Manages budget creation, retrieval, and budget-vs-actual reporting.
 */
import { getDatabase } from './database';
import { logger } from '../utils/logger';

export interface BudgetRecord {
  id: number;
  fiscal_year: number;
  name: string;
  period_type: 'monthly' | 'quarterly' | 'yearly';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BudgetLineRecord {
  id: number;
  budget_id: number;
  account_id: number;
  period: number;
  amount: number;
  notes: string | null;
}

export interface BudgetWithLines extends BudgetRecord {
  lines: BudgetLineRecord[];
}

export interface BudgetVsActualLine {
  account_code: string;
  account_name: string;
  account_type: string;
  budget_amount: number;
  actual_amount: number;
  variance: number;
  variance_pct: number;
}

export interface BudgetVsActualData {
  budgetName: string;
  fiscalYear: number;
  periodType: string;
  lines: BudgetVsActualLine[];
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
}

export interface CreateBudgetData {
  fiscal_year: number;
  name: string;
  period_type: 'monthly' | 'quarterly' | 'yearly';
  notes?: string;
  lines: Array<{
    account_id: number;
    period: number;
    amount: number;
    notes?: string;
  }>;
}

/**
 * Create a new budget with its line items.
 */
export async function createBudget(data: CreateBudgetData): Promise<number> {
  const db = await getDatabase();

  const result = await db.execute(
    `INSERT INTO budget (fiscal_year, name, period_type, notes)
     VALUES (?, ?, ?, ?)`,
    [data.fiscal_year, data.name, data.period_type, data.notes || null]
  );

  const budgetId = result.lastInsertId;
  if (!budgetId) {
    throw new Error('Failed to create budget');
  }

  // Insert all line items
  for (const line of data.lines) {
    await db.execute(
      `INSERT INTO budget_line (budget_id, account_id, period, amount, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [budgetId, line.account_id, line.period, line.amount, line.notes || null]
    );
  }

  return budgetId;
}

/**
 * Get a budget by ID with all its line items.
 */
export async function getBudget(id: number): Promise<BudgetWithLines | null> {
  const db = await getDatabase();

  const budgets = await db.select<BudgetRecord[]>(
    'SELECT * FROM budget WHERE id = ? LIMIT 1',
    [id]
  );

  if (budgets.length === 0) {
    return null;
  }

  const lines = await db.select<BudgetLineRecord[]>(
    'SELECT * FROM budget_line WHERE budget_id = ? ORDER BY account_id, period',
    [id]
  );

  return { ...budgets[0], lines };
}

/**
 * List all budgets, optionally filtered by fiscal year.
 */
export async function getBudgets(fiscalYear?: number): Promise<BudgetRecord[]> {
  const db = await getDatabase();

  if (fiscalYear !== undefined) {
    return db.select<BudgetRecord[]>(
      'SELECT * FROM budget WHERE fiscal_year = ? ORDER BY name',
      [fiscalYear]
    );
  }

  return db.select<BudgetRecord[]>(
    'SELECT * FROM budget ORDER BY fiscal_year DESC, name'
  );
}

/**
 * Replace all line items for a budget (delete old, insert new).
 */
export async function updateBudgetLines(
  id: number,
  lines: Array<{
    account_id: number;
    period: number;
    amount: number;
    notes?: string;
  }>
): Promise<void> {
  const db = await getDatabase();

  // Delete existing lines
  await db.execute('DELETE FROM budget_line WHERE budget_id = ?', [id]);

  // Insert new lines
  for (const line of lines) {
    await db.execute(
      `INSERT INTO budget_line (budget_id, account_id, period, amount, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [id, line.account_id, line.period, line.amount, line.notes || null]
    );
  }
}

/**
 * Delete a budget (cascade deletes its line items).
 */
export async function deleteBudget(id: number): Promise<void> {
  const db = await getDatabase();
  await db.execute('DELETE FROM budget WHERE id = ?', [id]);
}

/**
 * Get budget-vs-actual comparison data.
 *
 * Joins budget_line with journal_line filtered by date range and groups by
 * account. Handles account normal balances: revenue accounts use credit
 * normal (credit - debit), expense accounts use debit normal (debit - credit).
 */
export async function getBudgetVsActual(
  budgetId: number,
  startDate: string,
  endDate: string
): Promise<BudgetVsActualData> {
  const db = await getDatabase();

  // Get budget info
  const budgets = await db.select<BudgetRecord[]>(
    'SELECT * FROM budget WHERE id = ? LIMIT 1',
    [budgetId]
  );

  if (budgets.length === 0) {
    throw new Error(`Budget with id ${budgetId} not found`);
  }

  const budget = budgets[0];

  // Get budget-vs-actual data per account
  const rows = await db.select<
    Array<{
      account_code: string;
      account_name: string;
      account_type: string;
      budget_amount: number;
      actual_amount: number;
    }>
  >(
    `SELECT
      a.code as account_code,
      a.name as account_name,
      a.type as account_type,
      bl.amount as budget_amount,
      COALESCE(SUM(CASE
        WHEN a.type IN ('expense') THEN jl.debit_amount - jl.credit_amount
        ELSE jl.credit_amount - jl.debit_amount
      END), 0) as actual_amount
    FROM budget_line bl
    JOIN account a ON a.id = bl.account_id
    LEFT JOIN journal_line jl ON jl.account_id = bl.account_id
    LEFT JOIN journal_entry je ON je.id = jl.journal_entry_id
      AND je.status = 'posted'
      AND DATE(je.entry_date) >= ? AND DATE(je.entry_date) <= ?
    WHERE bl.budget_id = ?
    GROUP BY a.code, a.name, a.type, bl.amount
    ORDER BY a.code`,
    [startDate, endDate, budgetId]
  );

  // Build response lines with variance calculations
  let totalBudget = 0;
  let totalActual = 0;

  const lines: BudgetVsActualLine[] = rows.map((row) => {
    const budgetAmount = row.budget_amount;
    const actualAmount = row.actual_amount;
    const variance = budgetAmount - actualAmount;
    const variancePct =
      budgetAmount !== 0 ? (variance / budgetAmount) * 100 : 0;

    totalBudget += budgetAmount;
    totalActual += actualAmount;

    return {
      account_code: row.account_code,
      account_name: row.account_name,
      account_type: row.account_type,
      budget_amount: budgetAmount,
      actual_amount: actualAmount,
      variance,
      variance_pct: variancePct,
    };
  });

  return {
    budgetName: budget.name,
    fiscalYear: budget.fiscal_year,
    periodType: budget.period_type,
    lines,
    totalBudget,
    totalActual,
    totalVariance: totalBudget - totalActual,
  };
}
