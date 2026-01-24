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
    // Validate date logic
    if (new Date(invoiceData.due_date) < new Date(invoiceData.issue_date)) {
      throw new Error('Due date must be on or after issue date');
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
    const taxAmount = subtotal * 0.13; // 13% HST
    const totalAmount = subtotal + taxAmount;

    // Validate amounts are positive
    if (subtotal <= 0) {
      throw new Error('Invoice subtotal must be greater than 0');
    }
    if (totalAmount <= 0) {
      throw new Error('Invoice total must be greater than 0');
    }

    // Get required accounts first (fail fast if missing)
    const accounts = await persistenceService.getAccounts();
    const arAccount = accounts.find(a => a.code === '1100'); // Accounts Receivable
    const taxAccount = accounts.find(a => a.code === '2220'); // HST Payable

    if (!arAccount || !taxAccount) {
      throw new Error('Required accounts not found. Please ensure accounts 1100 (A/R) and 2220 (HST Payable) exist.');
    }

    // Validate that all line item accounts exist and are revenue accounts
    for (const line of recalculatedLines) {
      const account = accounts.find(a => a.id === line.account_id);
      if (!account) {
        throw new Error(`Account ID ${line.account_id} not found for line item: ${line.description}`);
      }
      if (account.type !== 'revenue') {
        throw new Error(`Account "${account.name}" must be a revenue account for invoice line items`);
      }
    }

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
      recalculatedLines // Use recalculated lines
    );

    // Create journal entries (AR posting)
    // DR Accounts Receivable
    // CR Revenue (per line item)
    // CR Sales Tax Payable

    const journalLines = [
      // Debit A/R
      {
        account_id: arAccount.id,
        debit_amount: totalAmount,
        credit_amount: 0,
        description: `Invoice ${invoiceData.invoice_number}`,
      },
    ];

    // Credit revenue accounts (one per line item)
    for (const line of recalculatedLines) {
      journalLines.push({
        account_id: line.account_id!, // Safe: validated above
        debit_amount: 0,
        credit_amount: line.amount,
        description: line.description,
      });
    }
    
    // Credit tax
    journalLines.push({
      account_id: taxAccount.id,
      debit_amount: 0,
      credit_amount: taxAmount,
      description: 'HST collected',
    });

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
    console.error('Invoice creation error:', error);
    
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
