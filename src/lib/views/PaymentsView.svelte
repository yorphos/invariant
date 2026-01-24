<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import { createPayment } from '../domain/payment-operations';
  import { arMatchingEngine } from '../domain/ar-matching';
  import type { Payment, Invoice, Contact, PolicyMode } from '../domain/types';
  import type { AllocationSuggestion } from '../domain/ar-matching';
  import Button from '../ui/Button.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Card from '../ui/Card.svelte';
  import Table from '../ui/Table.svelte';
  import PaymentDetailModal from '../ui/PaymentDetailModal.svelte';

  export let mode: PolicyMode;

  let payments: Payment[] = [];
  let openInvoices: Invoice[] = [];
  let contacts: Contact[] = [];
  let loading = true;
  let view: 'list' | 'create' = 'list';
  let selectedPayment: Payment | null = null;
  let showDetailModal = false;

  // Form fields
  let formPaymentNumber = '';
  let formContactId: number | '' = '';
  let formPaymentDate = '';
  let formAmount = 0;
  let formMethod: 'cash' | 'check' | 'transfer' | 'card' | 'other' = 'transfer';
  let formReference = '';
  let formNotes = '';
  let selectedInvoices: Array<{ invoice_id: number; amount: number }> = [];
  
  // Smart allocation
  let allocationSuggestion: AllocationSuggestion | null = null;
  let showSuggestions = false;

  $: contactOpenInvoices = formContactId && typeof formContactId === 'number'
    ? openInvoices.filter(inv => inv.contact_id === formContactId)
    : [];
  
  $: totalAllocated = selectedInvoices.reduce((sum, si) => sum + si.amount, 0);
  $: remainingAmount = formAmount - totalAllocated;
  $: isOverAllocated = remainingAmount < -0.01;
  $: isUnderAllocated = remainingAmount > 0.01 && selectedInvoices.length > 0;
  $: isFullyAllocated = Math.abs(remainingAmount) <= 0.01;

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      [payments, openInvoices, contacts] = await Promise.all([
        persistenceService.getPayments(),
        persistenceService.getOpenInvoices(),
        persistenceService.getContacts()
      ]);

      // Generate next payment number
      if (payments.length === 0) {
        formPaymentNumber = 'PAY-0001';
      } else {
        const lastNum = Math.max(...payments.map(pay => {
          const match = pay.payment_number.match(/\d+$/);
          return match ? parseInt(match[0]) : 0;
        }));
        formPaymentNumber = `PAY-${String(lastNum + 1).padStart(4, '0')}`;
      }

      formPaymentDate = new Date().toISOString().split('T')[0];
    } catch (e) {
      console.error('Failed to load data:', e);
    }
    loading = false;
  }

  function toggleInvoice(invoice: Invoice) {
    const existingIndex = selectedInvoices.findIndex(si => si.invoice_id === invoice.id);
    if (existingIndex >= 0) {
      selectedInvoices = selectedInvoices.filter((_, i) => i !== existingIndex);
    } else {
      const remainingAmount = invoice.total_amount - invoice.paid_amount;
      selectedInvoices = [...selectedInvoices, { invoice_id: invoice.id!, amount: remainingAmount }];
    }
  }

  async function handleSubmit() {
    try {
      // Contact is now optional for free-floating payments
      const contactId = formContactId && typeof formContactId === 'number' ? formContactId : undefined;

      const result = await createPayment(
        {
          payment_number: formPaymentNumber,
          contact_id: contactId,
          payment_date: formPaymentDate,
          amount: formAmount,
          payment_method: formMethod,
          reference: formReference || undefined,
          notes: formNotes || undefined,
        },
        selectedInvoices,
        { mode }
      );

      if (!result.ok) {
        alert('Failed to create payment:\n' + result.warnings.map(w => w.message).join('\n'));
        return;
      }

      await loadData();
      view = 'list';
      resetForm();
    } catch (e) {
      console.error('Failed to create payment:', e);
      alert('Failed to create payment: ' + e);
    }
  }

  function resetForm() {
    formContactId = '';
    formAmount = 0;
    formMethod = 'transfer';
    formReference = '';
    formNotes = '';
    selectedInvoices = [];
  }

  function handleRowClick(payment: Payment) {
    selectedPayment = payment;
    showDetailModal = true;
  }

  function closeDetailModal() {
    showDetailModal = false;
    selectedPayment = null;
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

  // Smart allocation functions
  async function generateSuggestions() {
    if (!formContactId || typeof formContactId !== 'number' || formAmount <= 0) {
      allocationSuggestion = null;
      showSuggestions = false;
      return;
    }

    // Create a temporary payment object for matching
    const tempPayment: Payment = {
      payment_number: formPaymentNumber,
      contact_id: formContactId,
      payment_date: formPaymentDate,
      amount: formAmount,
      payment_method: formMethod,
      reference: formReference || undefined,
      notes: formNotes || undefined,
      allocated_amount: totalAllocated,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    const suggestion = await arMatchingEngine.matchPayment(tempPayment, openInvoices);
    allocationSuggestion = suggestion;
    showSuggestions = true;
  }

  async function applyFIFO() {
    if (!formContactId || typeof formContactId !== 'number' || formAmount <= 0) return;

    const tempPayment: Payment = {
      payment_number: formPaymentNumber,
      contact_id: formContactId,
      payment_date: formPaymentDate,
      amount: formAmount,
      payment_method: formMethod,
      allocated_amount: 0,
      status: 'pending',
      created_at: new Date().toISOString()
    };

    const fifoAllocation = await arMatchingEngine.matchPayment(tempPayment, openInvoices);
    selectedInvoices = fifoAllocation.allocations.map(alloc => ({
      invoice_id: alloc.invoice.id!,
      amount: alloc.amount
    }));
    showSuggestions = false;
  }

  function applySuggestions() {
    if (!allocationSuggestion) return;

    selectedInvoices = allocationSuggestion.allocations.map(alloc => ({
      invoice_id: alloc.invoice.id!,
      amount: alloc.amount
    }));
    showSuggestions = false;
  }

  function clearAllocations() {
    selectedInvoices = [];
    allocationSuggestion = null;
    showSuggestions = false;
  }

  function updateAllocationAmount(invoiceId: number, newAmount: number) {
    const index = selectedInvoices.findIndex(si => si.invoice_id === invoiceId);
    if (index >= 0) {
      selectedInvoices[index].amount = newAmount;
      selectedInvoices = [...selectedInvoices]; // Trigger reactivity
    }
  }
</script>

<div class="payments-view">
  {#if view === 'list'}
    <div class="header">
      <h2>Payments</h2>
      <Button on:click={() => view = 'create'}>
        + Record Payment
      </Button>
    </div>

    {#if loading}
      <Card>
        <p>Loading payments...</p>
      </Card>
    {:else if payments.length === 0}
      <Card>
        <p>No payments yet. Click "Record Payment" to add your first payment.</p>
      </Card>
    {:else}
      <Card padding={false}>
        <Table headers={['Payment #', 'Customer', 'Date', 'Amount', 'Method', 'Status']}>
          {#each payments as payment}
            <tr class="clickable-row" on:click={() => handleRowClick(payment)}>
              <td><strong>{payment.payment_number}</strong></td>
              <td>{contacts.find(c => c.id === payment.contact_id)?.name || '-'}</td>
              <td>{formatDate(payment.payment_date)}</td>
              <td>{formatCurrency(payment.amount)}</td>
              <td class="capitalize">{payment.payment_method}</td>
              <td>
                <span class="badge {payment.status}">{payment.status}</span>
              </td>
            </tr>
          {/each}
        </Table>
      </Card>
    {/if}
  {:else}
    <div class="header">
      <h2>Record Payment</h2>
      <Button variant="ghost" on:click={() => view = 'list'}>
        Cancel
      </Button>
    </div>

    <form on:submit|preventDefault={handleSubmit}>
      <Card title="Payment Details">
        <div class="form-row">
          <Input
            label="Payment Number"
            bind:value={formPaymentNumber}
            required
            disabled={mode === 'beginner'}
          />

          <Select
            label="Customer (Optional)"
            bind:value={formContactId}
            options={contacts
              .filter(c => c.type === 'customer' || c.type === 'both')
              .map(c => ({ value: c.id!, label: c.name }))}
            placeholder="Select customer (or leave blank for unallocated payment)"
          />
        </div>

        <div class="form-row">
          <Input
            type="date"
            label="Payment Date"
            bind:value={formPaymentDate}
            required
          />

          <Input
            type="number"
            label="Amount"
            bind:value={formAmount}
            required
            min="0.01"
            step="0.01"
          />
        </div>

        <div class="form-row">
          <Select
            label="Payment Method"
            bind:value={formMethod}
            required
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'check', label: 'Check' },
              { value: 'transfer', label: 'Bank Transfer' },
              { value: 'card', label: 'Credit Card' },
              { value: 'other', label: 'Other' }
            ]}
          />

          <Input
            label="Reference"
            bind:value={formReference}
            placeholder="Check #, transaction ID, etc."
          />
        </div>

        <Input
          label="Notes"
          bind:value={formNotes}
          placeholder="Optional notes"
        />
      </Card>

      {#if contactOpenInvoices.length > 0}
        <Card title="Apply to Invoices (Optional)">
          <p class="hint">Select invoices to apply this payment to, or leave blank to record as an unallocated payment.</p>
          
          <!-- Allocation Status Panel -->
          {#if formAmount > 0 && selectedInvoices.length > 0}
            <div class="allocation-status" class:fully-allocated={isFullyAllocated} class:over-allocated={isOverAllocated} class:under-allocated={isUnderAllocated}>
              <div class="status-row">
                <span class="status-label">Payment Amount:</span>
                <span class="status-value">{formatCurrency(formAmount)}</span>
              </div>
              <div class="status-row">
                <span class="status-label">Total Allocated:</span>
                <span class="status-value">{formatCurrency(totalAllocated)}</span>
              </div>
              <div class="status-row">
                <span class="status-label">Remaining:</span>
                <span class="status-value status-remaining">{formatCurrency(remainingAmount)}</span>
              </div>
              {#if isOverAllocated}
                <p class="status-warning">⚠️ Over-allocated by {formatCurrency(Math.abs(remainingAmount))}</p>
              {:else if isUnderAllocated}
                <p class="status-info">ℹ️ {formatCurrency(remainingAmount)} unallocated</p>
              {:else if isFullyAllocated}
                <p class="status-success">✓ Fully allocated</p>
              {/if}
            </div>
          {/if}

          <!-- Smart Allocation Buttons -->
          <div class="allocation-actions">
            <Button variant="secondary" on:click={applyFIFO} disabled={!formContactId || formAmount <= 0}>
              Apply FIFO (Oldest First)
            </Button>
            <Button variant="secondary" on:click={generateSuggestions} disabled={!formContactId || formAmount <= 0}>
              Get Smart Suggestions
            </Button>
            {#if selectedInvoices.length > 0}
              <Button variant="ghost" on:click={clearAllocations}>
                Clear All
              </Button>
            {/if}
          </div>

          <!-- Smart Suggestions Panel -->
          {#if showSuggestions && allocationSuggestion && allocationSuggestion.allocations.length > 0}
            <div class="suggestions-panel">
              <h4>Smart Allocation Suggestions</h4>
              {#each allocationSuggestion.allocations as suggestion}
                <div class="suggestion-item">
                  <div class="suggestion-header">
                    <strong>{suggestion.invoice.invoice_number}</strong>
                    <span class="confidence" class:high={suggestion.confidence >= 0.9} class:medium={suggestion.confidence >= 0.7 && suggestion.confidence < 0.9}>
                      {Math.round(suggestion.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p class="suggestion-explanation">{suggestion.explanation}</p>
                  <p class="suggestion-amount">Suggested: {formatCurrency(suggestion.amount)}</p>
                </div>
              {/each}
              <div class="suggestion-actions">
                <Button on:click={applySuggestions}>Apply These Suggestions</Button>
                <Button variant="ghost" on:click={() => showSuggestions = false}>Dismiss</Button>
              </div>
            </div>
          {/if}

          <div class="invoices-list">
            {#each contactOpenInvoices as invoice}
              {@const isSelected = selectedInvoices.some(si => si.invoice_id === invoice.id)}
              {@const selectedItem = selectedInvoices.find(si => si.invoice_id === invoice.id)}
              {@const outstandingAmount = invoice.total_amount - invoice.paid_amount}
              
              <div class="invoice-item" class:selected={isSelected}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  on:change={() => toggleInvoice(invoice)}
                />
                <div class="invoice-info">
                  <div>
                    <strong>{invoice.invoice_number}</strong>
                    <span class="invoice-date">{formatDate(invoice.issue_date)}</span>
                  </div>
                  <span class="invoice-amount">Due: {formatCurrency(outstandingAmount)}</span>
                </div>
                
                {#if isSelected && selectedItem}
                  <div class="allocation-input">
                    <Input
                      type="number"
                      label="Allocate"
                      bind:value={selectedItem.amount}
                      on:input={() => updateAllocationAmount(invoice.id!, selectedItem.amount)}
                      min="0.01"
                      max={outstandingAmount}
                      step="0.01"
                    />
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </Card>
      {/if}

      <div class="form-actions">
        <Button variant="ghost" on:click={() => view = 'list'}>
          Cancel
        </Button>
        <Button type="submit">
          Record Payment
        </Button>
      </div>
    </form>
  {/if}
</div>

<style>
  .payments-view {
    max-width: 1200px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  .header h2 {
    margin: 0;
    color: #2c3e50;
    font-size: 28px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .hint {
    color: #7f8c8d;
    font-size: 14px;
    margin-bottom: 16px;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
  }

  .capitalize {
    text-transform: capitalize;
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
    background: #ecf0f1;
    color: #7f8c8d;
  }

  .badge.allocated {
    background: #d5f4e6;
    color: #27ae60;
  }

  .badge.partial {
    background: #fef5e7;
    color: #d68910;
  }

  .invoices-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .invoice-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 6px;
    cursor: pointer;
  }

  .invoice-item:hover {
    background: #e8f4f8;
  }

  .invoice-info {
    display: flex;
    justify-content: space-between;
    flex: 1;
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .clickable-row {
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .clickable-row:hover {
    background-color: #f8f9fa !important;
  }

  /* Allocation Status Panel */
  .allocation-status {
    background: #f8f9fa;
    border-left: 4px solid #7f8c8d;
    padding: 16px;
    border-radius: 6px;
    margin-bottom: 16px;
  }

  .allocation-status.fully-allocated {
    background: #d5f4e6;
    border-left-color: #27ae60;
  }

  .allocation-status.over-allocated {
    background: #fadbd8;
    border-left-color: #e74c3c;
  }

  .allocation-status.under-allocated {
    background: #fef5e7;
    border-left-color: #f39c12;
  }

  .status-row {
    display: flex;
    justify-content: space-between;
    margin-bottom: 8px;
  }

  .status-label {
    font-weight: 500;
    color: #2c3e50;
  }

  .status-value {
    font-weight: 600;
  }

  .status-remaining {
    font-size: 18px;
  }

  .status-warning {
    margin-top: 12px;
    margin-bottom: 0;
    color: #e74c3c;
    font-weight: 500;
  }

  .status-info {
    margin-top: 12px;
    margin-bottom: 0;
    color: #f39c12;
    font-weight: 500;
  }

  .status-success {
    margin-top: 12px;
    margin-bottom: 0;
    color: #27ae60;
    font-weight: 500;
  }

  /* Allocation Actions */
  .allocation-actions {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  /* Suggestions Panel */
  .suggestions-panel {
    background: #e8f4f8;
    border: 2px solid #3498db;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .suggestions-panel h4 {
    margin-top: 0;
    margin-bottom: 16px;
    color: #2c3e50;
  }

  .suggestion-item {
    background: white;
    border-radius: 6px;
    padding: 12px;
    margin-bottom: 12px;
  }

  .suggestion-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .confidence {
    font-size: 12px;
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: 500;
  }

  .confidence.high {
    background: #d5f4e6;
    color: #27ae60;
  }

  .confidence.medium {
    background: #fef5e7;
    color: #f39c12;
  }

  .suggestion-explanation {
    font-size: 14px;
    color: #7f8c8d;
    margin: 4px 0;
  }

  .suggestion-amount {
    font-weight: 600;
    color: #2c3e50;
    margin: 4px 0;
  }

  .suggestion-actions {
    display: flex;
    gap: 12px;
    margin-top: 16px;
  }

  /* Enhanced Invoice Items */
  .invoice-item.selected {
    background: #e8f4f8;
    border: 2px solid #3498db;
  }

  .invoice-date {
    font-size: 14px;
    color: #7f8c8d;
    margin-left: 12px;
  }

  .invoice-amount {
    font-weight: 600;
    color: #2c3e50;
  }

  .allocation-input {
    width: 200px;
    margin-top: 12px;
  }
</style>

<!-- Payment Detail Modal -->
{#if showDetailModal && selectedPayment}
  <PaymentDetailModal
    payment={selectedPayment}
    onClose={closeDetailModal}
  />
{/if}
