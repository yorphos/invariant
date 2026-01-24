/**
 * Bank Import Service
 * 
 * Handles importing bank statements from CSV and QBO files,
 * auto-matching transactions, and applying categorization rules.
 */

import { getDatabase } from './database';
import type {
  BankStatementImport,
  BankStatementTransaction,
  CategorizationRule,
  BankFileFormat,
  BankTransactionType,
  Account,
  Contact,
  JournalEntry
} from '../domain/types';

// Re-export types for convenience
export type {
  BankStatementImport,
  BankStatementTransaction,
  CategorizationRule
};

/**
 * Parse CSV bank statement
 * Supports common formats from major banks
 */
export function parseCSVBankStatement(csvText: string): {
  transactions: Partial<BankStatementTransaction>[];
  startDate?: string;
  endDate?: string;
  openingBalance?: number;
  closingBalance?: number;
} {
  const lines = csvText.trim().split('\n');
  
  if (lines.length < 2) {
    throw new Error('CSV must have at least a header row and one data row');
  }

  // Parse header
  const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''));
  
  // Find column indices (flexible matching)
  const dateIdx = header.findIndex(h => h.includes('date') && !h.includes('post'));
  const postDateIdx = header.findIndex(h => h.includes('post') && h.includes('date'));
  const descIdx = header.findIndex(h => h.includes('description') || h.includes('memo'));
  const amountIdx = header.findIndex(h => h.includes('amount') && !h.includes('balance'));
  const balanceIdx = header.findIndex(h => h.includes('balance'));
  const refIdx = header.findIndex(h => h.includes('reference') || h.includes('ref'));
  const checkIdx = header.findIndex(h => h.includes('check'));
  const payeeIdx = header.findIndex(h => h.includes('payee') || h.includes('merchant'));
  const typeIdx = header.findIndex(h => h.includes('type'));

  if (dateIdx === -1 || descIdx === -1 || amountIdx === -1) {
    throw new Error('CSV must have columns for: Date, Description, and Amount');
  }

  const transactions: Partial<BankStatementTransaction>[] = [];
  let minDate: string | undefined;
  let maxDate: string | undefined;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = parseCSVLine(line);
    
    const txnDate = values[dateIdx];
    const amount = parseFloat(values[amountIdx].replace(/[$,]/g, ''));
    
    // Track date range
    if (!minDate || txnDate < minDate) minDate = txnDate;
    if (!maxDate || txnDate > maxDate) maxDate = txnDate;

    transactions.push({
      transaction_date: txnDate,
      post_date: postDateIdx >= 0 ? values[postDateIdx] : undefined,
      description: values[descIdx],
      amount: amount,
      balance: balanceIdx >= 0 ? parseFloat(values[balanceIdx].replace(/[$,]/g, '')) : undefined,
      reference_number: refIdx >= 0 ? values[refIdx] : undefined,
      check_number: checkIdx >= 0 ? values[checkIdx] : undefined,
      payee: payeeIdx >= 0 ? values[payeeIdx] : undefined,
      transaction_type: typeIdx >= 0 ? normalizeTransactionType(values[typeIdx]) : (amount < 0 ? 'debit' : 'credit'),
      match_status: 'unmatched'
    });
  }

  return {
    transactions,
    startDate: minDate,
    endDate: maxDate,
    openingBalance: transactions[0]?.balance,
    closingBalance: transactions[transactions.length - 1]?.balance
  };
}

/**
 * Parse a CSV line handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const fields: string[] = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      fields.push(currentField.trim());
      currentField = '';
    } else {
      currentField += char;
    }
  }
  
  fields.push(currentField.trim());
  return fields;
}

/**
 * Normalize transaction type string to enum
 */
