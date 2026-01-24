import { persistenceService } from '../services/persistence';
import type { PolicyContext } from '../domain/types';

export interface ExpenseInput {
  description: string;
  amount: number;
  expense_date: string;
  vendor_id?: number;
  expense_account_id: number;
  payment_account_id: number;
  reference?: string;
  notes?: string;
}

export async function createExpense(
  expenseData: ExpenseInput,
  context: PolicyContext
) {
  try {
    // Validate that accounts exist (fail fast)
    const accounts = await persistenceService.getAccounts();
    const expenseAccount = accounts.find(a => a.id === expenseData.expense_account_id);
    const paymentAccount = accounts.find(a => a.id === expenseData.payment_account_id);

    if (!expenseAccount) {
      throw new Error(`Expense account ID ${expenseData.expense_account_id} not found`);
    }
    if (!paymentAccount) {
      throw new Error(`Payment account ID ${expenseData.payment_account_id} not found`);
    }

    // Execute all operations in a transaction for atomicity
    const result = await persistenceService.executeInTransaction(async () => {
      // Create transaction event
      const eventId = await persistenceService.createTransactionEvent({
        event_type: 'expense_recorded',
        description: expenseData.description,
        reference: expenseData.reference,
        created_by: 'system',
      });

      // Create journal entry
      // DR Expense Account
      // CR Cash/Bank Account
      const journalEntryId = await persistenceService.createJournalEntry(
        {
          event_id: eventId,
          entry_date: expenseData.expense_date,
          description: expenseData.description,
          reference: expenseData.reference,
          status: 'posted',
        },
        [
          {
            account_id: expenseData.expense_account_id,
            debit_amount: expenseData.amount,
            credit_amount: 0,
            description: expenseData.description,
          },
          {
            account_id: expenseData.payment_account_id,
            debit_amount: 0,
            credit_amount: expenseData.amount,
            description: 'Payment',
          },
        ]
      );

      return {
        journal_entry_id: journalEntryId,
        event_id: eventId,
      };
    });

    return {
      ok: true,
      ...result,
      warnings: [],
    };
  } catch (error) {
    console.error('Expense creation error:', error);
    
    // Provide more detailed error information
    let errorMessage = 'Unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error('Error stack:', error.stack);
      
      // Check for specific SQLite errors
      if (errorMessage.includes('1811')) {
        errorMessage = 'Database integrity error (1811). This may be caused by database corruption or trigger issues. Please try again.';
      } else if (errorMessage.includes('FOREIGN KEY')) {
        errorMessage = 'Foreign key constraint error. Please ensure all referenced data exists.';
      } else if (errorMessage.includes('balanced')) {
        errorMessage = 'Journal entry is not balanced. This is an internal error - please report it.';
      }
    }
    
    return {
      ok: false,
      warnings: [
        {
          level: 'error' as const,
          message: errorMessage,
          requiresOverride: false,
        },
      ],
    };
  }
}
