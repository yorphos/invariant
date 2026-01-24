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
    // Validate payment amount is positive
    if (paymentData.amount <= 0) {
      throw new Error('Payment amount must be greater than 0');
    }

    // Get required accounts first (fail fast if missing)
    const accounts = await persistenceService.getAccounts();
    const cashAccount = accounts.find(a => a.code === '1010'); // Checking Account
    const arAccount = accounts.find(a => a.code === '1100'); // Accounts Receivable
    const customerDepositsAccount = accounts.find(a => a.code === '2150'); // Customer Deposits

    if (!cashAccount) {
      throw new Error('Required account not found. Please ensure account 1010 (Cash) exists.');
    }
    
    // For allocated payments, we need A/R account
    // For unallocated payments, we need Customer Deposits account
    if (allocations.length > 0 && !arAccount) {
      throw new Error('Required account not found. Please ensure account 1100 (A/R) exists.');
    }
    if (allocations.length === 0 && !customerDepositsAccount) {
      throw new Error('Required account not found. Please ensure account 2150 (Customer Deposits) exists.');
    }

    // Validate that all invoice IDs exist and allocation amounts are positive
    if (allocations.length > 0) {
      const invoices = await persistenceService.getInvoices();
      for (const allocation of allocations) {
        if (allocation.amount <= 0) {
          throw new Error(`Allocation amount must be greater than 0`);
        }
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
    // For allocated payments: DR Cash, CR Accounts Receivable
    // For unallocated payments: DR Cash, CR Customer Deposits
    const journalLines = [
      {
        account_id: cashAccount.id,
        debit_amount: paymentData.amount,
        credit_amount: 0,
        description: `Payment received`,
      },
    ];

    if (allocations.length > 0) {
      // Payment allocated to invoices - reduce A/R
      journalLines.push({
        account_id: arAccount!.id, // Safe because we validated above
        debit_amount: 0,
        credit_amount: paymentData.amount,
        description: `Payment applied to invoices`,
      });
    } else {
      // Unallocated payment - record as customer deposit (liability)
      journalLines.push({
        account_id: customerDepositsAccount!.id, // Safe because we validated above
        debit_amount: 0,
        credit_amount: paymentData.amount,
        description: `Unallocated payment - customer deposit`,
      });
    }

    const journalEntryId = await persistenceService.createJournalEntry(
      {
        event_id: eventId,
        entry_date: paymentData.payment_date,
        description: `Payment ${paymentData.payment_number}`,
        reference: paymentData.payment_number,
        status: 'posted',
      },
      journalLines
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
