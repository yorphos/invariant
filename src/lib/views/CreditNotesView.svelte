<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import { createCreditNote, applyCreditNote, refundCreditNote, voidCreditNote } from '../domain/credit-note-operations';
  import type { CreditNote, CreditNoteLine, Contact, Account, Invoice, PolicyMode } from '../domain/types';
  import Button from '../ui/Button.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Card from '../ui/Card.svelte';
  import Modal from '../ui/Modal.svelte';
  import Table from '../ui/Table.svelte';
  import { toasts } from '../stores/toast';

  export let mode: PolicyMode;

  let creditNotes: CreditNote[] = [];
  let contacts: Contact[] = [];
  let invoices: Invoice[] = [];
  let revenueAccounts: Account[] = [];
  let loading = true;
  let showModal = false;
  let view: 'list' | 'create' | 'apply' | 'refund' | 'void' = 'list';
  let selectedCreditNote: CreditNote | null = null;
  let selectedInvoice: Invoice | null = null;
  let formSelectedCreditNote: string | number | '' = '';
  let formSelectedInvoice: string | number | '' = '';

  let formCreditNoteNumber = '';
  let formContactId: number | '' = '';
  let formIssueDate = '';
  let formNotes = '';
  let formLines: Array<{
    description: string;
    quantity: number;
    unit_price: number;
    account_id: number | '';
  }> = [{ description: '', quantity: 1, unit_price: 0, account_id: '' }];
  let applyAmount = 0;
  let refundNumber = '';
  let refundDate = '';
  let refundPaymentMethod = 'cash';
  let refundAmount = 0;
  let voidReason = '';

  let taxRate = 0.13;
  let taxInclusivePricing = false;

  $: subtotal = formLines.reduce((sum, line) => sum + (line.quantity * line.unit_price), 0);
  $: taxAmount = taxInclusivePricing
    ? subtotal - (subtotal / (1 + taxRate))
    : subtotal * taxRate;
  $: total = taxInclusivePricing ? subtotal : subtotal + taxAmount;

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      [creditNotes, contacts, invoices, revenueAccounts] = await Promise.all([
        persistenceService.getCreditNotes(),
        persistenceService.getContacts('customer'),
        persistenceService.getInvoices(),
        persistenceService.getAccountsByType('revenue')
      ]);

      taxRate = 0.13;

      if (creditNotes.length === 0) {
        formCreditNoteNumber = 'CN-0001';
      } else {
        const lastNum = Math.max(...creditNotes.map(cn => {
          const match = cn.credit_note_number.match(/\d+$/);
          return match ? parseInt(match[0]) : 0;
        }));
        formCreditNoteNumber = `CN-${String(lastNum + 1).padStart(4, '0')}`;
      }

      formIssueDate = new Date().toISOString().split('T')[0];
      refundDate = new Date().toISOString().split('T')[0];
    } catch (e) {
      console.error('Failed to load data:', e);
      toasts.error('Failed to load credit notes data');
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

  async function handleCreate() {
    try {
      if (!formContactId || typeof formContactId !== 'number') {
        toasts.error('Please select a customer');
        return;
      }

      for (const line of formLines) {
        if (!line.description || typeof line.account_id !== 'number') {
          toasts.error('Please fill in all line items');
          return;
        }
      }

      const lines: CreditNoteLine[] = formLines.map((line, index) => ({
        line_number: index + 1,
        description: line.description,
        quantity: line.quantity,
        unit_price: line.unit_price,
        amount: line.quantity * line.unit_price,
        is_tax_inclusive: taxInclusivePricing,
        account_id: Number(line.account_id),
      }));

      const result = await createCreditNote(
        {
          credit_note_number: formCreditNoteNumber,
          contact_id: Number(formContactId),
          issue_date: formIssueDate,
          notes: formNotes || undefined,
          tax_code_id: 1,
        },
        lines,
        { mode }
      );

      if (result.ok) {
        toasts.success('Credit note created successfully');
        view = 'list';
        await loadData();
        resetForm();
      } else {
        toasts.error(result.warnings[0]?.message || 'Failed to create credit note');
      }
    } catch (e) {
      console.error('Create credit note error:', e);
      toasts.error('Failed to create credit note');
    }
  }

  async function handleApply() {
    if (!selectedCreditNote || !selectedInvoice || !applyAmount) {
      toasts.error('Please fill in all fields');
      return;
    }

    try {
      const result = await applyCreditNote(
        selectedCreditNote.id!,
        selectedInvoice.id!,
        applyAmount,
        'Credit note application'
      );

      if (result.ok) {
        toasts.success('Credit note applied successfully');
        view = 'list';
        await loadData();
        selectedCreditNote = null;
        selectedInvoice = null;
        formSelectedCreditNote = '';
        formSelectedInvoice = '';
        applyAmount = 0;
      } else {
        toasts.error(result.warnings[0]?.message || 'Failed to apply credit note');
      }
    } catch (e) {
      console.error('Apply credit note error:', e);
      toasts.error('Failed to apply credit note');
    }
  }

      if (result.ok) {
        toasts.success('Credit note applied successfully');
        view = 'list';
        await loadData();
        selectedCreditNote = null;
        selectedInvoice = null;
        applyAmount = 0;
      } else {
        toasts.error(result.warnings[0]?.message || 'Failed to apply credit note');
      }
    } catch (e) {
      console.error('Apply credit note error:', e);
      toasts.error('Failed to apply credit note');
    }
  }

  async function handleRefund() {
    if (!selectedCreditNote || !refundNumber || !refundAmount) {
      toasts.error('Please fill in all fields');
      return;
    }

    try {
      const result = await refundCreditNote(
        selectedCreditNote.id!,
        refundNumber,
        refundDate,
        refundPaymentMethod,
        refundAmount,
        'Cash refund'
      );

      if (result.ok) {
        toasts.success('Refund processed successfully');
        view = 'list';
        await loadData();
        selectedCreditNote = null;
        refundNumber = '';
        refundAmount = 0;
        formSelectedCreditNote = '';
      } else {
        toasts.error(result.warnings[0]?.message || 'Failed to process refund');
      }
    } catch (e) {
      console.error('Refund error:', e);
      toasts.error('Failed to process refund');
    }
  }

      if (result.ok) {
        toasts.success('Refund processed successfully');
        view = 'list';
        await loadData();
        selectedCreditNote = null;
        refundNumber = '';
        refundAmount = 0;
      } else {
        toasts.error(result.warnings[0]?.message || 'Failed to process refund');
      }
    } catch (e) {
      console.error('Refund error:', e);
      toasts.error('Failed to process refund');
    }
  }

  async function handleVoid() {
    if (!selectedCreditNote || !voidReason) {
      toasts.error('Please provide a reason for voiding');
      return;
    }

    try {
      const result = await voidCreditNote(selectedCreditNote.id!, voidReason);

      if (result.ok) {
        toasts.success('Credit note voided successfully');
        view = 'list';
        await loadData();
        selectedCreditNote = null;
        voidReason = '';
        formSelectedCreditNote = '';
      } else {
        toasts.error(result.warnings[0]?.message || 'Failed to void credit note');
      }
    } catch (e) {
      console.error('Void credit note error:', e);
      toasts.error('Failed to void credit note');
    }
  }

      if (result.ok) {
        toasts.success('Credit note voided successfully');
        view = 'list';
        await loadData();
        selectedCreditNote = null;
        voidReason = '';
      } else {
        toasts.error(result.warnings[0]?.message || 'Failed to void credit note');
      }
    } catch (e) {
      console.error('Void credit note error:', e);
      toasts.error('Failed to void credit note');
    }
  }

  function resetForm() {
    formLines = [{ description: '', quantity: 1, unit_price: 0, account_id: '' }];
    formNotes = '';
    formContactId = '';
  }

  function getStatusBadge(status: string) {
    const colors = {
      draft: 'bg-gray-200 text-gray-800',
      issued: 'bg-blue-100 text-blue-800',
      applied: 'bg-green-100 text-green-800',
      partial: 'bg-yellow-100 text-yellow-800',
      void: 'bg-red-100 text-red-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-200 text-gray-800';
  }

  function getCreditNoteStatus(status: string) {
    const statusMap = {
      draft: 'Draft',
      issued: 'Issued',
      applied: 'Applied',
      partial: 'Partial',
      void: 'Void',
    };
    return statusMap[status as keyof typeof statusMap] || status;
  }
</script>

<div class="p-6">
  {#if loading}
    <div class="text-center py-12">
      <p class="text-gray-600">Loading credit notes...</p>
    </div>
  {:else}
    {#if view === 'list'}
      <Card title="Credit Notes">
        <div slot="actions">
          <Button variant="primary" on:click={() => { view = 'create'; resetForm(); }}>
            New Credit Note
          </Button>
        </div>

        {#if creditNotes.length === 0}
          <div class="text-center py-12">
            <p class="text-gray-600 mb-4">No credit notes yet</p>
            <Button variant="primary" on:click={() => { view = 'create'; resetForm(); }}>
              Create First Credit Note
            </Button>
          </div>
        {:else}
          <Table
            headers={['Number', 'Customer', 'Issue Date', 'Status', 'Total', 'Applied', 'Available']}
          >
            {#each creditNotes as cn}
              {@const customer = contacts.find(c => c.id === cn.contact_id)}
              <tr class="hover:bg-gray-50 cursor-pointer">
                <td class="px-4 py-3 border-b">
                  <button class="text-blue-600 hover:underline" on:click={() => { selectedCreditNote = cn; showModal = true; }}>
                    {cn.credit_note_number}
                  </button>
                </td>
                <td class="px-4 py-3 border-b">{customer?.name || '-'}</td>
                <td class="px-4 py-3 border-b">{cn.issue_date}</td>
                <td class="px-4 py-3 border-b">
                  <span class={`px-2 py-1 rounded text-xs font-medium ${getStatusBadge(cn.status)}`}>
                    {getCreditNoteStatus(cn.status)}
                  </span>
                </td>
                <td class="px-4 py-3 border-b text-right">${cn.total_amount.toFixed(2)}</td>
                <td class="px-4 py-3 border-b text-right">${cn.applied_amount.toFixed(2)}</td>
                <td class="px-4 py-3 border-b text-right font-semibold">
                  ${(cn.total_amount - cn.applied_amount).toFixed(2)}
                </td>
              </tr>
            {/each}
          </Table>
        {/if}
      </Card>
    {:else if view === 'create'}
      <Card title="Create Credit Note">
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <Input label="Credit Note Number" bind:value={formCreditNoteNumber} disabled={mode === 'beginner'} />
            <Select
              label="Customer"
              bind:value={formContactId}
              options={contacts.map(c => ({ value: c.id!.toString(), label: c.name }))}
              placeholder="Select customer"
            />
          </div>

          <Input label="Issue Date" type="date" bind:value={formIssueDate} />
          <Input label="Notes" bind:value={formNotes} placeholder="Optional notes..." />

          <div class="space-y-2">
            <h3 class="text-lg font-semibold">Line Items</h3>

            {#each formLines as line, i}
              <div class="border rounded p-4 bg-gray-50">
                <div class="grid grid-cols-4 gap-4">
                  <Input
                    label="Description"
                    bind:value={line.description}
                    placeholder="Item description"
                  />
                  <Input
                    label="Quantity"
                    type="number"
                    step="0.001"
                    bind:value={line.quantity}
                  />
                  <Input
                    label="Unit Price"
                    type="number"
                    step="0.01"
                    bind:value={line.unit_price}
                  />
                  <Select
                    label="Account"
                    bind:value={line.account_id}
                    options={revenueAccounts.map(a => ({ value: a.id!.toString(), label: `${a.code} - ${a.name}` }))}
                    placeholder="Select account"
                  />
                </div>
                <div class="mt-2 text-right">
                  <Button variant="danger" size="sm" on:click={() => removeLine(i)}>
                    Remove Line
                  </Button>
                </div>
              </div>
            {/each}

            <Button variant="secondary" on:click={addLine}>
              + Add Line Item
            </Button>
          </div>

          <div class="flex items-center gap-2">
            <input type="checkbox" id="taxInclusive" bind:checked={taxInclusivePricing} />
            <label for="taxInclusive">Prices include tax ({(taxRate * 100).toFixed(0)}%)</label>
          </div>

          <div class="bg-blue-50 p-4 rounded">
            <div class="flex justify-between mb-1">
              <span>Subtotal:</span>
              <span class="font-semibold">${subtotal.toFixed(2)}</span>
            </div>
            <div class="flex justify-between mb-1">
              <span>Tax:</span>
              <span class="font-semibold">${taxAmount.toFixed(2)}</span>
            </div>
            <div class="flex justify-between text-lg font-bold border-t pt-2">
              <span>Total:</span>
              <span>${total.toFixed(2)}</span>
            </div>
          </div>

          <div class="flex gap-2 justify-end">
            <Button variant="secondary" on:click={() => { view = 'list'; resetForm(); }}>
              Cancel
            </Button>
            <Button variant="primary" on:click={handleCreate}>
              Create Credit Note
            </Button>
          </div>
        </div>
      </Card>
    {:else if view === 'apply'}
      <Card title="Apply Credit Note to Invoice">
        <div class="space-y-4">
          <Select
            label="Credit Note"
            bind:value={selectedCreditNote as string | number}
            options={creditNotes
              .filter(cn => cn.status === 'issued' || cn.status === 'partial')
              .map(cn => ({
                value: cn.id!.toString(),
                label: `${cn.credit_note_number} - $${(cn.total_amount - cn.applied_amount).toFixed(2)} available`
              }))}
            placeholder="Select credit note"
          />

          <Select
            label="Invoice"
            bind:value={formSelectedInvoice}
            options={invoices
              .filter(inv => inv.status !== 'paid' && inv.status !== 'void')
              .map(inv => ({
                value: inv.id!.toString(),
                label: `${inv.invoice_number} - $${(inv.total_amount - inv.paid_amount).toFixed(2)} outstanding`
              }))}
            placeholder="Select invoice"
          />

          <Input
            label="Amount to Apply"
            type="number"
            step="0.01"
            bind:value={applyAmount}
            placeholder="0.00"
          />

          <div class="flex gap-2 justify-end">
            <Button variant="secondary" on:click={() => { view = 'list'; selectedCreditNote = null; selectedInvoice = null; formSelectedCreditNote = ''; formSelectedInvoice = ''; }}>
              Cancel
            </Button>
            <Button variant="primary" on:click={handleApply}>
              Apply Credit Note
            </Button>
          </div>
        </div>
      </Card>
    {:else if view === 'refund'}
      <Card title="Refund Credit Note">
        <div class="space-y-4">
          <Select
            label="Credit Note"
            bind:value={selectedCreditNote as string | number}
            options={creditNotes
              .filter(cn => cn.status === 'issued' || cn.status === 'partial')
              .map(cn => ({
                value: cn.id!.toString(),
                label: `${cn.credit_note_number} - $${(cn.total_amount - cn.applied_amount).toFixed(2)} available`
              }))}
            placeholder="Select credit note"
          />

          <Input label="Refund Number" bind:value={refundNumber} placeholder="REF-0001" />
          <Input label="Refund Date" type="date" bind:value={refundDate} />
          <Input
            label="Refund Amount"
            type="number"
            step="0.01"
            bind:value={refundAmount}
            placeholder="0.00"
          />
          <Select
            label="Payment Method"
            bind:value={refundPaymentMethod as string | number}
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'check', label: 'Check' },
              { value: 'transfer', label: 'Bank Transfer' },
              { value: 'card', label: 'Card' },
            ]}
          />

          <div class="flex gap-2 justify-end">
            <Button variant="secondary" on:click={() => { view = 'list'; selectedCreditNote = null; refundNumber = ''; refundAmount = 0; formSelectedCreditNote = ''; }}>
              Cancel
            </Button>
            <Button variant="primary" on:click={handleRefund}>
              Process Refund
            </Button>
          </div>
        </div>
      </Card>
    {:else if view === 'void'}
      <Card title="Void Credit Note">
        <div class="space-y-4">
          <Select
            label="Credit Note"
            bind:value={formSelectedCreditNote}
            options={creditNotes
              .filter(cn => cn.status !== 'void')
              .map(cn => ({
                value: cn.id!.toString(),
                label: cn.credit_note_number
              }))}
            placeholder="Select credit note"
          />

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Reason for Void</label>
            <textarea
              class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              rows="3"
              bind:value={voidReason}
              placeholder="Enter reason for voiding this credit note..."
            />
          </div>

          <div class="flex gap-2 justify-end">
            <Button variant="secondary" on:click={() => { view = 'list'; selectedCreditNote = null; voidReason = ''; formSelectedCreditNote = ''; }}>
              Cancel
            </Button>
            <Button variant="danger" on:click={handleVoid}>
              Void Credit Note
            </Button>
          </div>
        </div>
      </Card>
    {/if}
  {/if}
</div>

{#if showModal && selectedCreditNote}
  <Modal open={showModal} title={selectedCreditNote.credit_note_number} onclose={() => { showModal = false; selectedCreditNote = null; }}>
    <div class="space-y-4">
      {@const customer = contacts.find(c => c.id === selectedCreditNote.contact_id)}
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Customer</label>
          <p class="text-gray-900">{customer?.name || '-'}</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Issue Date</label>
          <p class="text-gray-900">{selectedCreditNote.issue_date}</p>
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
        <span class={`px-2 py-1 rounded text-xs font-medium ${getStatusBadge(selectedCreditNote.status)}`}>
          {getCreditNoteStatus(selectedCreditNote.status)}
        </span>
      </div>

      <div class="grid grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Total Amount</label>
          <p class="text-gray-900 font-semibold">${selectedCreditNote.total_amount.toFixed(2)}</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Applied Amount</label>
          <p class="text-gray-900">${selectedCreditNote.applied_amount.toFixed(2)}</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Available</label>
          <p class="text-gray-900 font-semibold">${(selectedCreditNote.total_amount - selectedCreditNote.applied_amount).toFixed(2)}</p>
        </div>
      </div>

      {#if selectedCreditNote.notes}
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <p class="text-gray-900">{selectedCreditNote.notes}</p>
        </div>
      {/if}

      <div class="flex gap-2 justify-end pt-4 border-t">
        {#if (selectedCreditNote.status === 'issued' || selectedCreditNote.status === 'partial')}
          <Button variant="secondary" on:click={() => { showModal = false; view = 'apply'; applyAmount = (selectedCreditNote.total_amount - selectedCreditNote.applied_amount); }}>
            Apply to Invoice
          </Button>
          <Button variant="secondary" on:click={() => { showModal = false; view = 'refund'; refundAmount = (selectedCreditNote.total_amount - selectedCreditNote.applied_amount); }}>
            Refund
          </Button>
        {/if}
        {#if selectedCreditNote.status !== 'void' && selectedCreditNote.applied_amount === 0}
          <Button variant="danger" on:click={() => { showModal = false; view = 'void'; }}>
            Void
          </Button>
        {/if}
        <Button variant="secondary" on:click={() => { showModal = false; selectedCreditNote = null; }}>
          Close
        </Button>
      </div>
    </div>
  </Modal>
{/if}
