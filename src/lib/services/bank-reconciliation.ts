/**
 * Bank Reconciliation Service
 * 
 * Handles reconciliation of bank accounts against bank statements
 * to ensure book balance matches bank balance after accounting for
 * outstanding deposits and checks.
 */

import { getDatabase } from './database';
import type {
  BankReconciliation,
  BankReconciliationItem,
  UnreconciledTransaction,
  Account,
  PolicyContext
} from '../domain/types';

/**
 * Get all reconciliations for an account
 */
export async function getReconciliations(accountId: number): Promise<BankReconciliation[]> {
  const db = await getDatabase();
  
  const results = await db.select<BankReconciliation[]>(
    `SELECT * FROM bank_reconciliation
     WHERE account_id = ?
     ORDER BY statement_date DESC, created_at DESC`,
    [accountId]
  );
  
  return results;
}

/**
 * Get a specific reconciliation by ID
 */
export async function getReconciliation(id: number): Promise<BankReconciliation | null> {
  const db = await getDatabase();
  
  const results = await db.select<BankReconciliation[]>(
    'SELECT * FROM bank_reconciliation WHERE id = ? LIMIT 1',
    [id]
  );
  
  return results[0] || null;
}

/**
 * Get reconciliation items (cleared transactions) for a reconciliation
 */
export async function getReconciliationItems(reconciliationId: number): Promise<BankReconciliationItem[]> {
  const db = await getDatabase();
  
  const results = await db.select<BankReconciliationItem[]>(
    `SELECT * FROM bank_reconciliation_item
     WHERE reconciliation_id = ?
     ORDER BY created_at`,
    [reconciliationId]
  );
  
  return results;
}

/**
 * Get unreconciled transactions for a bank account up to a given date
 * These are posted journal lines that haven't been marked as cleared
 */
export async function getUnreconciledTransactions(
  accountId: number,
  upToDate: string
): Promise<UnreconciledTransaction[]> {
  const db = await getDatabase();
  
  // Get all posted journal lines for this account that:
  // 1. Are posted (not draft or void)
  // 2. Are on or before the statement date
  // 3. Have not been reconciled (reconciliation_id IS NULL)
  const results = await db.select<UnreconciledTransaction[]>(
    `SELECT 
       jl.id as journal_line_id,
       jl.journal_entry_id,
       je.entry_date,
       je.description,
       je.reference,
       jl.debit_amount,
       jl.credit_amount,
       0 as running_balance
     FROM journal_line jl
     JOIN journal_entry je ON jl.journal_entry_id = je.id
     WHERE jl.account_id = ?
       AND je.status = 'posted'
       AND DATE(je.entry_date) <= DATE(?)
       AND jl.reconciliation_id IS NULL
     ORDER BY je.entry_date ASC, jl.id ASC`,
    [accountId, upToDate]
  );
  
  // Calculate running balance
  let balance = 0;
  for (const txn of results) {
    balance += txn.debit_amount - txn.credit_amount;
    txn.running_balance = balance;
  }
  
  return results;
}

/**
 * Calculate the book balance for an account up to a given date
 * This includes ALL posted transactions (reconciled and unreconciled)
 */
export async function getBookBalance(accountId: number, upToDate: string): Promise<number> {
  const db = await getDatabase();
  
  const results = await db.select<Array<{ balance: number }>>(
    `SELECT 
       COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) as balance
     FROM journal_line jl
     JOIN journal_entry je ON jl.journal_entry_id = je.id
     WHERE jl.account_id = ?
       AND je.status = 'posted'
       AND DATE(je.entry_date) <= DATE(?)`,
    [accountId, upToDate]
  );
  
  return results[0]?.balance || 0;
}

/**
 * Create a new bank reconciliation
 * This initializes a reconciliation but doesn't complete it
 */
