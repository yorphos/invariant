<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import { voidInvoice } from '../domain/invoice-operations';
  import { generateInvoicePDF } from '../utils/pdf-generator';
  import type { Invoice, InvoiceLine, Contact, Allocation, Payment, JournalEntry, JournalLine, Account, PolicyMode } from '../domain/types';
  import Modal from './Modal.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import Table from './Table.svelte';

  export let invoice: Invoice;
  export let onclose: () => void;
  export let onEdit: (() => void) | null = null;
  export let onVoid: (() => void) | null = null;
  export let mode: PolicyMode;

  let loading = true;
  let invoiceLines: InvoiceLine[] = [];
  let contact: Contact | null = null;
  let accounts: Account[] = [];
  let allocations: Allocation[] = [];
  let payments: Payment[] = [];
  let journalEntry: JournalEntry | null = null;
  let journalLines: JournalLine[] = [];
  let showVoidConfirm = false;
  let voidReason = '';
  let voidLoading = false;
  let pdfDownloading = false;

  onMount(async () => {
    await loadDetails();
  });

  async function loadDetails() {
    loading = true;
    try {
      [invoiceLines, accounts, allocations] = await Promise.all([
        persistenceService.getInvoiceLines(invoice.id!),
        persistenceService.getAccounts(),
        persistenceService.getAllocations(undefined, invoice.id),
      ]);

      // Get contact
      const contacts = await persistenceService.getContacts();
      contact = contacts.find(c => c.id === invoice.contact_id) || null;

      // Get payments for this invoice
      if (allocations.length > 0) {
        const allPayments = await persistenceService.getPayments();
        payments = allPayments.filter(p => 
          allocations.some(a => a.payment_id === p.id)
        );
      }

      // Get journal entry if exists
      if (invoice.event_id) {
        const db = await import('../services/database').then(m => m.getDatabase());
        const entries = await (await db).select<JournalEntry[]>(
          'SELECT * FROM journal_entry WHERE event_id = ?',
          [invoice.event_id]
        );
        if (entries.length > 0) {
          journalEntry = entries[0];
          journalLines = await persistenceService.getJournalLines(journalEntry.id!);
        }
      }
    } catch (e) {
      console.error('Failed to load invoice details:', e);
    }
    loading = false;
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-CA');
  }

  function getAccountName(accountId: number): string {
    const account = accounts.find(a => a.id === accountId);
    return account ? `${account.code} - ${account.name}` : 'Unknown Account';
  }

  async function handleVoid() {
    if (!voidReason.trim()) {
      alert('Please provide a reason for voiding this invoice');
      return;
    }

    voidLoading = true;
    try {
      const result = await voidInvoice(invoice.id!, voidReason, { mode });
      
      if (!result.ok) {
        alert('Failed to void invoice:\n' + result.warnings.map(w => w.message).join('\n'));
        return;
      }

      if (onVoid) onVoid();
      onclose();
    } catch (e) {
      console.error('Failed to void invoice:', e);
      alert('Failed to void invoice: ' + e);
    } finally {
      voidLoading = false;
    }
  }

  function handleEdit() {
    if (onEdit) onEdit();
  }

  async function handleDownloadPDF() {
    if (!contact) {
      alert('Cannot generate PDF: customer information not found');
      return;
    }

    pdfDownloading = true;
    try {
      // Default company info (in a real app, this would come from settings)
      const companyInfo = {
        name: 'Your Company Name',
        address: '123 Main Street, City, Province, A1B 2C3',
        phone: '(555) 123-4567',
        email: 'info@yourcompany.com',
        taxId: 'BN: 123456789RT0001',
      };

      const pdf = generateInvoicePDF(invoice, invoiceLines, contact, companyInfo);
      
      // Download the PDF
      pdf.save(`${invoice.invoice_number}.pdf`);
    } catch (e) {
      console.error('Failed to generate PDF:', e);
      alert('Failed to generate PDF: ' + e);
    } finally {
      pdfDownloading = false;
    }
  }
</script>

