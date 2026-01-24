<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import { createBill, voidBill } from '../domain/bill-operations';
  import type { Bill, BillLine, Contact, Account, PolicyMode } from '../domain/types';
  import Button from '../ui/Button.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Card from '../ui/Card.svelte';
  import Table from '../ui/Table.svelte';

  export let mode: PolicyMode;

  let bills: Bill[] = [];
  let vendors: Contact[] = [];
  let expenseAccounts: Account[] = [];
  let loading = true;
  let view: 'list' | 'create' = 'list';
  let selectedBill: Bill | null = null;
  let showDetailModal = false;

  // Form fields
  let formBillNumber = '';
  let formVendorId: number | '' = '';
  let formBillDate = '';
  let formDueDate = '';
  let formReference = '';
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
      [bills, vendors, expenseAccounts] = await Promise.all([
        persistenceService.getBills(),
        persistenceService.getContacts('vendor'),
        persistenceService.getAccountsByType('expense')
      ]);

      // Generate next bill number
      if (bills.length === 0) {
        formBillNumber = 'BILL-0001';
      } else {
        const lastNum = Math.max(...bills.map(bill => {
          const match = bill.bill_number.match(/\d+$/);
          return match ? parseInt(match[0]) : 0;
        }));
        formBillNumber = `BILL-${String(lastNum + 1).padStart(4, '0')}`;
      }

      // Set default dates
      formBillDate = new Date().toISOString().split('T')[0];
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
      if (!formVendorId || typeof formVendorId !== 'number') {
        alert('Please select a vendor');
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
      const lines: BillLine[] = formLines.map((line, index) => ({
        line_number: index + 1,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        amount: line.quantity * line.unit_price,
        account_id: Number(line.account_id),
      }));

      const result = await createBill(
        {
          bill_number: formBillNumber,
          vendor_id: Number(formVendorId),
          bill_date: formBillDate,
          due_date: formDueDate,
          reference: formReference || undefined,
          notes: formNotes || undefined,
        },
        lines,
        { mode }
      );

      if (!result.ok) {
        alert('Failed to create bill:\n' + result.warnings.map(w => w.message).join('\n'));
        return;
      }

      // Show warnings if any
      if (result.warnings.length > 0) {
        alert(result.warnings.map(w => w.message).join('\n'));
      }

      await loadData();
      view = 'list';
      resetForm();
    } catch (e) {
      console.error('Failed to create bill:', e);
      alert('Failed to create bill: ' + e);
    }
  }

  function resetForm() {
    formVendorId = '';
    formReference = '';
    formNotes = '';
    formLines = [{ description: '', quantity: 1, unit_price: 0, account_id: '' }];
  }

  function handleRowClick(bill: Bill) {
    selectedBill = bill;
    showDetailModal = true;
  }

  function closeDetailModal() {
    showDetailModal = false;
    selectedBill = null;
  }

  async function handleVoid(billId: number) {
    if (!confirm('Are you sure you want to void this bill? This action creates a reversal entry and cannot be undone.')) {
      return;
    }

    try {
      const result = await voidBill(billId, 'User requested void', { mode });

      if (!result.ok) {
        alert('Failed to void bill:\n' + result.warnings.map(w => w.message).join('\n'));
        return;
      }

      if (result.warnings.length > 0) {
        alert(result.warnings.map(w => w.message).join('\n'));
      }

      await loadData();
      closeDetailModal();
    } catch (e) {
      console.error('Failed to void bill:', e);
      alert('Failed to void bill: ' + e);
    }
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

<div class="bills-view">
  {#if view === 'list'}
    <div class="header">
      <h2>Vendor Bills</h2>
      <Button on:click={() => view = 'create'}>
        + New Bill
      </Button>
    </div>

    {#if loading}
      <Card>
        <p>Loading bills...</p>
      </Card>
    {:else if bills.length === 0}
      <Card>
        <p>No bills yet. Click "New Bill" to create your first vendor bill.</p>
      </Card>
    {:else}
      <Card padding={false}>
        <Table headers={['Bill #', 'Vendor', 'Date', 'Due Date', 'Amount', 'Status']}>
          {#each bills as bill}
            <tr class="clickable-row" on:click={() => handleRowClick(bill)}>
              <td><strong>{bill.bill_number}</strong></td>
              <td>{vendors.find(v => v.id === bill.vendor_id)?.name || 'Unknown'}</td>
              <td>{formatDate(bill.bill_date)}</td>
              <td>{formatDate(bill.due_date)}</td>
              <td>{formatCurrency(bill.total_amount)}</td>
              <td>
                <span class="badge {bill.status}">{bill.status}</span>
              </td>
            </tr>
          {/each}
        </Table>
      </Card>
    {/if}
  {:else}
    <div class="header">
      <h2>Create Bill</h2>
      <Button variant="ghost" on:click={() => { view = 'list'; resetForm(); }}>
        Cancel
      </Button>
    </div>

    <form on:submit|preventDefault={handleSubmit}>
      <Card title="Bill Details">
        <div class="form-row">
          <Input
            label="Bill Number"
            bind:value={formBillNumber}
            required
            disabled={mode === 'beginner'}
          />

          <Select
            label="Vendor"
            bind:value={formVendorId}
            required
            options={vendors.map(v => ({ value: v.id!, label: v.name }))}
            placeholder="Select vendor"
          />
        </div>

        <div class="form-row">
          <Input
            type="date"
            label="Bill Date"
            bind:value={formBillDate}
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
          label="Reference (Vendor Invoice #)"
          bind:value={formReference}
          placeholder="Optional vendor invoice number"
        />

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
                placeholder="Expense description"
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
                  label="Expense Account"
                  bind:value={line.account_id}
                  required
                  options={expenseAccounts.map(a => ({
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
          Create Bill
        </Button>
      </div>
    </form>
  {/if}
</div>

<!-- Bill Detail Modal -->
{#if showDetailModal && selectedBill}
  <div class="modal-overlay" on:click={closeDetailModal} on:keydown={(e) => e.key === 'Escape' && closeDetailModal()} role="button" tabindex="-1">
    <div class="modal-content" on:click|stopPropagation on:keydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <div class="modal-header">
        <h3>Bill Details</h3>
        <button class="close-btn" on:click={closeDetailModal}>&times;</button>
      </div>

      <div class="modal-body">
        <div class="detail-grid">
          <div class="detail-item">
            <span class="label">Bill Number:</span>
            <span class="value"><strong>{selectedBill.bill_number}</strong></span>
          </div>
          <div class="detail-item">
            <span class="label">Vendor:</span>
            <span class="value">{vendors.find(v => v.id === selectedBill?.vendor_id)?.name || 'Unknown'}</span>
          </div>
          <div class="detail-item">
            <span class="label">Bill Date:</span>
            <span class="value">{formatDate(selectedBill.bill_date)}</span>
          </div>
          <div class="detail-item">
            <span class="label">Due Date:</span>
            <span class="value">{formatDate(selectedBill.due_date)}</span>
          </div>
          {#if selectedBill.reference}
            <div class="detail-item">
              <span class="label">Reference:</span>
              <span class="value">{selectedBill.reference}</span>
            </div>
          {/if}
          <div class="detail-item">
            <span class="label">Status:</span>
            <span class="badge {selectedBill.status}">{selectedBill.status}</span>
          </div>
          <div class="detail-item">
            <span class="label">Total Amount:</span>
            <span class="value"><strong>{formatCurrency(selectedBill.total_amount)}</strong></span>
          </div>
          <div class="detail-item">
            <span class="label">Paid Amount:</span>
            <span class="value">{formatCurrency(selectedBill.paid_amount)}</span>
          </div>
          {#if selectedBill.notes}
            <div class="detail-item full-width">
              <span class="label">Notes:</span>
              <span class="value">{selectedBill.notes}</span>
            </div>
          {/if}
        </div>

        {#if selectedBill.status !== 'void' && selectedBill.paid_amount === 0}
          <div class="modal-actions">
            <Button variant="danger" on:click={() => handleVoid(selectedBill!.id!)}>
              Void Bill
            </Button>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .bills-view {
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
    background: #e67e22;
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

  .badge.pending {
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

  /* Modal styles */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    border-radius: 8px;
    width: 90%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #e1e8ed;
  }

  .modal-header h3 {
    margin: 0;
    color: #2c3e50;
    font-size: 24px;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 32px;
    color: #95a5a6;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .close-btn:hover {
    color: #2c3e50;
  }

  .modal-body {
    padding: 24px;
  }

  .detail-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 24px;
  }

  .detail-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .detail-item.full-width {
    grid-column: 1 / -1;
  }

  .detail-item .label {
    font-size: 12px;
    color: #7f8c8d;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .detail-item .value {
    font-size: 16px;
    color: #2c3e50;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid #e1e8ed;
  }
</style>