export async function createReconciliation(
  accountId: number,
  statementDate: string,
  statementBalance: number,
  context: PolicyContext
): Promise<number> {
  const db = await getDatabase();
  
  // Verify the account exists and is an asset account (bank accounts should be assets)
  const accounts = await db.select<Account[]>(
    'SELECT * FROM account WHERE id = ? LIMIT 1',
    [accountId]
  );
  
  if (!accounts[0]) {
    throw new Error(`Account ID ${accountId} does not exist`);
  }
  
  if (accounts[0].type !== 'asset') {
    throw new Error(
      `Account "${accounts[0].name}" is not an asset account. ` +
      `Bank reconciliation is only for asset accounts (cash, checking, savings).`
    );
  }
  
  // Calculate book balance up to statement date
  const bookBalance = await getBookBalance(accountId, statementDate);
  
  // Create the reconciliation record
  const result = await db.execute(
    `INSERT INTO bank_reconciliation 
     (account_id, statement_date, statement_balance, book_balance, status)
     VALUES (?, ?, ?, ?, 'in_progress')`,
    [accountId, statementDate, statementBalance, bookBalance]
  );
  
  if (!result.lastInsertId) {
    throw new Error('Failed to create reconciliation record');
  }
  
  return result.lastInsertId;
}

/**
 * Add transactions to a reconciliation (mark them as cleared)
 */
export async function addReconciliationItems(
  reconciliationId: number,
  journalLineIds: number[],
  context: PolicyContext
): Promise<void> {
  const db = await getDatabase();
  
  // Verify reconciliation exists and is in_progress
  const recon = await getReconciliation(reconciliationId);
  if (!recon) {
    throw new Error(`Reconciliation ID ${reconciliationId} does not exist`);
  }
  
  if (recon.status !== 'in_progress') {
    throw new Error(
      `Cannot add items to reconciliation with status "${recon.status}". ` +
      `Only in_progress reconciliations can be modified.`
    );
  }
  
  // Add each item
  for (const lineId of journalLineIds) {
    await db.execute(
      `INSERT OR IGNORE INTO bank_reconciliation_item 
       (reconciliation_id, journal_line_id, is_cleared)
       VALUES (?, ?, 1)`,
      [reconciliationId, lineId]
    );
  }
}

/**
 * Remove transactions from a reconciliation (unmark them as cleared)
 */
export async function removeReconciliationItems(
  reconciliationId: number,
  journalLineIds: number[],
  context: PolicyContext
): Promise<void> {
  const db = await getDatabase();
  
  // Verify reconciliation exists and is in_progress
  const recon = await getReconciliation(reconciliationId);
  if (!recon) {
    throw new Error(`Reconciliation ID ${reconciliationId} does not exist`);
  }
  
  if (recon.status !== 'in_progress') {
    throw new Error(
      `Cannot remove items from reconciliation with status "${recon.status}". ` +
      `Only in_progress reconciliations can be modified.`
    );
  }
  
  // Remove each item
  for (const lineId of journalLineIds) {
    await db.execute(
      `DELETE FROM bank_reconciliation_item 
       WHERE reconciliation_id = ? AND journal_line_id = ?`,
      [reconciliationId, lineId]
    );
  }
}

/**
 * Calculate the reconciliation difference
 * Returns the difference between cleared balance and statement balance
 */
export async function calculateReconciliationDifference(
  reconciliationId: number
): Promise<{
  statementBalance: number;
  clearedBalance: number;
  difference: number;
  isBalanced: boolean;
}> {
  const db = await getDatabase();
  
  const recon = await getReconciliation(reconciliationId);
  if (!recon) {
    throw new Error(`Reconciliation ID ${reconciliationId} does not exist`);
  }
  
  // Calculate cleared balance (sum of cleared transactions)
  const results = await db.select<Array<{ cleared_balance: number }>>(
    `SELECT 
       COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) as cleared_balance
     FROM bank_reconciliation_item bri
     JOIN journal_line jl ON bri.journal_line_id = jl.id
     WHERE bri.reconciliation_id = ? AND bri.is_cleared = 1`,
    [reconciliationId]
  );
  
  const clearedBalance = results[0]?.cleared_balance || 0;
  const difference = clearedBalance - recon.statement_balance;
  const isBalanced = Math.abs(difference) < 0.01; // 1 cent tolerance
  
  return {
    statementBalance: recon.statement_balance,
    clearedBalance,
    difference,
    isBalanced
  };
}

