import { persistenceService } from '../services/persistence';
import { calculateTax } from '../services/tax';
import { getSystemAccount } from '../services/system-accounts';
import { getDatabase } from '../services/database';
import type { Bill, BillLine, VendorPayment, PolicyContext } from '../domain/types';

export interface BillInput {
  bill_number: string;
  vendor_id: number;
  bill_date: string;
  due_date: string;
  tax_code_id?: number;
  reference?: string;
  notes?: string;
}

export interface PostingResult {
  ok: boolean;
  warnings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }>;
  bill_id?: number;
  journal_entry_id?: number;
}

/**
 * Validate bill data and recalculate amounts
 * Shared logic for create operations
 */
async function validateAndRecalculateBill(
  billData: BillInput,
  lines: BillLine[]
) {
  // Validate date logic
  if (new Date(billData.due_date) < new Date(billData.bill_date)) {
    throw new Error('Due date must be on or after bill date');
  }
  
  // Require tax_code_id
  if (!billData.tax_code_id) {
    throw new Error('Tax code is required for bills');
  }
  
  // Recalculate all line amounts server-side (don't trust client)
  const recalculatedLines = lines.map(line => {
    // Validate required fields
    if (!line.description || line.description.trim() === '') {
      throw new Error('Line item description is required');
    }
    if (!line.account_id) {
      throw new Error(`Line item "${line.description}" must have an account assigned`);
    }
    if (!line.quantity || line.quantity <= 0) {
      throw new Error(`Line item "${line.description}" must have a quantity greater than 0`);
    }
    if (!line.unit_price || line.unit_price <= 0) {
      throw new Error(`Line item "${line.description}" must have a unit price greater than 0`);
    }
    
    // Recalculate amount server-side
    const calculatedAmount = line.quantity * line.unit_price;
    
    // Validate client-provided amount matches (allow 1 cent tolerance for rounding)
    if (line.amount && Math.abs(calculatedAmount - line.amount) > 0.01) {
      throw new Error(
        `Amount mismatch for "${line.description}": ` +
        `${line.quantity} × $${line.unit_price} = $${calculatedAmount.toFixed(2)}, ` +
        `but received $${line.amount.toFixed(2)}`
      );
    }
    
    return {
      ...line,
      amount: calculatedAmount // Use server-calculated amount
    };
  });
  
  // Calculate totals from recalculated amounts
  const subtotal = recalculatedLines.reduce((sum, line) => sum + line.amount, 0);
  
  // Calculate tax using tax service (looks up rate from database)
  const { taxAmount, accountId: taxAccountId } = await calculateTax(
    subtotal,
    billData.tax_code_id,
    billData.bill_date
  );
  
  const totalAmount = subtotal + taxAmount;

  // Validate amounts are positive
  if (subtotal <= 0) {
    throw new Error('Bill subtotal must be greater than 0');
  }
  if (totalAmount <= 0) {
    throw new Error('Bill total must be greater than 0');
  }
  
  return {
    recalculatedLines,
    subtotal,
    taxAmount,
    totalAmount,
    taxAccountId,
  };
}

/**
 * Create a vendor bill (A/P)
 * @param billData Bill header data
 * @param lines Bill line items (expenses)
 * @param context Policy context
 * @returns Posting result with bill ID and journal entry ID
 */
