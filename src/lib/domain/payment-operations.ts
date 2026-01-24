import { persistenceService } from '../services/persistence';
import type { PaymentMethod, PolicyContext } from '../domain/types';

export interface PaymentInput {
  payment_number: string;
  contact_id?: number;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  reference?: string;
  notes?: string;
}

export async function createPayment(
  paymentData: PaymentInput,
  allocations: Array<{ invoice_id: number; amount: number }>,
  context: PolicyContext
) {
  try {
    // Get required accounts first (fail fast if missing)
    const accounts = await persistenceService.getAccounts();
    const cashAccount = accounts.find(a => a.code === '1010'); // Checking Account
    const arAccount = accounts.find(a => a.code === '1100'); // Accounts Receivable

    if (!cashAccount || !arAccount) {
      throw new Error('Required accounts not found. Please ensure accounts 1010 (Cash) and 1100 (A/R) exist.');
    }

    // Validate that all invoice IDs exist
    if (allocations.length > 0) {
      const invoices = await persistenceService.getInvoices();
      for (const allocation of allocations) {
        const invoiceExists = invoices.find(inv => inv.id === allocation.invoice_id);
        if (!invoiceExists) {
          throw new Error(`Invoice ID ${allocation.invoice_id} not found`);
        }
      }
    }

    // Calculate allocated amount
    const allocatedAmount = allocations.reduce((sum, a) => sum + a.amount, 0);

    // Create transaction event
    const eventId = await persistenceService.createTransactionEvent({
      event_type: 'payment_received',
      description: `Payment ${paymentData.payment_number}`,
      reference: paymentData.payment_number,
      created_by: 'system',
    });

    // Create payment record
    const paymentId = await persistenceService.createPayment({
      ...paymentData,
      event_id: eventId,
      allocated_amount: allocatedAmount,
      status: allocatedAmount === paymentData.amount ? 'allocated' : 'partial',
    });

    // Create allocations
    for (const allocation of allocations) {
      await persistenceService.createAllocation({
        payment_id: paymentId,
        invoice_id: allocation.invoice_id,
        amount: allocation.amount,
        allocation_method: 'manual',
      });
    }

    // Create journal entry
    // DR Cash
    // CR Accounts Receivable
    const journalEntryId = await persistenceService.createJournalEntry(
      {
        event_id: eventId,
        entry_date: paymentData.payment_date,
        description: `Payment ${paymentData.payment_number}`,
        reference: paymentData.payment_number,
        status: 'posted',
      },
      [
        {
          account_id: cashAccount.id,
          debit_amount: paymentData.amount,
          credit_amount: 0,
          description: `Payment received`,
        },
        {
          account_id: arAccount.id,
          debit_amount: 0,
          credit_amount: paymentData.amount,
          description: `Payment applied to invoices`,
        },
      ]
    );

    return {
      ok: true,
      payment_id: paymentId,
      journal_entry_id: journalEntryId,
      event_id: eventId,
      warnings: [],
    };
  } catch (error) {
    console.error('Payment creation error:', error);
    
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
      } else if (errorMessage.includes('UNIQUE')) {
        errorMessage = 'This invoice number already exists. Please use a different number.';
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
