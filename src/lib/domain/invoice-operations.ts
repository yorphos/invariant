import { persistenceService } from '../services/persistence';
import { PostingEngine } from '../domain/posting-engine';
import { calculateTax } from '../services/tax';
import { getSystemAccount } from '../services/system-accounts';
import type { Invoice, InvoiceLine, PolicyContext } from '../domain/types';

const postingEngine = new PostingEngine();

export interface InvoiceInput {
  invoice_number: string;
  contact_id: number;
  issue_date: string;
  due_date: string;
  tax_code_id?: number;
  notes?: string;
}

/**
 * Validate invoice data and recalculate amounts
 * Shared logic for create and edit operations
 */
async function validateAndRecalculateInvoice(
  invoiceData: InvoiceInput,
  lines: InvoiceLine[]
) {
  // Validate date logic
  if (new Date(invoiceData.due_date) < new Date(invoiceData.issue_date)) {
    throw new Error('Due date must be on or after issue date');
  }
  
  // Require tax_code_id
  if (!invoiceData.tax_code_id) {
    throw new Error('Tax code is required for invoices');
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
    invoiceData.tax_code_id,
    invoiceData.issue_date
  );
  
  const totalAmount = subtotal + taxAmount;

  // Validate amounts are positive
  if (subtotal <= 0) {
    throw new Error('Invoice subtotal must be greater than 0');
  }
  if (totalAmount <= 0) {
    throw new Error('Invoice total must be greater than 0');
  }
  
  return {
    recalculatedLines,
    subtotal,
    taxAmount,
    totalAmount,
    taxAccountId,
  };
}

