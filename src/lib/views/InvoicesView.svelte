<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import { createInvoice, editInvoice } from '../domain/invoice-operations';
  import type { Invoice, InvoiceLine, Contact, Account, PolicyMode, ValidationWarning } from '../domain/types';
  import Button from '../ui/Button.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Card from '../ui/Card.svelte';
  import Modal from '../ui/Modal.svelte';
  import Table from '../ui/Table.svelte';
  import InvoiceDetailModal from '../ui/InvoiceDetailModal.svelte';

  export let mode: PolicyMode;

  let invoices: Invoice[] = [];
  let contacts: Contact[] = [];
  let revenueAccounts: Account[] = [];
  let loading = true;
  let showModal = false;
  let view: 'list' | 'create' | 'edit' = 'list';
  let selectedInvoice: Invoice | null = null;
  let showDetailModal = false;
  let editingInvoiceId: number | null = null;

  // Form fields
  let formInvoiceNumber = '';
  let formContactId: number | '' = '';
  let formIssueDate = '';
  let formDueDate = '';
  let formNotes = '';
  let formLines: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    account_id: number | '';
  }> = [{ description: '', quantity: 1, unit_price: 0, account_id: '' }];

  $: subtotal = formLines.reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);
  $: taxAmount = subtotal * 0.13; // Simple 13% tax (HST)
  $: total = subtotal + taxAmount;

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      [invoices, contacts, revenueAccounts] = await Promise.all([
        persistenceService.getInvoices(),
        persistenceService.getContacts(),
        persistenceService.getAccountsByType('revenue')
      ]);

      // Generate next invoice number
      if (invoices.length === 0) {
        formInvoiceNumber = 'INV-0001';
      } else {
        const lastNum = Math.max(...invoices.map(inv => {
          const match = inv.invoice_number.match(/\d+$/);
          return match ? parseInt(match[0]) : 0;
        }));
        formInvoiceNumber = `INV-${String(lastNum + 1).padStart(4, '0')}`;
      }

      // Set default dates
      formIssueDate = new Date().toISOString().split('T')[0];
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);
      formDueDate = dueDate.toISOString().split('T')[0];

    } catch (e) {
      console.error('Failed to load data:', e);
    }
    loading = false;
  }

  function addLine() {
    formLines = [...formLines, { description: '', quantity: 1, unit_price: 0, account_id: '' }];
  }

  function removeLine(index: number) {
    if (formLines.length > 1) {
      formLines = formLines.filter((_, i) => i !== index);
    }
  }

  async function handleSubmit() {
    try {
      if (!formContactId || typeof formContactId !== 'number') {
        alert('Please select a customer');
        return;
      }

      // Validate lines
      for (const line of formLines) {
        if (!line.description || typeof line.account_id !== 'number') {
          alert('Please fill in all line items');
          return;
        }
      }

      // Map form lines to domain type
      const lines: InvoiceLine[] = formLines.map((line, index) => ({
        line_number: index + 1,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        amount: line.quantity * line.unit_price,
        account_id: Number(line.account_id),
      }));

      let result;
      
      if (editingInvoiceId) {
        // Edit existing invoice (void and recreate)
        result = await editInvoice(
          editingInvoiceId,
          {
            invoice_number: formInvoiceNumber,
            contact_id: Number(formContactId),
            issue_date: formIssueDate,
            due_date: formDueDate,
            notes: formNotes || undefined,
          },
          lines,
          { mode }
        );
      } else {
        // Create new invoice
        result = await createInvoice(
          {
            invoice_number: formInvoiceNumber,
            contact_id: Number(formContactId),
            issue_date: formIssueDate,
            due_date: formDueDate,
            notes: formNotes || undefined,
          },
          lines,
          { mode }
        );
      }

      if (!result.ok) {
        alert(`Failed to ${editingInvoiceId ? 'edit' : 'create'} invoice:\n` + result.warnings.map((w: ValidationWarning) => w.message).join('\n'));
        return;
      }

      // Show warnings if any (e.g., "invoice was voided and recreated")
      if (result.warnings.length > 0) {
        alert(result.warnings.map((w: ValidationWarning) => w.message).join('\n'));
      }

      await loadData();
      view = 'list';
      resetForm();
    } catch (e) {
      console.error(`Failed to ${editingInvoiceId ? 'edit' : 'create'} invoice:`, e);
      alert(`Failed to ${editingInvoiceId ? 'edit' : 'create'} invoice: ` + e);
    }
  }

  function resetForm() {
    editingInvoiceId = null;
    formContactId = '';
    formNotes = '';
    formLines = [{ description: '', quantity: 1, unit_price: 0, account_id: '' }];
  }

  function handleRowClick(invoice: Invoice) {
    selectedInvoice = invoice;
    showDetailModal = true;
  }

  function closeDetailModal() {
    showDetailModal = false;
    selectedInvoice = null;
  }

  async function handleEditFromDetail() {
    if (!selectedInvoice) return;
    
    // Load invoice data into form
    editingInvoiceId = selectedInvoice.id!;
    formInvoiceNumber = selectedInvoice.invoice_number;
    formContactId = selectedInvoice.contact_id;
    formIssueDate = selectedInvoice.issue_date;
    formDueDate = selectedInvoice.due_date;
    formNotes = selectedInvoice.notes || '';
    
    // Load invoice lines
    const lines = await persistenceService.getInvoiceLines(selectedInvoice.id!);
    formLines = lines.map(line => ({
      description: line.description,
      quantity: line.quantity,
      unit_price: line.unit_price,
      account_id: line.account_id || '',
    }));
    
    showDetailModal = false;
    view = 'edit';
  }

  async function handleVoidFromDetail() {
    // Reload data after void
    await loadData();
    closeDetailModal();
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

<div class="invoices-view">
  {#if view === 'list'}
    <div class="header">
      <h2>Invoices</h2>
      <Button on:click={() => view = 'create'}>
        + New Invoice
      </Button>
    </div>

    {#if loading}
      <Card>
        <p>Loading invoices...</p>
      </Card>
    {:else if invoices.length === 0}
      <Card>
        <p>No invoices yet. Click "New Invoice" to create your first invoice.</p>
      </Card>
    {:else}
      <Card padding={false}>
        <Table headers={['Invoice #', 'Customer', 'Date', 'Due Date', 'Amount', 'Status']}>
          {#each invoices as invoice}
            <tr class="clickable-row" on:click={() => handleRowClick(invoice)}>
              <td><strong>{invoice.invoice_number}</strong></td>
              <td>{contacts.find(c => c.id === invoice.contact_id)?.name || 'Unknown'}</td>
              <td>{formatDate(invoice.issue_date)}</td>
              <td>{formatDate(invoice.due_date)}</td>
              <td>{formatCurrency(invoice.total_amount)}</td>
              <td>
                <span class="badge {invoice.status}">{invoice.status}</span>
              </td>
            </tr>
          {/each}
        </Table>
      </Card>
    {/if}
  {:else}
    <div class="header">
      <h2>{view === 'create' ? 'Create' : 'Edit'} Invoice</h2>
      <Button variant="ghost" on:click={() => { view = 'list'; resetForm(); }}>
        Cancel
      </Button>
    </div>

    <form on:submit|preventDefault={handleSubmit}>
      <Card title="Invoice Details">
        <div class="form-row">
          <Input
            label="Invoice Number"
            bind:value={formInvoiceNumber}
            required
            disabled={mode === 'beginner'}
          />

          <Select
            label="Customer"
            bind:value={formContactId}
            required
            options={contacts
              .filter(c => c.type === 'customer' || c.type === 'both')
              .map(c => ({ value: c.id!, label: c.name }))}
            placeholder="Select customer"
          />
        </div>

        <div class="form-row">
          <Input
            type="date"
            label="Issue Date"
            bind:value={formIssueDate}
            required
          />

          <Input
            type="date"
            label="Due Date"
            bind:value={formDueDate}
            required
          />
        </div>

        <Input
          label="Notes"
          bind:value={formNotes}
          placeholder="Optional notes"
        />
      </Card>

      <Card title="Line Items">
        {#each formLines as line, index}
          <div class="line-item">
            <div class="line-number">{index + 1}</div>
            <div class="line-content">
              <Input
                label="Description"
                bind:value={line.description}
                required
                placeholder="Item or service description"
              />

              <div class="line-row">
                <Input
                  type="number"
                  label="Quantity"
                  bind:value={line.quantity}
                  required
                  min="0.01"
                  step="0.01"
                />

                <Input
                  type="number"
                  label="Unit Price"
                  bind:value={line.unit_price}
                  required
                  min="0.01"
                  step="0.01"
                />

                <Select
                  label="Revenue Account"
                  bind:value={line.account_id}
                  required
                  options={revenueAccounts.map(a => ({
                    value: a.id,
                    label: `${a.code} - ${a.name}`
                  }))}
                  placeholder="Select account"
                />

                <div class="line-total">
                  <strong>Amount:</strong>
                  <div>{formatCurrency(line.quantity * line.unit_price)}</div>
                </div>
              </div>
            </div>

            {#if formLines.length > 1}
              <Button
                variant="danger"
                size="sm"
                on:click={() => removeLine(index)}
              >
                Remove
              </Button>
            {/if}
          </div>
        {/each}

        <Button variant="ghost" on:click={addLine}>
          + Add Line
        </Button>
      </Card>

      <Card title="Totals">
        <div class="totals">
          <div class="total-row">
            <span>Subtotal:</span>
            <span>{formatCurrency(subtotal)}</span>
          </div>
          <div class="total-row">
            <span>Tax (13% HST):</span>
            <span>{formatCurrency(taxAmount)}</span>
          </div>
          <div class="total-row final">
            <span><strong>Total:</strong></span>
            <span><strong>{formatCurrency(total)}</strong></span>
          </div>
        </div>
      </Card>

      <div class="form-actions">
        <Button variant="ghost" on:click={() => { view = 'list'; resetForm(); }}>
          Cancel
        </Button>
        <Button type="submit">
          {view === 'create' ? 'Create' : 'Save'} Invoice
        </Button>
      </div>
    </form>
  {/if}
</div>

<!-- Invoice Detail Modal -->
{#if showDetailModal && selectedInvoice}
  <InvoiceDetailModal
    invoice={selectedInvoice}
    onClose={closeDetailModal}
    onEdit={handleEditFromDetail}
    onVoid={handleVoidFromDetail}
    {mode}
  />
{/if}

<style>
  .invoices-view {
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

  .line-item {
    display: flex;
    gap: 16px;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 6px;
    margin-bottom: 16px;
  }

  .line-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: #3498db;
    color: white;
    border-radius: 50%;
    font-weight: 600;
    flex-shrink: 0;
  }

  .line-content {
    flex: 1;
  }

  .line-row {
    display: grid;
    grid-template-columns: 1fr 1fr 2fr auto;
    gap: 12px;
    align-items: end;
  }

  .line-total {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    background: white;
    border-radius: 6px;
    min-width: 120px;
  }

  .totals {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
  }

  .total-row.final {
    border-top: 2px solid #2c3e50;
    padding-top: 12px;
    margin-top: 8px;
    font-size: 18px;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
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

  .clickable-row {
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .clickable-row:hover {
    background-color: #f8f9fa !important;
  }
</style>
