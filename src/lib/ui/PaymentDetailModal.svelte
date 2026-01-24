<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import type { Payment, Allocation, Invoice, Contact, JournalEntry, JournalLine, Account } from '../domain/types';
  import Modal from './Modal.svelte';
  import Button from './Button.svelte';
  import Card from './Card.svelte';
  import Table from './Table.svelte';

  export let payment: Payment;
  export let onclose: () => void;

  let loading = true;
  let allocations: Allocation[] = [];
  let invoices: Invoice[] = [];
  let contact: Contact | null = null;
  let accounts: Account[] = [];
  let journalEntry: JournalEntry | null = null;
  let journalLines: JournalLine[] = [];

  onMount(async () => {
    await loadDetails();
  });

  async function loadDetails() {
    loading = true;
    try {
      [allocations, accounts] = await Promise.all([
        persistenceService.getAllocations(payment.id!),
        persistenceService.getAccounts(),
      ]);

      // Get contact if exists
      if (payment.contact_id) {
        const contacts = await persistenceService.getContacts();
        contact = contacts.find(c => c.id === payment.contact_id) || null;
      }

      // Get invoices for allocations
      if (allocations.length > 0) {
        const allInvoices = await persistenceService.getInvoices();
        invoices = allInvoices.filter(inv => 
          allocations.some(a => a.invoice_id === inv.id)
        );
      }

      // Get journal entry if exists
      if (payment.event_id) {
        const db = await import('../services/database').then(m => m.getDatabase());
        const entries = await (await db).select<JournalEntry[]>(
          'SELECT * FROM journal_entry WHERE event_id = ?',
          [payment.event_id]
        );
        if (entries.length > 0) {
          journalEntry = entries[0];
          journalLines = await persistenceService.getJournalLines(journalEntry.id!);
        }
      }
    } catch (e) {
      console.error('Failed to load payment details:', e);
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

  function getInvoiceNumber(invoiceId: number): string {
    const invoice = invoices.find(inv => inv.id === invoiceId);
    return invoice?.invoice_number || 'Unknown';
  }

  function formatPaymentMethod(method: string | undefined): string {
    if (!method) return 'N/A';
    return method.charAt(0).toUpperCase() + method.slice(1);
  }
</script>

<Modal open={true} {onclose} size="large" title="Payment Details">
  {#if loading}
    <div class="loading">Loading payment details...</div>
  {:else}
    <div class="payment-detail">
      <!-- Header Information -->
      <Card title="Payment Information">
        <div class="info-grid">
          <div class="info-row">
            <span class="label">Payment Number:</span>
            <span class="value"><strong>{payment.payment_number}</strong></span>
          </div>
          <div class="info-row">
            <span class="label">Status:</span>
            <span class="badge {payment.status}">{payment.status}</span>
          </div>
          <div class="info-row">
            <span class="label">Customer:</span>
            <span class="value">{contact?.name || 'Unallocated Payment'}</span>
          </div>
          <div class="info-row">
            <span class="label">Email:</span>
            <span class="value">{contact?.email || 'N/A'}</span>
          </div>
          <div class="info-row">
            <span class="label">Payment Date:</span>
            <span class="value">{formatDate(payment.payment_date)}</span>
          </div>
          <div class="info-row">
            <span class="label">Payment Method:</span>
            <span class="value">{formatPaymentMethod(payment.payment_method)}</span>
          </div>
          {#if payment.reference}
            <div class="info-row">
              <span class="label">Reference:</span>
              <span class="value">{payment.reference}</span>
            </div>
          {/if}
          {#if payment.notes}
            <div class="info-row full-width">
              <span class="label">Notes:</span>
              <span class="value">{payment.notes}</span>
            </div>
          {/if}
        </div>

        <div class="amounts">
          <div class="amount-row">
            <span>Payment Amount:</span>
            <span class="amount">{formatCurrency(payment.amount)}</span>
          </div>
          <div class="amount-row">
            <span>Allocated:</span>
            <span class="amount allocated">{formatCurrency(payment.allocated_amount)}</span>
          </div>
          <div class="amount-row final">
            <span><strong>Unallocated:</strong></span>
            <span class="amount"><strong>{formatCurrency(payment.amount - payment.allocated_amount)}</strong></span>
          </div>
        </div>
      </Card>

      <!-- Invoice Allocations -->
      {#if allocations.length > 0}
        <Card title="Applied to Invoices">
          <Table headers={['Invoice #', 'Issue Date', 'Invoice Total', 'Amount Applied', 'Method']}>
            {#each allocations as allocation}
              {@const invoice = invoices.find(inv => inv.id === allocation.invoice_id)}
              {#if invoice}
                <tr>
                  <td><strong>{invoice.invoice_number}</strong></td>
                  <td>{formatDate(invoice.issue_date)}</td>
                  <td class="amount">{formatCurrency(invoice.total_amount)}</td>
                  <td class="amount applied">{formatCurrency(allocation.amount)}</td>
                  <td><span class="allocation-method">{allocation.allocation_method}</span></td>
                </tr>
              {/if}
            {/each}
            <tr class="total-line">
              <td colspan="3"><strong>Total Allocated:</strong></td>
              <td class="amount"><strong>{formatCurrency(allocations.reduce((sum, a) => sum + a.amount, 0))}</strong></td>
              <td></td>
            </tr>
          </Table>
        </Card>
      {:else}
        <Card title="Applied to Invoices">
          <p class="no-data">This payment has not been allocated to any invoices.</p>
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
      </div>
    </div>
  {/if}
</Modal>

<style>
  .loading {
    padding: 40px;
    text-align: center;
    color: #7f8c8d;
  }

  .payment-detail {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 20px;
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

  .badge.pending {
    background: #fef5e7;
    color: #d68910;
  }

  .badge.allocated {
    background: #d5f4e6;
    color: #27ae60;
  }

  .badge.partial {
    background: #e8f4f8;
    color: #2980b9;
  }

  .badge.reconciled {
    background: #d5f4e6;
    color: #27ae60;
  }

  .badge.posted {
    background: #d5f4e6;
    color: #27ae60;
  }

  .amounts {
    padding: 20px;
    background: #f8f9fa;
    border-radius: 6px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .amount-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
  }

  .amount-row.final {
    border-top: 2px solid #2c3e50;
    padding-top: 12px;
    margin-top: 8px;
    font-size: 16px;
  }

  .amount {
    text-align: right;
    font-family: 'Courier New', monospace;
  }

  .amount.allocated {
    color: #27ae60;
  }

  .amount.applied {
    color: #3498db;
  }

  .allocation-method {
    display: inline-block;
    padding: 2px 6px;
    background: #ecf0f1;
    border-radius: 3px;
    font-size: 11px;
    text-transform: uppercase;
    color: #7f8c8d;
  }

  .no-data {
    padding: 20px;
    text-align: center;
    color: #95a5a6;
    font-style: italic;
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
</style>