<Modal open={true} {onclose} size="large" title="Invoice Details">
  {#if loading}
    <div class="loading">Loading invoice details...</div>
  {:else}
    <div class="invoice-detail">
      <!-- Header Information -->
      <Card title="Invoice Information">
        <div class="info-grid">
          <div class="info-row">
            <span class="label">Invoice Number:</span>
            <span class="value"><strong>{invoice.invoice_number}</strong></span>
          </div>
          <div class="info-row">
            <span class="label">Status:</span>
            <span class="badge {invoice.status}">{invoice.status}</span>
          </div>
          <div class="info-row">
            <span class="label">Customer:</span>
            <span class="value">{contact?.name || 'Unknown'}</span>
          </div>
          <div class="info-row">
            <span class="label">Email:</span>
            <span class="value">{contact?.email || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Issue Date:</span>
            <span class="value">{formatDate(invoice.issue_date)}</span>
          </div>
          <div class="info-row">
            <span class="label">Due Date:</span>
            <span class="value">{formatDate(invoice.due_date)}</span>
          </div>
          {#if invoice.notes}
            <div class="info-row full-width">
              <span class="label">Notes:</span>
              <span class="value">{invoice.notes}</span>
            </div>
          {/if}
        </div>
      </Card>

      <!-- Line Items -->
      <Card title="Line Items">
        <Table headers={['#', 'Description', 'Qty', 'Unit Price', 'Account', 'Amount']}>
          {#each invoiceLines as line}
            <tr>
              <td>{line.line_number}</td>
              <td>{line.description}</td>
              <td>{line.quantity}</td>
              <td>{formatCurrency(line.unit_price)}</td>
              <td class="small-text">{getAccountName(line.account_id!)}</td>
              <td class="amount">{formatCurrency(line.amount)}</td>
            </tr>
          {/each}
        </Table>

        <div class="totals">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>{formatCurrency(invoice.subtotal)}</span>
          </div>
          <div class="total-row">
            <span>Tax (13% HST):</span>
            <span>{formatCurrency(invoice.tax_amount)}</span>
          </div>
          <div class="total-row final">
            <span><strong>Total:</strong></span>
            <span><strong>{formatCurrency(invoice.total_amount)}</strong></span>
          </div>
          <div class="total-row">
            <span>Paid:</span>
            <span class="paid">{formatCurrency(invoice.paid_amount)}</span>
          </div>
          <div class="total-row final outstanding">
            <span><strong>Outstanding:</strong></span>
            <span><strong>{formatCurrency(invoice.total_amount - invoice.paid_amount)}</strong></span>
          </div>
        </div>
      </Card>

      <!-- Payments Applied -->
      {#if allocations.length > 0}
        <Card title="Payments Applied">
          <Table headers={['Payment #', 'Date', 'Amount Applied', 'Method']}>
            {#each allocations as allocation}
              {@const payment = payments.find(p => p.id === allocation.payment_id)}
              {#if payment}
                <tr>
                  <td><strong>{payment.payment_number}</strong></td>
                  <td>{formatDate(payment.payment_date)}</td>
                  <td class="amount">{formatCurrency(allocation.amount)}</td>
                  <td>{payment.payment_method || 'N/A'}</td>
                </tr>
              {/if}
            {/each}
          </Table>
        </Card>
      {/if}

      <!-- Journal Entry -->
      {#if journalEntry}
        <Card title="Journal Entry">
          <div class="journal-info">
            <span><strong>Entry Date:</strong> {formatDate(journalEntry.entry_date)}</span>
            <span><strong>Status:</strong> <span class="badge {journalEntry.status}">{journalEntry.status}</span></span>
            {#if journalEntry.posted_at}
              <span><strong>Posted:</strong> {formatDate(journalEntry.posted_at)}</span>
            {/if}
          </div>
          
          <Table headers={['Account', 'Debit', 'Credit']}>
            {#each journalLines as line}
              <tr>
                <td>{getAccountName(line.account_id)}</td>
                <td class="amount">{line.debit_amount > 0 ? formatCurrency(line.debit_amount) : ''}</td>
                <td class="amount">{line.credit_amount > 0 ? formatCurrency(line.credit_amount) : ''}</td>
              </tr>
            {/each}
            <tr class="total-line">
              <td><strong>Total:</strong></td>
              <td class="amount"><strong>{formatCurrency(journalLines.reduce((sum, l) => sum + l.debit_amount, 0))}</strong></td>
              <td class="amount"><strong>{formatCurrency(journalLines.reduce((sum, l) => sum + l.credit_amount, 0))}</strong></td>
            </tr>
          </Table>
        </Card>
      {/if}

      <!-- Actions -->
      <div class="actions">
        <Button variant="ghost" onclick={onclose}>Close</Button>
        
        <Button onclick={handleDownloadPDF} disabled={pdfDownloading}>
          {pdfDownloading ? 'Generating...' : 'Download PDF'}
        </Button>
        
        {#if invoice.status !== 'void' && onEdit}
          <Button onclick={handleEdit}>Edit Invoice</Button>
        {/if}
        
        {#if invoice.status !== 'void' && invoice.paid_amount === 0 && onVoid}
          <Button variant="danger" onclick={() => showVoidConfirm = true}>Void Invoice</Button>
        {/if}
      </div>
    </div>

    <!-- Void Confirmation Modal -->
    {#if showVoidConfirm}
      <Modal open={true} onclose={() => showVoidConfirm = false} title="Void Invoice" size="medium">
        <Card>
          <p><strong>Warning:</strong> Voiding this invoice will create reversal journal entries and cannot be undone.</p>
          <p>Invoice <strong>{invoice.invoice_number}</strong> for {formatCurrency(invoice.total_amount)} will be marked as void.</p>
          
          <div class="void-form">
            <label for="voidReason">
              <strong>Reason for voiding:</strong>
            </label>
            <textarea
              id="voidReason"
              bind:value={voidReason}
              placeholder="Enter reason (required)"
              rows="3"
            ></textarea>
          </div>

          <div class="modal-actions">
            <Button variant="ghost" onclick={() => showVoidConfirm = false} disabled={voidLoading}>
              Cancel
            </Button>
            <Button variant="danger" onclick={handleVoid} disabled={voidLoading}>
              {voidLoading ? 'Voiding...' : 'Confirm Void'}
            </Button>
          </div>
        </Card>
      </Modal>
    {/if}
  {/if}
</Modal>

<style>
  .loading {
    padding: 40px;
    text-align: center;
    color: #7f8c8d;
  }

  .invoice-detail {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
  }

  .info-row.full-width {
    grid-column: 1 / -1;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .label {
    color: #7f8c8d;
    font-size: 14px;
  }

  .value {
    color: #2c3e50;
    font-size: 14px;
  }

  .badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    text-transform: capitalize;
  }

  .badge.draft {
    background: #ecf0f1;
    color: #7f8c8d;
  }

  .badge.sent {
    background: #e8f4f8;
    color: #2980b9;
  }

  .badge.paid {
    background: #d5f4e6;
    color: #27ae60;
  }

  .badge.partial {
    background: #fef5e7;
    color: #d68910;
  }

  .badge.overdue {
    background: #fadbd8;
    color: #e74c3c;
  }

  .badge.void {
    background: #ecf0f1;
    color: #95a5a6;
    text-decoration: line-through;
  }

  .badge.posted {
    background: #d5f4e6;
    color: #27ae60;
  }

  .small-text {
    font-size: 12px;
    color: #7f8c8d;
  }

  .amount {
    text-align: right;
    font-family: 'Courier New', monospace;
  }

  .totals {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #ecf0f1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-width: 400px;
    margin-left: auto;
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
  }

  .total-row.final {
    border-top: 2px solid #2c3e50;
    padding-top: 8px;
    margin-top: 8px;
  }

  .total-row.outstanding {
    color: #e74c3c;
    font-size: 16px;
  }

  .paid {
    color: #27ae60;
  }

  .journal-info {
    display: flex;
    gap: 24px;
    margin-bottom: 16px;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .total-line {
    border-top: 2px solid #2c3e50;
    font-weight: 600;
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 20px;
    border-top: 1px solid #ecf0f1;
  }

  .void-form {
    margin: 20px 0;
  }

  .void-form label {
    display: block;
    margin-bottom: 8px;
    color: #2c3e50;
  }

  .void-form textarea {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #dcdcdc;
    border-radius: 6px;
    font-family: inherit;
    font-size: 14px;
    resize: vertical;
  }

  .void-form textarea:focus {
    outline: none;
    border-color: #3498db;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 20px;
  }
</style>