export async function createInvoice(
  invoiceData: InvoiceInput,
  lines: InvoiceLine[],
  context: PolicyContext
) {
  try {
    const { recalculatedLines, subtotal, taxAmount, totalAmount, taxAccountId } = 
      await validateAndRecalculateInvoice(invoiceData, lines);

    // Get required accounts first (fail fast if missing)
    const accounts = await persistenceService.getAccounts();
    const arAccount = await getSystemAccount('accounts_receivable');
    
    // Tax account comes from tax rate lookup
    const taxAccount = taxAccountId ? accounts.find(a => a.id === taxAccountId) : null;
    
    if (taxAmount > 0 && !taxAccount) {
      throw new Error('Tax account not found for the selected tax code.');
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
        tax_code_id: invoiceData.tax_code_id,
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
    
    // Credit tax (only if tax amount > 0)
    if (taxAmount > 0 && taxAccount) {
      journalLines.push({
        account_id: taxAccount.id,
        debit_amount: 0,
        credit_amount: taxAmount,
        description: 'Sales tax collected',
      });
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

/**
 * Void an invoice
 * Creates reversal journal entries and marks invoice as void
 */
export async function voidInvoice(
  invoiceId: number,
  reason: string,
  context: PolicyContext
) {
  try {
    // Get the invoice
    const invoices = await persistenceService.getInvoices();
    const invoice = invoices.find(inv => inv.id === invoiceId);
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    // Check if invoice can be voided
    if (invoice.status === 'void') {
      throw new Error('Invoice is already voided');
    }
    
    if (invoice.paid_amount > 0) {
      throw new Error('Cannot void an invoice with payments applied. Please reverse payments first.');
    }
    
    // Get required accounts
    const accounts = await persistenceService.getAccounts();
    const arAccount = await getSystemAccount('accounts_receivable');
    
    // Get tax account from invoice's tax code
    let taxAccount = null;
    if (invoice.tax_code_id && invoice.tax_amount > 0) {
      const taxRate = await import('../services/tax').then(m => m.getTaxRate(invoice.tax_code_id!, invoice.issue_date));
      if (taxRate && taxRate.account_id) {
        taxAccount = accounts.find(a => a.id === taxRate.account_id);
      }
    }
    
    // Get invoice lines from database
    const db = await import('../services/database').then(m => m.getDatabase());
    const invoiceLines = await (await db).select<InvoiceLine[]>(
      'SELECT * FROM invoice_line WHERE invoice_id = ? ORDER BY line_number',
      [invoiceId]
    );
    
    // Create transaction event for void
    const eventId = await persistenceService.createTransactionEvent({
      event_type: 'invoice_voided',
      description: `Void Invoice ${invoice.invoice_number} - ${reason}`,
      reference: invoice.invoice_number,
      created_by: 'system',
      metadata: JSON.stringify({ original_invoice_id: invoiceId, reason }),
    });
    
    // Create reversal journal entries (opposite of original posting)
    // Original was: DR A/R, CR Revenue, CR Tax
    // Reversal is: CR A/R, DR Revenue, DR Tax
    
    const journalLines = [
      // Credit A/R (reversal of debit)
      {
        account_id: arAccount.id,
        debit_amount: 0,
        credit_amount: invoice.total_amount,
        description: `VOID: Invoice ${invoice.invoice_number}`,
      },
    ];
    
    // Debit revenue accounts (reversal of credits)
    for (const line of invoiceLines) {
      if (line.account_id) {
        journalLines.push({
          account_id: line.account_id,
          debit_amount: line.amount,
          credit_amount: 0,
          description: `VOID: ${line.description}`,
        });
      }
    }
    
    // Debit tax (reversal of credit) - only if there was tax
    if (invoice.tax_amount > 0 && taxAccount) {
      journalLines.push({
        account_id: taxAccount.id,
        debit_amount: invoice.tax_amount,
        credit_amount: 0,
        description: 'VOID: Sales tax collected',
      });
    }
    
    // Create the reversal journal entry
    const journalEntryId = await persistenceService.createJournalEntry(
      {
        event_id: eventId,
        entry_date: new Date().toISOString().split('T')[0], // Today's date for void
        description: `VOID: Invoice ${invoice.invoice_number} - ${reason}`,
        reference: invoice.invoice_number,
        status: 'posted',
      },
      journalLines
    );
    
    // Update invoice status to void
    const updateDb = await db;
    await updateDb.execute(
      'UPDATE invoice SET status = ?, updated_at = datetime("now") WHERE id = ?',
      ['void', invoiceId]
    );
    
    return {
      ok: true,
      journal_entry_id: journalEntryId,
      event_id: eventId,
      warnings: [],
    };
  } catch (error) {
    console.error('Invoice void error:', error);
    
    let errorMessage = 'Unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
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

/**
 * Edit an invoice
 * - If invoice is draft: update it directly
 * - If invoice is posted: void and recreate with new data
 */
export async function editInvoice(
  invoiceId: number,
  invoiceData: InvoiceInput,
  lines: InvoiceLine[],
  context: PolicyContext
) {
  try {
    // Get the invoice
    const invoices = await persistenceService.getInvoices();
    const invoice = invoices.find(inv => inv.id === invoiceId);
    
    if (!invoice) {
      throw new Error('Invoice not found');
    }
    
    // Cannot edit voided invoices
    if (invoice.status === 'void') {
      throw new Error('Cannot edit a voided invoice');
    }
    
    // Cannot edit paid or partially paid invoices (must void and recreate)
    if (invoice.paid_amount > 0) {
      throw new Error('Cannot edit an invoice with payments applied. You must void this invoice and create a new one.');
    }
    
    // For draft invoices, we could update directly (future enhancement)
    // For now, we'll use the void-and-recreate approach for all posted invoices
    
    if (invoice.status === 'draft') {
      // Direct edit not implemented yet - draft invoices are rare in this system
      throw new Error('Editing draft invoices is not yet supported. Please delete and recreate.');
    }
    
    // Void the original invoice
    const voidResult = await voidInvoice(
      invoiceId,
      'Invoice edited - voiding original',
      context
    );
    
    if (!voidResult.ok) {
      return voidResult;
    }
    
    // Create new invoice with updated data
    const createResult = await createInvoice(invoiceData, lines, context);
    
    if (!createResult.ok) {
      return createResult;
    }
    
    return {
      ok: true,
      invoice_id: createResult.invoice_id,
      journal_entry_id: createResult.journal_entry_id,
      event_id: createResult.event_id,
      warnings: [
        {
          level: 'warning' as const,
          message: `Original invoice ${invoice.invoice_number} has been voided and a new invoice has been created.`,
          requiresOverride: false,
        },
      ],
      void_result: voidResult,
    };
  } catch (error) {
    console.error('Invoice edit error:', error);
    
    let errorMessage = 'Unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;
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