function normalizeTransactionType(type: string): BankTransactionType {
  const t = type.toLowerCase();
  
  if (t.includes('debit') || t.includes('withdrawal') || t.includes('payment')) return 'debit';
  if (t.includes('credit') || t.includes('deposit')) return 'credit';
  if (t.includes('check') || t.includes('cheque')) return 'check';
  if (t.includes('fee')) return 'fee';
  if (t.includes('interest')) return 'interest';
  if (t.includes('transfer')) return 'transfer';
  
  return 'other';
}

/**
 * Create a bank import record
 */
export async function createBankImport(
  accountId: number,
  fileName: string,
  fileFormat: BankFileFormat,
  importedBy: string
): Promise<number> {
  const db = await getDatabase();
  
  // Verify account exists
  const accounts = await db.select<Account[]>(
    'SELECT * FROM account WHERE id = ? LIMIT 1',
    [accountId]
  );
  
  if (!accounts[0]) {
    throw new Error(`Account ID ${accountId} does not exist`);
  }
  
  const result = await db.execute(
    `INSERT INTO bank_statement_import 
     (account_id, file_name, file_format, total_transactions, imported_transactions, matched_transactions, status, imported_by)
     VALUES (?, ?, ?, 0, 0, 0, 'pending', ?)`,
    [accountId, fileName, fileFormat, importedBy]
  );
  
  if (!result.lastInsertId) {
    throw new Error('Failed to create bank import record');
  }
  
  return result.lastInsertId;
}

/**
 * Add transactions to an import
 */