export async function createBill(
  billData: BillInput,
  lines: BillLine[],
  context: PolicyContext
): Promise<PostingResult> {
  try {
    const { recalculatedLines, subtotal, taxAmount, totalAmount, taxAccountId } = 
      await validateAndRecalculateBill(billData, lines);

    // Get required accounts first (fail fast if missing)
    const accounts = await persistenceService.getAccounts();
    const apAccount = await getSystemAccount('accounts_payable');
    
    // Tax account comes from tax rate lookup
    const taxAccount = taxAccountId ? accounts.find(a => a.id === taxAccountId) : null;
    
    if (taxAmount > 0 && !taxAccount) {
      throw new Error('Tax account not found for the selected tax code.');
    }

    // Validate that all line item accounts exist and are expense accounts
    for (const line of recalculatedLines) {
      const account = accounts.find(a => a.id === line.account_id);
      if (!account) {
        throw new Error(`Account ID ${line.account_id} not found for line item: ${line.description}`);
      }
      if (account.type !== 'expense') {
        throw new Error(`Account "${account.name}" must be an expense account for bill line items`);
      }
    }

    // Create transaction event
    const eventId = await persistenceService.createTransactionEvent({
      event_type: 'bill_created',
      description: `Bill ${billData.bill_number}`,
      reference: billData.bill_number,
      created_by: 'system',
    });

    // Create bill record in database
    const db = await getDatabase();
    
    const result = await db.execute(
      `INSERT INTO bill (
        bill_number, vendor_id, event_id, bill_date, due_date,
        status, subtotal, tax_amount, total_amount, paid_amount,
        tax_code_id, reference, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        billData.bill_number,
        billData.vendor_id,
        eventId,
        billData.bill_date,
        billData.due_date,
        'pending',
        subtotal,
        taxAmount,
        totalAmount,
        0,
        billData.tax_code_id,
        billData.reference || null,
        billData.notes || null
      ]
    );

    const billId = result.lastInsertId;

    // Insert bill lines
    for (const line of recalculatedLines) {
      await db.execute(
        `INSERT INTO bill_line (
          bill_id, line_number, description, quantity, unit_price, amount, account_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          billId,
          line.line_number,
          line.description,
          line.quantity,
          line.unit_price,
          line.amount,
          line.account_id
        ]
      );
    }

    // Create journal entry for bill (A/P increases)
    // Debit: Expense accounts (by line)
    // Debit: Tax expense/recoverable
    // Credit: Accounts Payable (total)
    
    const journalLines = [];
    
    // Debit expense accounts (one per line item)
    for (const line of recalculatedLines) {
      journalLines.push({
        account_id: line.account_id,
        debit_amount: line.amount,
        credit_amount: 0,
        description: line.description,
      });
    }
    
    // Debit tax if applicable
    if (taxAmount > 0 && taxAccountId) {
      journalLines.push({
        account_id: taxAccountId,
        debit_amount: taxAmount,
        credit_amount: 0,
        description: 'Tax on purchases',
      });
    }
    
    // Credit A/P (total amount)
    journalLines.push({
      account_id: apAccount.id!,
      debit_amount: 0,
      credit_amount: totalAmount,
      description: `Bill ${billData.bill_number}`,
    });

    // Create journal entry
    const journalEntryId = await persistenceService.createJournalEntry(
      {
        event_id: eventId,
        entry_date: billData.bill_date,
        description: `Bill ${billData.bill_number}`,
        reference: billData.bill_number,
        status: 'posted',
      },
      journalLines
    );

    return {
      ok: true,
      warnings: [],
      bill_id: billId,
      journal_entry_id: journalEntryId,
    };

  } catch (error) {
    console.error('Bill creation error:', error);
    return {
      ok: false,
      warnings: [
        {
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

/**
 * Void a bill (creates reversal journal entries)
 * @param billId Bill ID to void
 * @param reason Reason for voiding
 * @param context Policy context
 * @returns Posting result
 */
export async function voidBill(
  billId: number,
  reason: string,
  context: PolicyContext
): Promise<PostingResult> {
  try {
    const db = await getDatabase();
    
    // Get bill
    const bills = await db.select<Bill[]>(
      'SELECT * FROM bill WHERE id = ?',
      [billId]
    );
    
    if (bills.length === 0) {
      throw new Error('Bill not found');
    }
    
    const bill = bills[0];
    
    // Check if bill can be voided
    if (bill.status === 'void') {
      throw new Error('Bill is already voided');
    }
    
    if (bill.paid_amount > 0) {
      throw new Error('Cannot void a bill with payments applied. Please reverse payments first.');
    }

    // Get bill lines
    const billLines = await db.select<BillLine[]>(
      'SELECT * FROM bill_line WHERE bill_id = ? ORDER BY line_number',
      [billId]
    );
    
    // Get required accounts
    const accounts = await persistenceService.getAccounts();
    const apAccount = await getSystemAccount('accounts_payable');
    
    // Get tax account if bill had tax
    let taxAccount = null;
    if (bill.tax_code_id && bill.tax_amount > 0) {
      const taxInfo = await calculateTax(0, bill.tax_code_id, bill.bill_date);
      taxAccount = accounts.find(a => a.id === taxInfo.accountId) || null;
    }

    // Create transaction event for void
    const eventId = await persistenceService.createTransactionEvent({
      event_type: 'bill_voided',
      description: `Void Bill ${bill.bill_number} - ${reason}`,
      reference: bill.bill_number,
      created_by: 'system',
    });

    // Create reversal journal entries (opposite of original posting)
    // Original was: DR Expenses, DR Tax, CR A/P
    // Reversal is: CR Expenses, CR Tax, DR A/P
    
    const journalLines = [];
    
    // Credit expense accounts (reversal of debits)
    for (const line of billLines) {
      journalLines.push({
        account_id: line.account_id,
        debit_amount: 0,
        credit_amount: line.amount,
        description: `VOID: ${line.description}`,
      });
    }
    
    // Credit tax (reversal of debit) - only if there was tax
    if (bill.tax_amount > 0 && taxAccount) {
      journalLines.push({
        account_id: taxAccount.id!,
        debit_amount: 0,
        credit_amount: bill.tax_amount,
        description: 'VOID: Tax on purchases',
      });
    }
    
    // Debit A/P (reversal of credit)
    journalLines.push({
      account_id: apAccount.id!,
      debit_amount: bill.total_amount,
      credit_amount: 0,
      description: `VOID: Bill ${bill.bill_number}`,
    });

    // Create the reversal journal entry
    const journalEntryId = await persistenceService.createJournalEntry(
      {
        event_id: eventId,
        entry_date: new Date().toISOString().split('T')[0], // Today's date for void
        description: `VOID: Bill ${bill.bill_number} - ${reason}`,
        reference: bill.bill_number,
        status: 'posted',
      },
      journalLines
    );

    // Update bill status to void
    await db.execute(
      'UPDATE bill SET status = ?, updated_at = datetime("now") WHERE id = ?',
      ['void', billId]
    );

    return {
      ok: true,
      warnings: [],
      bill_id: billId,
      journal_entry_id: journalEntryId,
    };

  } catch (error) {
    console.error('Bill void error:', error);
    return {
      ok: false,
      warnings: [
        {
          severity: 'error',
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}
