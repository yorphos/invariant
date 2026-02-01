import { persistenceService } from '../services/persistence';
import { getDatabase } from '../services/database';
import { getSystemAccount } from '../services/system-accounts';
import { calculateTax, getTaxRate } from '../services/tax';
import type {
  CreditNote,
  CreditNoteLine,
  CreditNoteApplication,
  CreditNoteRefund,
  PolicyContext,
  PostingResult,
} from '../domain/types';

export interface CreditNoteInput {
  credit_note_number: string;
  contact_id: number;
  issue_date: string;
  tax_code_id?: number;
  notes?: string;
}

async function validateAndRecalculateCreditNote(
  creditNoteData: CreditNoteInput,
  lines: CreditNoteLine[]
) {
  const recalculatedLines = lines.map(line => {
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

    const calculatedAmount = line.quantity * line.unit_price;

    if (line.amount && Math.abs(calculatedAmount - line.amount) > 0.01) {
      throw new Error(
        `Amount mismatch for "${line.description}": ` +
        `${line.quantity} × $${line.unit_price} = $${calculatedAmount.toFixed(2)}, ` +
        `but received $${line.amount.toFixed(2)}`
      );
    }

    return {
      ...line,
      amount: calculatedAmount,
      is_tax_inclusive: line.is_tax_inclusive ?? false,
    };
  });

  const subtotal = recalculatedLines.reduce((sum, line) => sum + line.amount, 0);

  const hasTaxInclusiveLines = recalculatedLines.some(line => line.is_tax_inclusive);
  if (hasTaxInclusiveLines && recalculatedLines.some(line => !line.is_tax_inclusive)) {
    throw new Error('All credit note lines must use same tax inclusive setting');
  }

  const { taxAmount, taxRate, accountId: taxAccountId, netSubtotal } = await calculateTax(
    subtotal,
    creditNoteData.tax_code_id ?? 1,
    creditNoteData.issue_date,
    hasTaxInclusiveLines
  );

  const effectiveSubtotal = netSubtotal;
  const totalAmount = hasTaxInclusiveLines ? subtotal : subtotal + taxAmount;

  if (effectiveSubtotal <= 0) {
    throw new Error('Credit note subtotal must be greater than 0');
  }
  if (totalAmount <= 0) {
    throw new Error('Credit note total must be greater than 0');
  }

  return {
    recalculatedLines,
    subtotal: effectiveSubtotal,
    taxAmount,
    totalAmount,
    taxAccountId,
    isTaxInclusive: hasTaxInclusiveLines,
    taxRate,
  };
}

