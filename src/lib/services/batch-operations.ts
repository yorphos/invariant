import { createInvoice, voidInvoice, type InvoiceInput } from '../domain/invoice-operations';
import { createPayment } from '../domain/payment-operations';
import { persistenceService } from './persistence';
import { getDatabase } from './database';
import type { 
  Invoice, 
  InvoiceLine, 
  Payment, 
  PolicyContext,
  PolicyMode 
} from '../domain/types';

/**
 * Result of a batch operation on a single item
 */
export interface BatchItemResult {
  success: boolean;
  itemIndex: number;
  itemDescription: string;
  error?: string;
  warnings?: string[];
  createdId?: number;
}

/**
 * Overall result of a batch operation
 */
export interface BatchOperationResult {
  totalItems: number;
  successCount: number;
  failureCount: number;
  results: BatchItemResult[];
}

/**
 * Input for batch invoice creation
 */
export interface BatchInvoiceInput {
  invoiceData: InvoiceInput;
  lines: InvoiceLine[];
}

/**
 * Input for CSV payment import (parsed from CSV)
 */
export interface PaymentImportRow {
  paymentNumber: string;
  customerName: string;
  paymentDate: string;
  amount: number;
  paymentMethod: 'cash' | 'check' | 'transfer' | 'card' | 'other';
  reference?: string;
  notes?: string;
  invoiceNumbers?: string; // Comma-separated invoice numbers
}

/**
 * Batch Operations Service
 * Handles bulk operations for invoices, payments, and status changes
 */
export class BatchOperationsService {
  /**
   * Create multiple invoices in a batch
   * @param invoices Array of invoice inputs with their lines
   * @param context Policy context (beginner or pro mode)
   * @returns Batch operation result with success/failure for each item
   */
  async batchCreateInvoices(
    invoices: BatchInvoiceInput[],
    context: PolicyContext
  ): Promise<BatchOperationResult> {
    const results: BatchItemResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (let i = 0; i < invoices.length; i++) {
      const { invoiceData, lines } = invoices[i];
      
      try {
        // Create invoice using existing domain logic
        const result = await createInvoice(invoiceData, lines, context);
        
        if (result.ok) {
          results.push({
            success: true,
            itemIndex: i,
            itemDescription: `Invoice ${invoiceData.invoice_number}`,
            warnings: result.warnings.map(w => w.message),
            createdId: result.invoice_id
          });
          successCount++;
        } else {
          results.push({
            success: false,
            itemIndex: i,
            itemDescription: `Invoice ${invoiceData.invoice_number}`,
            error: result.warnings.map(w => w.message).join('; ')
          });
          failureCount++;
        }
      } catch (error) {
        results.push({
          success: false,
          itemIndex: i,
          itemDescription: `Invoice ${invoiceData.invoice_number}`,
          error: error instanceof Error ? error.message : String(error)
        });
        failureCount++;
      }
    }

    return {
      totalItems: invoices.length,
      successCount,
      failureCount,
      results
    };
  }

  /**
   * Import payments from CSV data
   * @param rows Parsed CSV rows
   * @param mode Policy mode
   * @returns Batch operation result
   */
  async importPaymentsFromCSV(
    rows: PaymentImportRow[],
    mode: PolicyMode
  ): Promise<BatchOperationResult> {
    const results: BatchItemResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Get all contacts and invoices upfront for matching
    const [contacts, invoices] = await Promise.all([
      persistenceService.getContacts(),
      persistenceService.getInvoices()
    ]);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      try {
        // Validate required fields
        if (!row.paymentNumber || !row.paymentDate || !row.amount) {
          throw new Error('Missing required fields: payment number, date, and amount are required');
        }

        if (row.amount <= 0) {
          throw new Error('Payment amount must be greater than 0');
        }

        // Find customer by name (if provided)
        let contactId: number | undefined;
        if (row.customerName) {
          const contact = contacts.find(c => 
            c.name.toLowerCase() === row.customerName.toLowerCase() &&
            (c.type === 'customer' || c.type === 'both')
          );
          
          if (!contact) {
            throw new Error(`Customer "${row.customerName}" not found`);
          }
          
          contactId = contact.id!;
        }

        // Parse invoice numbers (if provided)
        const allocations: Array<{ invoice_id: number; amount: number }> = [];
        
        if (row.invoiceNumbers && row.invoiceNumbers.trim()) {
          const invoiceNums = row.invoiceNumbers.split(',').map(s => s.trim());
          
          for (const invNum of invoiceNums) {
            const invoice = invoices.find(inv => 
              inv.invoice_number === invNum &&
              inv.contact_id === contactId
            );
            
            if (!invoice) {
              throw new Error(`Invoice "${invNum}" not found for customer "${row.customerName}"`);
            }
            
            // For simplicity, split payment equally among invoices
            // In practice, you might want more sophisticated allocation
            const allocAmount = row.amount / invoiceNums.length;
            allocations.push({
              invoice_id: invoice.id!,
              amount: allocAmount
            });
          }
        }

        // Create payment
        const result = await createPayment(
          {
            payment_number: row.paymentNumber,
            contact_id: contactId,
            payment_date: row.paymentDate,
            amount: row.amount,
            payment_method: row.paymentMethod,
            reference: row.reference,
            notes: row.notes
          },
          allocations,
          { mode }
        );

        if (result.ok) {
          results.push({
            success: true,
            itemIndex: i,
            itemDescription: `Payment ${row.paymentNumber}`,
            warnings: result.warnings.map(w => w.message),
            createdId: result.payment_id
          });
          successCount++;
        } else {
          results.push({
            success: false,
            itemIndex: i,
            itemDescription: `Payment ${row.paymentNumber}`,
            error: result.warnings.map(w => w.message).join('; ')
          });
          failureCount++;
        }
      } catch (error) {
        results.push({
          success: false,
          itemIndex: i,
          itemDescription: `Payment ${row.paymentNumber}`,
          error: error instanceof Error ? error.message : String(error)
        });
        failureCount++;
      }
    }

