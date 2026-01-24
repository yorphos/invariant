import type {
  JournalEntry,
  JournalLine,
  TransactionEvent,
  PostingResult,
  PolicyContext,
  ValidationWarning,
  Account
} from './types';

/**
 * Core posting engine - constructs double-entry journal entries
 * This is the only place in the app that should create accounting postings
 */
export class PostingEngine {
  /**
   * Validate journal lines follow double-entry rules
   */
  validateBalance(lines: JournalLine[]): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    const totalDebits = lines.reduce((sum, line) => sum + line.debit_amount, 0);
    const totalCredits = lines.reduce((sum, line) => sum + line.credit_amount, 0);

    const difference = Math.abs(totalDebits - totalCredits);

    if (difference > 0.01) {
      warnings.push({
        level: 'error',
        message: `Journal entry is not balanced. Debits: ${totalDebits.toFixed(2)}, Credits: ${totalCredits.toFixed(2)}`,
        requiresOverride: false
      });
    }

    // Check each line has exactly one side
    lines.forEach((line, idx) => {
      if ((line.debit_amount > 0 && line.credit_amount > 0) ||
          (line.debit_amount === 0 && line.credit_amount === 0)) {
        warnings.push({
          level: 'error',
          message: `Line ${idx + 1} must have either debit or credit, not both or neither`,
          field: `line_${idx}`,
          requiresOverride: false
        });
      }
    });

    return warnings;
  }

  /**
   * Validate account usage based on policy context
   */
  validateAccountUsage(
    lines: JournalLine[],
    accounts: Map<number, Account>,
    context: PolicyContext
  ): ValidationWarning[] {
    const warnings: ValidationWarning[] = [];

    if (context.mode === 'beginner') {
      for (const line of lines) {
        const account = accounts.get(line.account_id);
        if (!account) {
          warnings.push({
            level: 'error',
            message: `Account ${line.account_id} not found`,
            requiresOverride: false
          });
          continue;
        }

        // In beginner mode, warn about unusual account usage
        // This is a simplified example - real logic would be more sophisticated
        if (line.description?.toLowerCase().includes('office') && 
            account.type === 'asset' && 
            !account.name.toLowerCase().includes('office')) {
          warnings.push({
            level: 'warning',
            message: `Posting office expense to ${account.name}. Consider using an expense account instead.`,
            requiresOverride: true
          });
        }
      }
    }

    return warnings;
  }

  /**
   * Create a journal entry for an expense
   */
  createExpensePosting(
    description: string,
    amount: number,
    expenseAccountId: number,
    paymentAccountId: number,
    date: string,
    context: PolicyContext
  ): PostingResult {
    const warnings: ValidationWarning[] = [];

    const lines: JournalLine[] = [
      {
        account_id: expenseAccountId,
        debit_amount: amount,
        credit_amount: 0,
        description: description
      },
      {
        account_id: paymentAccountId,
        debit_amount: 0,
        credit_amount: amount,
        description: description
      }
    ];

    const balanceWarnings = this.validateBalance(lines);
    warnings.push(...balanceWarnings);

    if (warnings.some(w => w.level === 'error')) {
      return {
        ok: false,
        warnings,
        postings: lines
      };
    }

    return {
      ok: true,
      warnings,
      postings: lines
    };
  }

  /**
   * Create a journal entry for an invoice (A/R)
   */
  createInvoicePosting(
    invoiceId: number,
    totalAmount: number,
    taxAmount: number,
    revenueAccountId: number,
    taxPayableAccountId: number,
    arAccountId: number,
    date: string,
    context: PolicyContext
  ): PostingResult {
    const warnings: ValidationWarning[] = [];
    const subtotal = totalAmount - taxAmount;

    const lines: JournalLine[] = [
      {
        account_id: arAccountId,
        debit_amount: totalAmount,
        credit_amount: 0,
        description: `Invoice #${invoiceId}`
      },
      {
        account_id: revenueAccountId,
        debit_amount: 0,
        credit_amount: subtotal,
        description: `Revenue - Invoice #${invoiceId}`
      }
    ];

    if (taxAmount > 0) {
      lines.push({
        account_id: taxPayableAccountId,
        debit_amount: 0,
        credit_amount: taxAmount,
        description: `Tax - Invoice #${invoiceId}`
      });
    }

    const balanceWarnings = this.validateBalance(lines);
    warnings.push(...balanceWarnings);

    if (warnings.some(w => w.level === 'error')) {
      return {
        ok: false,
        warnings,
        postings: lines
      };
    }

    return {
      ok: true,
      warnings,
      postings: lines
    };
  }

  /**
   * Create a journal entry for a payment received (reduces A/R)
   */
  createPaymentReceivedPosting(
    paymentId: number,
    amount: number,
    bankAccountId: number,
    arAccountId: number,
    date: string,
    context: PolicyContext
  ): PostingResult {
    const warnings: ValidationWarning[] = [];

    const lines: JournalLine[] = [
      {
        account_id: bankAccountId,
        debit_amount: amount,
        credit_amount: 0,
        description: `Payment received #${paymentId}`
      },
      {
        account_id: arAccountId,
        debit_amount: 0,
        credit_amount: amount,
        description: `Payment received #${paymentId}`
      }
    ];

    const balanceWarnings = this.validateBalance(lines);
    warnings.push(...balanceWarnings);

    if (warnings.some(w => w.level === 'error')) {
      return {
        ok: false,
        warnings,
        postings: lines
      };
    }

    return {
      ok: true,
      warnings,
      postings: lines
    };
  }

  /**
   * Create a reversal entry for a posted journal entry
   */
  createReversalPosting(
    originalEntry: JournalEntry,
    originalLines: JournalLine[],
    reason: string,
    date: string
  ): PostingResult {
    const warnings: ValidationWarning[] = [];

    // Create reversed lines (flip debits and credits)
    const lines: JournalLine[] = originalLines.map(line => ({
      account_id: line.account_id,
      debit_amount: line.credit_amount,
      credit_amount: line.debit_amount,
      description: `Reversal: ${line.description || originalEntry.description}`
    }));

    const balanceWarnings = this.validateBalance(lines);
    warnings.push(...balanceWarnings);

    if (warnings.some(w => w.level === 'error')) {
      return {
        ok: false,
        warnings,
        postings: lines
      };
    }

    return {
      ok: true,
      warnings,
      postings: lines
    };
  }
}

export const postingEngine = new PostingEngine();