export async function createCreditNote(
  creditNoteData: CreditNoteInput,
  lines: CreditNoteLine[],
  context: PolicyContext
): Promise<PostingResult> {
  try {
    const { recalculatedLines, subtotal, taxAmount, totalAmount, taxAccountId, taxRate, isTaxInclusive } =
      await validateAndRecalculateCreditNote(creditNoteData, lines);

    const accounts = await persistenceService.getAccounts();
    const arAccount = await getSystemAccount('accounts_receivable');
    const taxAccount = taxAccountId ? accounts.find(a => a.id === taxAccountId) : null;

    if (taxAmount > 0 && !taxAccount) {
      throw new Error('Tax account not found for selected tax code.');
    }

    for (const line of recalculatedLines) {
      const account = accounts.find(a => a.id === line.account_id);
      if (!account) {
        throw new Error(`Account ID ${line.account_id} not found for line item: ${line.description}`);
      }
      if (account.type !== 'revenue') {
        throw new Error(`Account "${account.name}" must be a revenue account for credit note line items`);
      }
    }

    const eventId = await persistenceService.createTransactionEvent({
      event_type: 'credit_note_created',
      description: `Credit Note ${creditNoteData.credit_note_number}`,
      reference: creditNoteData.credit_note_number,
      created_by: 'system',
    });

    const creditNoteId = await persistenceService.createCreditNote(
      {
        ...creditNoteData,
        event_id: eventId,
        status: 'issued',
        subtotal,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        applied_amount: 0,
        tax_code_id: creditNoteData.tax_code_id,
      },
      recalculatedLines
    );

    const journalLines = [
      {
        account_id: arAccount.id,
        debit_amount: 0,
        credit_amount: totalAmount,
        description: `Credit Note ${creditNoteData.credit_note_number}`,
      },
    ];

    for (const line of recalculatedLines) {
      const revenueAmount = isTaxInclusive && taxRate > 0
        ? line.amount / (1 + taxRate)
        : line.amount;
      journalLines.push({
        account_id: line.account_id!,
        debit_amount: revenueAmount,
        credit_amount: 0,
        description: line.description,
      });
    }

    if (taxAmount > 0 && taxAccount) {
      journalLines.push({
        account_id: taxAccount.id,
        debit_amount: taxAmount,
        credit_amount: 0,
        description: 'Sales tax reversal',
      });
    }

    const journalEntryId = await persistenceService.createJournalEntry(
      {
        event_id: eventId,
        entry_date: creditNoteData.issue_date,
        description: `Credit Note ${creditNoteData.credit_note_number}`,
        reference: creditNoteData.credit_note_number,
        status: 'posted',
      },
      journalLines
    );

    return {
      ok: true,
      journal_entry_id: journalEntryId,
      event_id: eventId,
      warnings: [],
    };
  } catch (error) {
    let errorMessage = 'Unknown error occurred';
    if (error instanceof Error) {
      errorMessage = error.message;

      if (errorMessage.includes('1811')) {
        errorMessage = 'Database integrity error (1811). This may be caused by database corruption or trigger issues. Please try again.';
      } else if (errorMessage.includes('FOREIGN KEY')) {
        errorMessage = 'Foreign key constraint error. Please ensure all referenced data exists.';
      } else if (errorMessage.includes('UNIQUE')) {
        errorMessage = 'This credit note number already exists. Please use a different number.';
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

export async function applyCreditNote(
  creditNoteId: number,
  invoiceId: number,
  amount: number,
  notes?: string
): Promise<PostingResult> {
  try {
    const creditNotes = await persistenceService.getCreditNotes();
    const creditNote = creditNotes.find(cn => cn.id === creditNoteId);

    if (!creditNote) {
      throw new Error('Credit note not found');
    }

    const invoices = await persistenceService.getInvoices();
    const invoice = invoices.find(inv => inv.id === invoiceId);

    if (!invoice) {
      throw new Error('Invoice not found');
    }

    if (creditNote.status === 'void') {
      throw new Error('Cannot apply a voided credit note');
    }

    if (invoice.status === 'void') {
      throw new Error('Cannot apply credit note to a voided invoice');
    }

    const availableAmount = creditNote.total_amount - creditNote.applied_amount;
    if (amount > availableAmount) {
      throw new Error(
        `Cannot apply $${amount.toFixed(2)}. Only $${availableAmount.toFixed(2)} available on credit note.`
      );
    }

    const outstandingInvoice = invoice.total_amount - invoice.paid_amount;
    if (amount > outstandingInvoice) {
      throw new Error(
        `Cannot apply $${amount.toFixed(2)}. Only $${outstandingInvoice.toFixed(2)} outstanding on invoice.`
      );
    }

    const db = await getDatabase();
    const arAccount = await getSystemAccount('accounts_receivable');

    await db.execute(
      `INSERT INTO credit_note_application (credit_note_id, invoice_id, amount, notes, application_date)
       VALUES (?, ?, ?, ?, date('now'))`,
      [creditNoteId, invoiceId, amount, notes]
    );

    const eventId = await persistenceService.createTransactionEvent({
      event_type: 'credit_note_applied',
      description: `Apply Credit Note ${creditNote.credit_note_number} to Invoice ${invoice.invoice_number}`,
      reference: `${creditNote.credit_note_number} -> ${invoice.invoice_number}`,
      created_by: 'system',
      metadata: JSON.stringify({ credit_note_id: creditNoteId, invoice_id: invoiceId, amount }),
    });

    const journalLines = [
      {
        account_id: arAccount.id,
        debit_amount: amount,
        credit_amount: 0,
        description: `Credit Note ${creditNote.credit_note_number}`,
      },
      {
        account_id: arAccount.id,
        debit_amount: 0,
        credit_amount: amount,
        description: `Invoice ${invoice.invoice_number}`,
      },
    ];

    await persistenceService.createJournalEntry(
      {
        event_id: eventId,
        entry_date: new Date().toISOString().split('T')[0],
        description: `Apply Credit Note ${creditNote.credit_note_number} to Invoice ${invoice.invoice_number}`,
        reference: `${creditNote.credit_note_number} -> ${invoice.invoice_number}`,
        status: 'posted',
      },
      journalLines
    );

    await db.execute(
      `UPDATE invoice SET paid_amount = paid_amount + ?, updated_at = datetime('now') WHERE id = ?`,
      [amount, invoiceId]
    );

    const newAppliedAmount = creditNote.applied_amount + amount;
    let newStatus = creditNote.status;
    if (Math.abs(newAppliedAmount - creditNote.total_amount) < 0.01) {
      newStatus = 'applied';
    } else if (newAppliedAmount > 0) {
      newStatus = 'partial';
    }

    await db.execute(
      `UPDATE credit_note SET status = ?, updated_at = datetime('now') WHERE id = ?`,
      [newStatus, creditNoteId]
    );

    return {
      ok: true,
      warnings: [],
    };
  } catch (error) {
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

export async function refundCreditNote(
  creditNoteId: number,
  refundNumber: string,
  refundDate: string,
  paymentMethod: string,
  amount: number,
  notes?: string
): Promise<PostingResult> {
  try {
    const creditNotes = await persistenceService.getCreditNotes();
    const creditNote = creditNotes.find(cn => cn.id === creditNoteId);

    if (!creditNote) {
      throw new Error('Credit note not found');
    }

    if (creditNote.status === 'void') {
      throw new Error('Cannot refund a voided credit note');
    }

    const availableAmount = creditNote.total_amount - creditNote.applied_amount;
    if (amount > availableAmount) {
      throw new Error(
        `Cannot refund $${amount.toFixed(2)}. Only $${availableAmount.toFixed(2)} available on credit note.`
      );
    }

    const db = await getDatabase();
    const cashAccount = await getSystemAccount('cash_default');
    const arAccount = await getSystemAccount('accounts_receivable');

    const eventId = await persistenceService.createTransactionEvent({
      event_type: 'credit_note_refunded',
      description: `Refund Credit Note ${creditNote.credit_note_number}`,
      reference: refundNumber,
      created_by: 'system',
      metadata: JSON.stringify({ credit_note_id: creditNoteId, amount }),
    });

    await db.execute(
      `INSERT INTO credit_note_refund (credit_note_id, refund_number, refund_date, amount, payment_method, notes, event_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [creditNoteId, refundNumber, refundDate, amount, paymentMethod, notes, eventId]
    );

    const journalLines = [
      {
        account_id: cashAccount.id,
        debit_amount: 0,
        credit_amount: amount,
        description: `Refund Credit Note ${creditNote.credit_note_number}`,
      },
      {
        account_id: arAccount.id,
        debit_amount: amount,
        credit_amount: 0,
        description: `Refund Credit Note ${creditNote.credit_note_number}`,
      },
    ];

    await persistenceService.createJournalEntry(
      {
        event_id: eventId,
        entry_date: refundDate,
        description: `Refund Credit Note ${creditNote.credit_note_number}`,
        reference: refundNumber,
        status: 'posted',
      },
      journalLines
    );

    const newAppliedAmount = creditNote.applied_amount + amount;
    let newStatus = creditNote.status;
    if (Math.abs(newAppliedAmount - creditNote.total_amount) < 0.01) {
      newStatus = 'applied';
    } else if (newAppliedAmount > 0) {
      newStatus = 'partial';
    }

    await db.execute(
      `UPDATE credit_note SET applied_amount = ?, status = ?, updated_at = datetime('now') WHERE id = ?`,
      [newAppliedAmount, newStatus, creditNoteId]
    );

    return {
      ok: true,
      warnings: [],
    };
  } catch (error) {
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

export async function voidCreditNote(
  creditNoteId: number,
  reason: string
): Promise<PostingResult> {
  try {
    const creditNotes = await persistenceService.getCreditNotes();
    const creditNote = creditNotes.find(cn => cn.id === creditNoteId);

    if (!creditNote) {
      throw new Error('Credit note not found');
    }

    if (creditNote.status === 'void') {
      throw new Error('Credit note is already voided');
    }

    if (creditNote.applied_amount > 0) {
      throw new Error('Cannot void a credit note that has been applied. You must reverse the applications first.');
    }

    const db = await getDatabase();
    const creditNoteLines = await db.select<CreditNoteLine[]>(
      'SELECT * FROM credit_note_line WHERE credit_note_id = ? ORDER BY line_number',
      [creditNoteId]
    );

    const eventId = await persistenceService.createTransactionEvent({
      event_type: 'credit_note_voided',
      description: `Void Credit Note ${creditNote.credit_note_number} - ${reason}`,
      reference: creditNote.credit_note_number,
      created_by: 'system',
      metadata: JSON.stringify({ original_credit_note_id: creditNoteId, reason }),
    });

    const accounts = await persistenceService.getAccounts();
    const arAccount = await getSystemAccount('accounts_receivable');

    let taxAccount = null;
    if (creditNote.tax_code_id && creditNote.tax_amount > 0) {
      const taxRate = await getTaxRate(creditNote.tax_code_id!, creditNote.issue_date);
      if (taxRate && taxRate.account_id) {
        taxAccount = accounts.find(a => a.id === taxRate.account_id);
      }
    }

    const journalLines = [
      {
        account_id: arAccount.id,
        debit_amount: creditNote.total_amount,
        credit_amount: 0,
        description: `VOID: Credit Note ${creditNote.credit_note_number}`,
      },
    ];

    for (const line of creditNoteLines) {
      if (line.account_id) {
        journalLines.push({
          account_id: line.account_id,
          debit_amount: 0,
          credit_amount: line.amount,
          description: `VOID: ${line.description}`,
        });
      }
    }

    if (creditNote.tax_amount > 0 && taxAccount) {
      journalLines.push({
        account_id: taxAccount.id,
        debit_amount: 0,
        credit_amount: creditNote.tax_amount,
        description: 'VOID: Sales tax reversal',
      });
    }

    await persistenceService.createJournalEntry(
      {
        event_id: eventId,
        entry_date: new Date().toISOString().split('T')[0],
        description: `VOID: Credit Note ${creditNote.credit_note_number} - ${reason}`,
        reference: creditNote.credit_note_number,
        status: 'posted',
      },
      journalLines
    );

    await db.execute(
      'UPDATE credit_note SET status = ?, updated_at = datetime("now") WHERE id = ?',
      ['void', creditNoteId]
    );

    return {
      ok: true,
      event_id: eventId,
      warnings: [],
    };
  } catch (error) {
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