    return {
      totalItems: rows.length,
      successCount,
      failureCount,
      results
    };
  }

  /**
   * Bulk update invoice status (e.g., mark multiple as void)
   * Note: This respects accounting rules (can't void paid invoices)
   * @param invoiceIds Array of invoice IDs to update
   * @param newStatus New status to set
   * @param mode Policy mode
   * @returns Batch operation result
   */
  async bulkUpdateInvoiceStatus(
    invoiceIds: number[],
    newStatus: 'draft' | 'sent' | 'void',
    mode: PolicyMode
  ): Promise<BatchOperationResult> {
    const results: BatchItemResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Get all invoices upfront
    const invoices = await persistenceService.getInvoices();

    for (let i = 0; i < invoiceIds.length; i++) {
      const invoiceId = invoiceIds[i];
      const invoice = invoices.find(inv => inv.id === invoiceId);
      
      try {
        if (!invoice) {
          throw new Error(`Invoice ID ${invoiceId} not found`);
        }

        // Validate state transition
        if (newStatus === 'void') {
          if (invoice.paid_amount > 0) {
            throw new Error('Cannot void invoice with payments applied');
          }
          if (invoice.status === 'void') {
            throw new Error('Invoice is already void');
          }
        }

        if (newStatus === 'draft' && invoice.status !== 'draft') {
          if (mode === 'beginner') {
            throw new Error('Cannot move invoice back to draft in beginner mode');
          }
        }

        // Update status
        const db = await getDatabase();
        
        if (newStatus === 'void') {
          // Use the proper void operation for complete audit trail
          const voidResult = await voidInvoice(
            invoiceId,
            `Bulk void operation`,
            { mode }
          );
          
          if (!voidResult.ok) {
            throw new Error(voidResult.warnings.map(w => w.message).join('; '));
          }
        } else {
          // For draft/sent status changes, update directly
          await db.execute(
            'UPDATE invoice SET status = ? WHERE id = ?',
            [newStatus, invoiceId]
          );
        }

        results.push({
          success: true,
          itemIndex: i,
          itemDescription: `Invoice ${invoice.invoice_number}`,
          createdId: invoiceId
        });
        successCount++;
      } catch (error) {
        results.push({
          success: false,
          itemIndex: i,
          itemDescription: invoice ? `Invoice ${invoice.invoice_number}` : `Invoice ID ${invoiceId}`,
          error: error instanceof Error ? error.message : String(error)
        });
        failureCount++;
      }
    }

    return {
      totalItems: invoiceIds.length,
      successCount,
      failureCount,
      results
    };
  }

  /**
   * Parse CSV text into payment import rows
   * @param csvText Raw CSV text
   * @returns Array of parsed payment rows
   */
  parsePaymentCSV(csvText: string): PaymentImportRow[] {
    const lines = csvText.trim().split('\n');
    
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header row and one data row');
    }

    // Parse header
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    
    // Expected headers (flexible matching)
    const paymentNumberIdx = header.findIndex(h => h.includes('payment') && h.includes('number'));
    const customerNameIdx = header.findIndex(h => h.includes('customer') || h.includes('client'));
    const paymentDateIdx = header.findIndex(h => h.includes('date'));
    const amountIdx = header.findIndex(h => h.includes('amount'));
    const methodIdx = header.findIndex(h => h.includes('method') || h.includes('type'));
    const referenceIdx = header.findIndex(h => h.includes('reference') || h.includes('ref'));
    const notesIdx = header.findIndex(h => h.includes('notes') || h.includes('memo'));
    const invoiceNumbersIdx = header.findIndex(h => h.includes('invoice'));

    if (paymentNumberIdx === -1 || paymentDateIdx === -1 || amountIdx === -1) {
      throw new Error('CSV must have columns for: Payment Number, Date, and Amount');
    }

    // Parse data rows
    const rows: PaymentImportRow[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue; // Skip empty lines
      
      const values = line.split(',').map(v => v.trim());
      
      const paymentMethod = methodIdx >= 0 ? values[methodIdx].toLowerCase() : 'transfer';
      let method: 'cash' | 'check' | 'transfer' | 'card' | 'other' = 'transfer';
      
      if (paymentMethod.includes('cash')) method = 'cash';
      else if (paymentMethod.includes('check') || paymentMethod.includes('cheque')) method = 'check';
      else if (paymentMethod.includes('transfer') || paymentMethod.includes('eft')) method = 'transfer';
      else if (paymentMethod.includes('card') || paymentMethod.includes('credit')) method = 'card';
      else method = 'other';
      
      rows.push({
        paymentNumber: values[paymentNumberIdx],
        customerName: customerNameIdx >= 0 ? values[customerNameIdx] : '',
        paymentDate: values[paymentDateIdx],
        amount: parseFloat(values[amountIdx].replace(/[$,]/g, '')),
        paymentMethod: method,
        reference: referenceIdx >= 0 ? values[referenceIdx] : undefined,
        notes: notesIdx >= 0 ? values[notesIdx] : undefined,
        invoiceNumbers: invoiceNumbersIdx >= 0 ? values[invoiceNumbersIdx] : undefined
      });
    }

    return rows;
  }
}

export const batchOperationsService = new BatchOperationsService();
