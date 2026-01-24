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
      ok: true,
      journal_entry_id: journalEntryId,
      event_id: eventId,
      warnings: [],
    };
  } catch (error) {
    return {
      ok: false,
      warnings: [
        {
          level: 'error' as const,
          message: String(error),
          requiresOverride: false,
        },
      ],
    };
  }
}
