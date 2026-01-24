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
    if (!arAccount) {
      throw new Error('Required account not found. Please ensure account 1100 (A/R) exists.');
    }
    if (!customerDepositsAccount) {
      throw new Error('Required account not found. Please ensure account 2150 (Customer Deposits) exists.');
    }

    // Get all open invoices for FIFO allocation
    let allOpenInvoices = await persistenceService.getOpenInvoices();
    
    // If contact_id is specified, filter to that contact
    if (paymentData.contact_id) {
      allOpenInvoices = allOpenInvoices.filter(inv => inv.contact_id === paymentData.contact_id);
    }
    
    // Sort by issue_date for FIFO (oldest first)
    allOpenInvoices.sort((a, b) => new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime());

    // If no invoices selected, use FIFO across all open invoices
    let finalAllocations: Array<{ invoice_id: number; amount: number }>;
    
    if (allocations.length === 0) {
      // Auto-allocate using FIFO
      finalAllocations = [];
      let remainingAmount = paymentData.amount;
      
      for (const invoice of allOpenInvoices) {
        if (remainingAmount <= 0) break;
        
        const outstanding = invoice.total_amount - invoice.paid_amount;
        const allocationAmount = Math.min(remainingAmount, outstanding);
        
        if (allocationAmount > 0) {
          finalAllocations.push({
            invoice_id: invoice.id!,
            amount: allocationAmount
          });
          remainingAmount -= allocationAmount;
        }
      }
    } else {
      // User selected specific invoices - apply FIFO to selected invoices
      finalAllocations = [];
      let remainingAmount = paymentData.amount;
      
      // Get the selected invoice details and sort by date
      const selectedInvoiceIds = allocations.map(a => a.invoice_id);
      const selectedInvoices = allOpenInvoices.filter(inv => selectedInvoiceIds.includes(inv.id!));
      
      for (const invoice of selectedInvoices) {
        if (remainingAmount <= 0) break;
        
        const outstanding = invoice.total_amount - invoice.paid_amount;
        const allocationAmount = Math.min(remainingAmount, outstanding);
        
        if (allocationAmount > 0) {
          finalAllocations.push({
            invoice_id: invoice.id!,
            amount: allocationAmount
          });
          remainingAmount -= allocationAmount;
        }
      }
    }

    // Validate all allocations
    const invoices = await persistenceService.getInvoices();
    let totalAllocated = 0;
    
    for (const allocation of finalAllocations) {
      // Validate allocation amount is positive
      if (allocation.amount <= 0) {
        throw new Error(`Allocation amount must be greater than 0`);
      }
      
      // Validate invoice exists
      const invoice = invoices.find(inv => inv.id === allocation.invoice_id);
      if (!invoice) {
        throw new Error(`Invoice ID ${allocation.invoice_id} not found`);
      }
      
      // Validate invoice won't be overpaid
      const newPaidAmount = invoice.paid_amount + allocation.amount;
      if (newPaidAmount > invoice.total_amount + 0.01) { // Allow 1 cent rounding tolerance
        throw new Error(
          `Allocation of $${allocation.amount.toFixed(2)} would overpay invoice ${invoice.invoice_number}. ` +
          `Outstanding: $${(invoice.total_amount - invoice.paid_amount).toFixed(2)}`
        );
      }
      
      totalAllocated += allocation.amount;
    }
    
    // Validate payment isn't over-allocated
    if (totalAllocated > paymentData.amount + 0.01) { // Allow 1 cent rounding tolerance
      throw new Error(
        `Cannot allocate $${totalAllocated.toFixed(2)} when payment is only $${paymentData.amount.toFixed(2)}`
      );
    }

    // Calculate allocated amount (might be less than payment amount)
    const allocatedAmount = totalAllocated;

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
      status: Math.abs(allocatedAmount - paymentData.amount) < 0.01 ? 'allocated' : 'partial',
    });

    // Create allocations
    for (const allocation of finalAllocations) {
      await persistenceService.createAllocation({
        payment_id: paymentId,
        invoice_id: allocation.invoice_id,
        amount: allocation.amount,
        allocation_method: finalAllocations.length === allocations.length ? 'manual' : 'fifo',
      });
    }

    // Create journal entry
    // CRITICAL FIX: Use allocatedAmount (not paymentData.amount) for allocated portion
    const journalLines = [
      {
        account_id: cashAccount.id,
        debit_amount: paymentData.amount,
        credit_amount: 0,
        description: `Payment received`,
      },
    ];

    if (allocatedAmount > 0) {
      // Payment allocated to invoices - reduce A/R by allocated amount
      journalLines.push({
        account_id: arAccount.id,
        debit_amount: 0,
        credit_amount: allocatedAmount, // FIXED: was paymentData.amount
        description: `Payment applied to ${finalAllocations.length} invoice(s)`,
      });
    }
    
    // If there's unallocated amount, record as customer deposit
    const unallocatedAmount = paymentData.amount - allocatedAmount;
    if (unallocatedAmount > 0.01) {
      journalLines.push({
        account_id: customerDepositsAccount.id,
        debit_amount: 0,
        credit_amount: unallocatedAmount,
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
        errorMessage = 'This payment number already exists. Please use a different number.';
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