export async function addTransactionsToImport(
  importId: number,
  transactions: Partial<BankStatementTransaction>[]
): Promise<void> {
  const db = await getDatabase();
  
  for (const txn of transactions) {
    await db.execute(
      `INSERT INTO bank_statement_transaction 
       (import_id, transaction_date, post_date, description, reference_number, check_number, 
        payee, amount, balance, transaction_type, category, memo, match_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        importId,
        txn.transaction_date,
        txn.post_date || null,
        txn.description,
        txn.reference_number || null,
        txn.check_number || null,
        txn.payee || null,
        txn.amount,
        txn.balance || null,
        txn.transaction_type || 'other',
        txn.category || null,
        txn.memo || null,
        txn.match_status || 'unmatched'
      ]
    );
  }
  
  // Update import record
  await db.execute(
    `UPDATE bank_statement_import 
     SET total_transactions = ?, 
         status = 'completed',
         updated_at = datetime('now')
     WHERE id = ?`,
    [transactions.length, importId]
  );
}

/**
 * Import bank statement from CSV
 */
export async function importCSVBankStatement(
  accountId: number,
  fileName: string,
  csvText: string,
  importedBy: string
): Promise<{
  importId: number;
  transactionCount: number;
  autoMatchedCount: number;
}> {
  const db = await getDatabase();
  
  // Parse CSV
  const { transactions, startDate, endDate, openingBalance, closingBalance } = 
    parseCSVBankStatement(csvText);
  
  // Create import record
  const importId = await createBankImport(accountId, fileName, 'csv', importedBy);
  
  // Update with statement details
  await db.execute(
    `UPDATE bank_statement_import 
     SET statement_start_date = ?,
         statement_end_date = ?,
         opening_balance = ?,
         closing_balance = ?
     WHERE id = ?`,
    [startDate, endDate, openingBalance, closingBalance, importId]
  );
  
  // Add transactions
  await addTransactionsToImport(importId, transactions);
  
  // Apply categorization rules
  await applyCategorizationRules(importId);
  
  // Auto-match transactions
  const autoMatchedCount = await autoMatchTransactions(importId, accountId);
  
  return {
    importId,
    transactionCount: transactions.length,
    autoMatchedCount
  };
}

/**
 * Get categorization rules (active, ordered by priority)
 */
export async function getCategorizationRules(): Promise<CategorizationRule[]> {
  const db = await getDatabase();
  
  const results = await db.select<CategorizationRule[]>(
    `SELECT * FROM categorization_rule
     WHERE is_active = 1
     ORDER BY priority DESC, id ASC`
  );
  
  return results;
}

/**
 * Apply categorization rules to unmatched transactions in an import
 */
export async function applyCategorizationRules(importId: number): Promise<number> {
  const db = await getDatabase();
  
  // Get all unmatched transactions
  const transactions = await db.select<BankStatementTransaction[]>(
    `SELECT * FROM bank_statement_transaction
     WHERE import_id = ? AND match_status = 'unmatched'`,
    [importId]
  );
  
  // Get active rules
  const rules = await getCategorizationRules();
  
  let appliedCount = 0;
  
  for (const txn of transactions) {
    // Try each rule in priority order
    for (const rule of rules) {
      if (matchesRule(txn, rule)) {
        // Apply rule
        await db.execute(
          `UPDATE bank_statement_transaction
           SET suggested_account_id = ?,
               suggested_contact_id = ?,
               category = ?,
               suggestion_confidence = 0.85
           WHERE id = ?`,
          [
            rule.assign_account_id || null,
            rule.assign_contact_id || null,
            rule.assign_category || txn.category,
            txn.id
          ]
        );
        
        // Log rule application
        await db.execute(
          `INSERT INTO rule_application_log (rule_id, bank_transaction_id)
           VALUES (?, ?)`,
          [rule.id, txn.id]
        );
        
        // Update rule statistics
        await db.execute(
          `UPDATE categorization_rule
           SET times_applied = times_applied + 1,
               last_applied_at = datetime('now')
           WHERE id = ?`,
          [rule.id]
        );
        
        appliedCount++;
        break; // Only apply first matching rule
      }
    }
  }
  
  return appliedCount;
}

/**
 * Check if transaction matches a rule
 */
function matchesRule(txn: BankStatementTransaction, rule: CategorizationRule): boolean {
  // Check description pattern
  if (rule.description_pattern) {
    const regex = new RegExp(rule.description_pattern, 'i');
    if (!regex.test(txn.description)) return false;
  }
  
  // Check payee pattern
  if (rule.payee_pattern && txn.payee) {
    const regex = new RegExp(rule.payee_pattern, 'i');
    if (!regex.test(txn.payee)) return false;
  }
  
  // Check amount range
  if (rule.amount_min !== undefined && rule.amount_min !== null) {
    if (Math.abs(txn.amount) < rule.amount_min) return false;
  }
  
  if (rule.amount_max !== undefined && rule.amount_max !== null) {
    if (Math.abs(txn.amount) > rule.amount_max) return false;
  }
  
  // Check transaction type
  if (rule.transaction_type && txn.transaction_type !== rule.transaction_type) {
    return false;
  }
  
  return true;
}

/**
 * Auto-match imported transactions to existing journal entries
 * Matches by date, amount, and description similarity
 */
export async function autoMatchTransactions(
  importId: number,
  accountId: number
): Promise<number> {
  const db = await getDatabase();
  
  // Get unmatched transactions
  const transactions = await db.select<BankStatementTransaction[]>(
    `SELECT * FROM bank_statement_transaction
     WHERE import_id = ? AND match_status = 'unmatched'`,
    [importId]
  );
  
  let matchedCount = 0;
  
  for (const txn of transactions) {
    // Find potential matches:
    // - Posted journal entries
    // - Within ±3 days of transaction date
    // - Same amount (considering debit/credit)
    // - For the same account
    const dateStart = new Date(txn.transaction_date);
    dateStart.setDate(dateStart.getDate() - 3);
    const dateEnd = new Date(txn.transaction_date);
    dateEnd.setDate(dateEnd.getDate() + 3);
    
    const potentialMatches = await db.select<Array<{
      journal_entry_id: number;
      entry_date: string;
      description: string;
      reference: string;
      debit_amount: number;
      credit_amount: number;
    }>>(
      `SELECT 
         je.id as journal_entry_id,
         je.entry_date,
         je.description,
         je.reference,
         jl.debit_amount,
         jl.credit_amount
       FROM journal_entry je
       JOIN journal_line jl ON je.id = jl.journal_entry_id
       WHERE je.status = 'posted'
         AND jl.account_id = ?
         AND DATE(je.entry_date) BETWEEN DATE(?) AND DATE(?)
         AND jl.reconciliation_id IS NULL
       ORDER BY ABS(JULIANDAY(je.entry_date) - JULIANDAY(?)) ASC`,
      [accountId, dateStart.toISOString().split('T')[0], dateEnd.toISOString().split('T')[0], txn.transaction_date]
    );
    
    // Find best match
    let bestMatch: typeof potentialMatches[0] | null = null;
    let bestScore = 0;
    
    for (const match of potentialMatches) {
      // Calculate amount match (bank transaction amount matches journal line debit or credit)
      const amountMatch = txn.amount < 0 
        ? Math.abs(txn.amount) === match.credit_amount
        : Math.abs(txn.amount) === match.debit_amount;
      
      if (!amountMatch) continue;
      
      // Calculate description similarity (simple contains check)
      const descSimilarity = calculateStringSimilarity(
        txn.description.toLowerCase(),
        match.description.toLowerCase()
      );
      
      const score = 0.7 + (descSimilarity * 0.3);
      
      if (score > bestScore && score > 0.7) {
        bestScore = score;
        bestMatch = match;
      }
    }
    
    if (bestMatch && bestScore > 0.7) {
      // Auto-match this transaction
      await db.execute(
        `UPDATE bank_statement_transaction
         SET match_status = 'auto_matched',
             matched_journal_entry_id = ?,
             matched_confidence = ?
         WHERE id = ?`,
        [bestMatch.journal_entry_id, bestScore, txn.id]
      );
      
      matchedCount++;
    }
  }
  
  // Update import statistics
  await db.execute(
    `UPDATE bank_statement_import
     SET matched_transactions = ?
     WHERE id = ?`,
    [matchedCount, importId]
  );
  
  return matchedCount;
}

/**
 * Calculate string similarity (simple Jaccard similarity on words)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Get import details
 */
export async function getBankImport(importId: number): Promise<BankStatementImport | null> {
  const db = await getDatabase();
  
  const results = await db.select<BankStatementImport[]>(
    'SELECT * FROM bank_statement_import WHERE id = ? LIMIT 1',
    [importId]
  );
  
  return results[0] || null;
}

/**
 * Get transactions for an import
 */
export async function getImportTransactions(importId: number): Promise<BankStatementTransaction[]> {
  const db = await getDatabase();
  
  const results = await db.select<BankStatementTransaction[]>(
    `SELECT * FROM bank_statement_transaction
     WHERE import_id = ?
     ORDER BY transaction_date DESC, id DESC`,
    [importId]
  );
  
  return results;
}

/**
 * Get all imports for an account
 */
export async function getAccountImports(accountId: number): Promise<BankStatementImport[]> {
  const db = await getDatabase();
  
  const results = await db.select<BankStatementImport[]>(
    `SELECT * FROM bank_statement_import
     WHERE account_id = ?
     ORDER BY import_date DESC`,
    [accountId]
  );
  
  return results;
}

/**
 * Create a categorization rule
 */
export async function createCategorizationRule(
  rule: Omit<CategorizationRule, 'id' | 'times_applied' | 'last_applied_at' | 'created_at' | 'updated_at'>
): Promise<number> {
  const db = await getDatabase();
  
  const result = await db.execute(
    `INSERT INTO categorization_rule 
     (rule_name, priority, is_active, description_pattern, payee_pattern, 
      amount_min, amount_max, transaction_type, assign_account_id, 
      assign_contact_id, assign_category, notes_template, times_applied)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [
      rule.rule_name,
      rule.priority,
      rule.is_active ? 1 : 0,
      rule.description_pattern || null,
      rule.payee_pattern || null,
      rule.amount_min || null,
      rule.amount_max || null,
      rule.transaction_type || null,
      rule.assign_account_id || null,
      rule.assign_contact_id || null,
      rule.assign_category || null,
      rule.notes_template || null
    ]
  );
  
  if (!result.lastInsertId) {
    throw new Error('Failed to create categorization rule');
  }
  
  return result.lastInsertId;
}

/**
 * Update a categorization rule
 */
export async function updateCategorizationRule(
  ruleId: number,
  updates: Partial<CategorizationRule>
): Promise<void> {
  const db = await getDatabase();
  
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.rule_name !== undefined) {
    fields.push('rule_name = ?');
    values.push(updates.rule_name);
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(updates.is_active ? 1 : 0);
  }
  if (updates.description_pattern !== undefined) {
    fields.push('description_pattern = ?');
    values.push(updates.description_pattern || null);
  }
  if (updates.payee_pattern !== undefined) {
    fields.push('payee_pattern = ?');
    values.push(updates.payee_pattern || null);
  }
  if (updates.amount_min !== undefined) {
    fields.push('amount_min = ?');
    values.push(updates.amount_min || null);
  }
  if (updates.amount_max !== undefined) {
    fields.push('amount_max = ?');
    values.push(updates.amount_max || null);
  }
  if (updates.transaction_type !== undefined) {
    fields.push('transaction_type = ?');
    values.push(updates.transaction_type || null);
  }
  if (updates.assign_account_id !== undefined) {
    fields.push('assign_account_id = ?');
    values.push(updates.assign_account_id || null);
  }
  if (updates.assign_contact_id !== undefined) {
    fields.push('assign_contact_id = ?');
    values.push(updates.assign_contact_id || null);
  }
  if (updates.assign_category !== undefined) {
    fields.push('assign_category = ?');
    values.push(updates.assign_category || null);
  }
  if (updates.notes_template !== undefined) {
    fields.push('notes_template = ?');
    values.push(updates.notes_template || null);
  }
  
  if (fields.length === 0) {
    return; // Nothing to update
  }
  
  fields.push('updated_at = datetime("now")');
  values.push(ruleId);
  
  await db.execute(
    `UPDATE categorization_rule SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

/**
 * Delete a categorization rule
 */
export async function deleteCategorizationRule(ruleId: number): Promise<void> {
  const db = await getDatabase();
  
  await db.execute(
    'DELETE FROM categorization_rule WHERE id = ?',
    [ruleId]
  );
}

/**
 * Import a bank transaction as a journal entry
 * Creates journal entry, transaction event, and marks transaction as matched
 */
export async function importBankTransactionAsJournalEntry(
  transactionId: number,
  bankAccountId: number, // The bank/cash account affected
  categoriesAccountId: number, // The expense/revenue/other account
  contactId?: number,
  notes?: string
): Promise<{
  ok: boolean;
  journal_entry_id?: number;
  event_id?: number;
  warnings: { level: 'error' | 'warning'; message: string }[];
}> {
  const db = await getDatabase();
  
  try {
    // Get the bank transaction
    const transactions = await db.select<BankStatementTransaction[]>(
      'SELECT * FROM bank_statement_transaction WHERE id = ?',
      [transactionId]
    );
    
    if (!transactions || transactions.length === 0) {
      throw new Error(`Bank transaction ${transactionId} not found`);
    }
    
    const transaction = transactions[0];
    
    // Check if already matched
    if (transaction.match_status === 'auto_matched' || transaction.match_status === 'manual_matched') {
      return {
        ok: false,
        warnings: [{
          level: 'error',
          message: 'Transaction is already matched'
        }]
      };
    }
    
    // Validate accounts exist
    const accounts = await db.select<{ id: number; code: string; name: string; type: string }[]>(
      'SELECT id, code, name, type FROM account WHERE id IN (?, ?)',
      [bankAccountId, categoriesAccountId]
    );
    
    if (accounts.length !== 2) {
      throw new Error('One or both accounts not found');
    }
    
    const bankAccount = accounts.find(a => a.id === bankAccountId);
    const categoryAccount = accounts.find(a => a.id === categoriesAccountId);
    
    if (!bankAccount || !categoryAccount) {
      throw new Error('Account validation failed');
    }
    
    // Determine transaction direction
    // For bank transactions:
    // - Debit = money in (increase bank asset)
    // - Credit = money out (decrease bank asset)
    const isMoneyIn = transaction.transaction_type === 'deposit' || transaction.transaction_type === 'credit';
    const amount = Math.abs(transaction.amount);
    
    // Create transaction event
    const eventResult = await db.execute(
      `INSERT INTO transaction_event 
       (event_type, description, reference, created_by, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [
        'bank_transaction_imported',
        `${transaction.description} - ${transaction.payee || 'Unknown'}`,
        transaction.reference_number || null,
        'bank_import'
      ]
    );
    
    const eventId = eventResult.lastInsertId;
    if (!eventId) {
      throw new Error('Failed to create transaction event');
    }
    
    // Create journal entry
    // Money in: DR Bank, CR Revenue/Other
    // Money out: DR Expense/Other, CR Bank
    const journalEntryResult = await db.execute(
      `INSERT INTO journal_entry 
       (event_id, entry_date, description, reference, status, created_at)
       VALUES (?, ?, ?, ?, 'posted', datetime('now'))`,
      [
        eventId,
        transaction.transaction_date,
        `${transaction.description} - ${transaction.payee || ''}`.trim(),
        transaction.reference_number || null
      ]
    );
    
    const journalEntryId = journalEntryResult.lastInsertId;
    if (!journalEntryId) {
      throw new Error('Failed to create journal entry');
    }
    
    // Create journal lines
    if (isMoneyIn) {
      // Money coming in
      // DR Bank (increase asset)
      await db.execute(
        `INSERT INTO journal_line 
         (journal_entry_id, line_number, account_id, debit_amount, credit_amount, description)
         VALUES (?, 1, ?, ?, 0, ?)`,
        [journalEntryId, bankAccountId, amount, 'Deposit to bank']
      );
      
      // CR Revenue/Other (increase revenue or decrease liability)
      await db.execute(
        `INSERT INTO journal_line 
         (journal_entry_id, line_number, account_id, debit_amount, credit_amount, description)
         VALUES (?, 2, ?, 0, ?, ?)`,
        [journalEntryId, categoriesAccountId, amount, transaction.description]
      );
    } else {
      // Money going out
      // DR Expense/Other
      await db.execute(
        `INSERT INTO journal_line 
         (journal_entry_id, line_number, account_id, debit_amount, credit_amount, description)
         VALUES (?, 1, ?, ?, 0, ?)`,
        [journalEntryId, categoriesAccountId, amount, transaction.description]
      );
      
      // CR Bank (decrease asset)
      await db.execute(
        `INSERT INTO journal_line 
         (journal_entry_id, line_number, account_id, debit_amount, credit_amount, description)
         VALUES (?, 2, ?, 0, ?, ?)`,
        [journalEntryId, bankAccountId, amount, 'Payment from bank']
      );
    }
    
    // Update bank transaction to mark as matched
    await db.execute(
      `UPDATE bank_statement_transaction 
       SET match_status = 'manual_matched',
           matched_journal_entry_id = ?,
           confidence_score = 100.0,
           notes = ?
       WHERE id = ?`,
      [journalEntryId, notes || null, transactionId]
    );
    
    return {
      ok: true,
      journal_entry_id: journalEntryId,
      event_id: eventId,
      warnings: []
    };
    
  } catch (error) {
    console.error('Bank transaction import error:', error);
    
    let errorMessage = 'Unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return {
      ok: false,
      warnings: [{
        level: 'error',
        message: `Failed to import transaction: ${errorMessage}`
      }]
    };
  }
}