/**
 * Complete a reconciliation
 * This marks all cleared transactions as reconciled and locks the reconciliation
 */
export async function completeReconciliation(
  reconciliationId: number,
  context: PolicyContext
): Promise<void> {
  const db = await getDatabase();
  
  const recon = await getReconciliation(reconciliationId);
  if (!recon) {
    throw new Error(`Reconciliation ID ${reconciliationId} does not exist`);
  }
  
  if (recon.status !== 'in_progress') {
    throw new Error(
      `Cannot complete reconciliation with status "${recon.status}". ` +
      `Only in_progress reconciliations can be completed.`
    );
  }
  
  // Verify the reconciliation balances
  const { isBalanced, difference } = await calculateReconciliationDifference(reconciliationId);
  
  if (!isBalanced) {
    throw new Error(
      `Reconciliation does not balance. Difference: $${Math.abs(difference).toFixed(2)}. ` +
      `Please review cleared transactions before completing.`
    );
  }
  
  // Update all cleared journal lines to reference this reconciliation
  await db.execute(
    `UPDATE journal_line 
     SET reconciliation_id = ?
     WHERE id IN (
       SELECT journal_line_id 
       FROM bank_reconciliation_item 
       WHERE reconciliation_id = ? AND is_cleared = 1
     )`,
    [reconciliationId, reconciliationId]
  );
  
  // Mark reconciliation as completed
  await db.execute(
    `UPDATE bank_reconciliation 
     SET status = 'completed',
         completed_at = datetime('now'),
         completed_by = ?,
         updated_at = datetime('now')
     WHERE id = ?`,
    [context.user || 'system', reconciliationId]
  );
}

/**
 * Cancel a reconciliation
 * This can only be done for in_progress reconciliations
 */
export async function cancelReconciliation(
  reconciliationId: number,
  context: PolicyContext
): Promise<void> {
  const db = await getDatabase();
  
  const recon = await getReconciliation(reconciliationId);
  if (!recon) {
    throw new Error(`Reconciliation ID ${reconciliationId} does not exist`);
  }
  
  if (recon.status === 'completed') {
    throw new Error(
      `Cannot cancel completed reconciliation. ` +
      `Contact support if you need to reverse a completed reconciliation.`
    );
  }
  
  // Mark as cancelled
  await db.execute(
    `UPDATE bank_reconciliation 
     SET status = 'cancelled',
         updated_at = datetime('now')
     WHERE id = ?`,
    [reconciliationId]
  );
  
  // Note: We don't delete the items, we keep them for audit trail
}

/**
 * Get reconciliation summary statistics for an account
 */
export async function getReconciliationSummary(accountId: number): Promise<{
  lastReconciliationDate: string | null;
  unreconciledTransactionCount: number;
  lastReconciledBalance: number | null;
}> {
  const db = await getDatabase();
  
  // Get most recent completed reconciliation
  const lastRecon = await db.select<BankReconciliation[]>(
    `SELECT * FROM bank_reconciliation
     WHERE account_id = ? AND status = 'completed'
     ORDER BY statement_date DESC
     LIMIT 1`,
    [accountId]
  );
  
  // Count unreconciled transactions
  const countResult = await db.select<Array<{ count: number }>>(
    `SELECT COUNT(*) as count
     FROM journal_line jl
     JOIN journal_entry je ON jl.journal_entry_id = je.id
     WHERE jl.account_id = ?
       AND je.status = 'posted'
       AND jl.reconciliation_id IS NULL`,
    [accountId]
  );
  
  return {
    lastReconciliationDate: lastRecon[0]?.statement_date || null,
    unreconciledTransactionCount: countResult[0]?.count || 0,
    lastReconciledBalance: lastRecon[0]?.statement_balance || null
  };
}
