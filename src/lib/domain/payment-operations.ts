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
    // Create transaction event
    const eventId = await persistenceService.createTransactionEvent({
      event_type: 'payment_received',
      description: `Payment ${paymentData.payment_number}`,
      reference: paymentData.payment_number,
      created_by: 'system',
    });

    // Calculate allocated amount
    const allocatedAmount = allocations.reduce((sum, a) => sum + a.amount, 0);

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

    // Get accounts
    const cashAccount = (await persistenceService.getAccounts())
      .find(a => a.code === '1010'); // Checking Account
    const arAccount = (await persistenceService.getAccounts())
      .find(a => a.code === '1100'); // Accounts Receivable

    if (!cashAccount || !arAccount) {
      throw new Error('Required accounts not found');
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

    // Update invoice paid amounts
    for (const allocation of allocations) {
      const invoices = await persistenceService.getInvoices();
      const invoice = invoices.find(inv => inv.id === allocation.invoice_id);
      if (invoice) {
        const newPaidAmount = invoice.paid_amount + allocation.amount;
        const newStatus = 
          newPaidAmount >= invoice.total_amount ? 'paid' :
          newPaidAmount > 0 ? 'partial' : invoice.status;
        
        // Update via raw SQL
        const { getDatabase } = await import('../services/database');
        const db = await getDatabase();
        await db.execute(
          'UPDATE invoice SET paid_amount = ?, status = ? WHERE id = ?',
          [newPaidAmount, newStatus, invoice.id]
        );
      }
    }

    return {
      ok: true,
      payment_id: paymentId,
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
