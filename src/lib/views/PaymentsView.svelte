<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import { createPayment } from '../domain/payment-operations';
  import type { Payment, Invoice, Contact, PolicyMode } from '../domain/types';
  import Button from '../ui/Button.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Card from '../ui/Card.svelte';
  import Table from '../ui/Table.svelte';

  export let mode: PolicyMode;

  let payments: Payment[] = [];
  let openInvoices: Invoice[] = [];
  let contacts: Contact[] = [];
  let loading = true;
  let view: 'list' | 'create' = 'list';

  // Form fields
  let formPaymentNumber = '';
  let formContactId: number | '' = '';
  let formPaymentDate = '';
  let formAmount = 0;
  let formMethod: 'cash' | 'check' | 'transfer' | 'card' | 'other' = 'transfer';
  let formReference = '';
  let formNotes = '';
  let selectedInvoices: Array<{ invoice_id: number; amount: number }> = [];

  $: contactOpenInvoices = formContactId && typeof formContactId === 'number'
    ? openInvoices.filter(inv => inv.contact_id === formContactId)
    : [];

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

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-CA');
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
            <tr>
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
          <div class="invoices-list">
            {#each contactOpenInvoices as invoice}
              <label class="invoice-item">
                <input
                  type="checkbox"
                  checked={selectedInvoices.some(si => si.invoice_id === invoice.id)}
                  on:change={() => toggleInvoice(invoice)}
                />
                <div class="invoice-info">
                  <strong>{invoice.invoice_number}</strong>
                  <span>Amount Due: {formatCurrency(invoice.total_amount - invoice.paid_amount)}</span>
                </div>
              </label>
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
</style>
