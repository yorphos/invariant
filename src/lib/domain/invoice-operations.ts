import { persistenceService } from '../services/persistence';
import { PostingEngine } from '../domain/posting-engine';
import type { Invoice, InvoiceLine, PolicyContext } from '../domain/types';

const postingEngine = new PostingEngine();

export interface InvoiceInput {
  invoice_number: string;
  contact_id: number;
  issue_date: string;
  due_date: string;
  notes?: string;
}

export async function createInvoice(
  invoiceData: InvoiceInput,
  lines: InvoiceLine[],
  context: PolicyContext
) {
  try {
    // Calculate totals
    const subtotal = lines.reduce((sum, line) => sum + line.amount, 0);
    const taxAmount = subtotal * 0.13; // 13% HST
    const totalAmount = subtotal + taxAmount;

    // Create transaction event
    const eventId = await persistenceService.createTransactionEvent({
      event_type: 'invoice_created',
      description: `Invoice ${invoiceData.invoice_number}`,
      reference: invoiceData.invoice_number,
      created_by: 'system',
    });

    // Create invoice record
    const invoiceId = await persistenceService.createInvoice(
      {
        ...invoiceData,
        event_id: eventId,
        status: 'sent',
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        paid_amount: 0,
      },
      lines
    );

    // Create journal entries (AR posting)
    // DR Accounts Receivable
    // CR Revenue (per line item)
    // CR Sales Tax Payable
    
    const arAccount = (await persistenceService.getAccounts())
      .find(a => a.code === '1100'); // Accounts Receivable
    const taxAccount = (await persistenceService.getAccounts())
      .find(a => a.code === '2220'); // HST Payable

    if (!arAccount || !taxAccount) {
      throw new Error('Required accounts not found');
    }

    const journalLines = [
      // Debit A/R
      {
        account_id: arAccount.id,
        debit_amount: totalAmount,
        credit_amount: 0,
        description: `Invoice ${invoiceData.invoice_number}`,
      },
      // Credit tax
      {
        account_id: taxAccount.id,
        debit_amount: 0,
        credit_amount: taxAmount,
        description: 'HST collected',
      },
    ];

    // Credit each revenue line
    for (const line of lines) {
      if (line.account_id) {
        journalLines.push({
          account_id: line.account_id,
          debit_amount: 0,
          credit_amount: line.amount,
          description: line.description,
        });
      }
    }

    const journalEntryId = await persistenceService.createJournalEntry(
      {
        event_id: eventId,
        entry_date: invoiceData.issue_date,
        description: `Invoice ${invoiceData.invoice_number}`,
        reference: invoiceData.invoice_number,
        status: 'posted',
      },
      journalLines
    );

    return {
      ok: true,
      invoice_id: invoiceId,
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
