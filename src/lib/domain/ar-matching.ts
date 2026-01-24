import type {
  Payment,
  Invoice,
  Allocation,
  AllocationMethod
} from './types';

export interface AllocationCandidate {
  invoice: Invoice;
  score: number;
  method: AllocationMethod;
  explanation: string;
}

export interface AllocationSuggestion {
  payment: Payment;
  allocations: Array<{
    invoice: Invoice;
    amount: number;
    method: AllocationMethod;
    confidence: number;
    explanation: string;
  }>;
  remainingAmount: number;
}

/**
 * Smart A/R matching engine
 * Implements deterministic and heuristic invoice matching strategies
 */
export class ARMatchingEngine {
  /**
   * Match a payment to invoices using multiple strategies
   */
  async matchPayment(
    payment: Payment,
    openInvoices: Invoice[]
  ): Promise<AllocationSuggestion> {
    // Filter to customer's invoices if we know the customer
    let candidates = openInvoices;
    if (payment.contact_id) {
      candidates = candidates.filter(inv => inv.contact_id === payment.contact_id);
    }

    // Filter to unpaid/partially paid invoices
    candidates = candidates.filter(inv => 
      inv.status !== 'paid' && 
      inv.status !== 'void' &&
      inv.paid_amount < inv.total_amount
    );

    // Try deterministic matching first
    const exactMatch = this.findExactMatch(payment, candidates);
    if (exactMatch) {
      return this.createAllocation(payment, [exactMatch], 'exact');
    }

    // Try amount-based matching
    const amountMatch = this.findAmountMatch(payment, candidates);
    if (amountMatch.length > 0) {
      return this.createAllocation(payment, amountMatch, 'heuristic');
    }

    // Fall back to FIFO
    return this.allocateFIFO(payment, candidates);
  }

  /**
   * Find exact match by reference or invoice number
   */
  private findExactMatch(
    payment: Payment,
    candidates: Invoice[]
  ): Invoice | null {
    if (!payment.reference) {
      return null;
    }

    const ref = payment.reference.toLowerCase().trim();

    // Try to find invoice number in reference
    for (const invoice of candidates) {
      const invNum = invoice.invoice_number.toLowerCase().trim();
      if (ref.includes(invNum) || invNum.includes(ref)) {
        return invoice;
      }
    }

    return null;
  }

  /**
   * Find invoices that match the payment amount (within tolerance)
   */
  private findAmountMatch(
    payment: Payment,
    candidates: Invoice[],
    tolerance: number = 0.02 // 2% tolerance
  ): Invoice[] {
    const matches: Invoice[] = [];
    const remaining = payment.amount - payment.allocated_amount;

    // Look for single invoice match
    for (const invoice of candidates) {
      const outstanding = invoice.total_amount - invoice.paid_amount;
      const diff = Math.abs(outstanding - remaining);
      const percentDiff = diff / remaining;

      if (percentDiff <= tolerance) {
        matches.push(invoice);
        return matches; // Return immediately for exact match
      }
    }

    // Look for combination of invoices (simple case: 2 invoices)
    if (candidates.length >= 2) {
      for (let i = 0; i < candidates.length - 1; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const inv1 = candidates[i];
          const inv2 = candidates[j];
          const outstanding1 = inv1.total_amount - inv1.paid_amount;
          const outstanding2 = inv2.total_amount - inv2.paid_amount;
          const total = outstanding1 + outstanding2;
          const diff = Math.abs(total - remaining);
          const percentDiff = diff / remaining;

          if (percentDiff <= tolerance) {
            return [inv1, inv2];
          }
        }
      }
    }

    return matches;
  }

  /**
   * Allocate payment using FIFO (oldest invoice first)
   */
  private allocateFIFO(
    payment: Payment,
    candidates: Invoice[]
  ): AllocationSuggestion {
    // Sort by issue date (oldest first)
    const sorted = [...candidates].sort((a, b) => 
      new Date(a.issue_date).getTime() - new Date(b.issue_date).getTime()
    );

    const allocations: AllocationSuggestion['allocations'] = [];
    let remaining = payment.amount - payment.allocated_amount;

    for (const invoice of sorted) {
      if (remaining <= 0.01) break;

      const outstanding = invoice.total_amount - invoice.paid_amount;
      const allocateAmount = Math.min(remaining, outstanding);

      allocations.push({
        invoice,
        amount: allocateAmount,
        method: 'fifo',
        confidence: 0.7,
        explanation: `FIFO allocation to oldest invoice (${invoice.issue_date})`
      });

      remaining -= allocateAmount;
    }

    return {
      payment,
      allocations,
      remainingAmount: remaining
    };
  }

  /**
   * Allocate payment using newest-first strategy
   */
  allocateNewestFirst(
    payment: Payment,
    candidates: Invoice[]
  ): AllocationSuggestion {
    // Sort by issue date (newest first)
    const sorted = [...candidates].sort((a, b) => 
      new Date(b.issue_date).getTime() - new Date(a.issue_date).getTime()
    );

    const allocations: AllocationSuggestion['allocations'] = [];
    let remaining = payment.amount - payment.allocated_amount;

    for (const invoice of sorted) {
      if (remaining <= 0.01) break;

      const outstanding = invoice.total_amount - invoice.paid_amount;
      const allocateAmount = Math.min(remaining, outstanding);

      allocations.push({
        invoice,
        amount: allocateAmount,
        method: 'fifo',
        confidence: 0.7,
        explanation: `Newest-first allocation (${invoice.issue_date})`
      });

      remaining -= allocateAmount;
    }

    return {
      payment,
      allocations,
      remainingAmount: remaining
    };
  }

  /**
   * Helper to create allocation suggestion
   */
  private createAllocation(
    payment: Payment,
    invoices: Invoice[],
    method: AllocationMethod
  ): AllocationSuggestion {
    const allocations: AllocationSuggestion['allocations'] = [];
    let remaining = payment.amount - payment.allocated_amount;

    for (const invoice of invoices) {
      const outstanding = invoice.total_amount - invoice.paid_amount;
      const allocateAmount = Math.min(remaining, outstanding);

      const confidence = method === 'exact' ? 0.99 : 0.85;
      const explanation = method === 'exact'
        ? `Exact match by reference: ${payment.reference}`
        : `Amount match within tolerance`;

      allocations.push({
        invoice,
        amount: allocateAmount,
        method,
        confidence,
        explanation
      });

      remaining -= allocateAmount;
      if (remaining <= 0.01) break;
    }

    return {
      payment,
      allocations,
      remainingAmount: remaining
    };
  }
}

export const arMatchingEngine = new ARMatchingEngine();
