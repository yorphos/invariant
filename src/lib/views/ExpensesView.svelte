<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import { createExpense } from '../domain/expense-operations';
  import type { Account, Contact, JournalEntry, PolicyMode } from '../domain/types';
  import Button from '../ui/Button.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Card from '../ui/Card.svelte';
  import Table from '../ui/Table.svelte';

  export let mode: PolicyMode;

  let expenses: JournalEntry[] = [];
  let expenseAccounts: Account[] = [];
  let assetAccounts: Account[] = [];
  let vendors: Contact[] = [];
  let loading = true;
  let view: 'list' | 'create' = 'list';

  // Form fields
  let formDescription = '';
  let formAmount = 0;
  let formDate = '';
  let formVendorId: number | '' = '';
  let formExpenseAccountId: number | '' = '';
  let formPaymentAccountId: number | '' = '';
  let formReference = '';
  let formNotes = '';

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      [expenseAccounts, assetAccounts, vendors] = await Promise.all([
        persistenceService.getAccountsByType('expense'),
        persistenceService.getAccountsByType('asset'),
        persistenceService.getContacts('vendor')
      ]);

      // Get recent expense entries
      const db = await import('../services/database').then(m => m.getDatabase());
      expenses = await (await db).select<JournalEntry[]>(
        `SELECT * FROM journal_entry 
         WHERE description LIKE 'Expense:%' OR event_id IN (
           SELECT id FROM transaction_event WHERE event_type = 'expense_recorded'
         )
         ORDER BY entry_date DESC LIMIT 50`
      );

      formDate = new Date().toISOString().split('T')[0];
    } catch (e) {
      console.error('Failed to load data:', e);
    }
    loading = false;
  }

  async function handleSubmit() {
    try {
      if (typeof formExpenseAccountId !== 'number' || typeof formPaymentAccountId !== 'number') {
        alert('Please select expense and payment accounts');
        return;
      }

      const result = await createExpense(
        {
          description: formDescription,
          amount: formAmount,
          expense_date: formDate,
          vendor_id: typeof formVendorId === 'number' ? formVendorId : undefined,
          expense_account_id: formExpenseAccountId,
          payment_account_id: formPaymentAccountId,
          reference: formReference || undefined,
          notes: formNotes || undefined,
        },
        { mode }
      );

      if (!result.ok) {
        alert('Failed to record expense:\n' + result.warnings.map(w => w.message).join('\n'));
        return;
      }

      await loadData();
      view = 'list';
      resetForm();
    } catch (e) {
      console.error('Failed to record expense:', e);
      alert('Failed to record expense: ' + e);
    }
  }

  function resetForm() {
    formDescription = '';
    formAmount = 0;
    formVendorId = '';
    formExpenseAccountId = '';
    formPaymentAccountId = '';
    formReference = '';
    formNotes = '';
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

<div class="expenses-view">
  {#if view === 'list'}
    <div class="header">
      <h2>Expenses</h2>
      <Button on:click={() => view = 'create'}>
        + Record Expense
      </Button>
    </div>

    {#if loading}
      <Card>
        <p>Loading expenses...</p>
      </Card>
    {:else if expenses.length === 0}
      <Card>
        <p>No expenses yet. Click "Record Expense" to add your first expense.</p>
      </Card>
    {:else}
      <Card padding={false}>
        <Table headers={['Date', 'Description', 'Reference', 'Status']}>
          {#each expenses as expense}
            <tr>
              <td>{formatDate(expense.entry_date)}</td>
              <td>{expense.description}</td>
              <td>{expense.reference || '-'}</td>
              <td>
                <span class="badge {expense.status}">{expense.status}</span>
              </td>
            </tr>
          {/each}
        </Table>
      </Card>
    {/if}
  {:else}
    <div class="header">
      <h2>Record Expense</h2>
      <Button variant="ghost" on:click={() => view = 'list'}>
        Cancel
      </Button>
    </div>

    <form on:submit|preventDefault={handleSubmit}>
      <Card title="Expense Details">
        <Input
          label="Description"
          bind:value={formDescription}
          required
          placeholder="What was this expense for?"
        />

        <div class="form-row">
          <Input
            type="number"
            label="Amount"
            bind:value={formAmount}
            required
            min="0.01"
            step="0.01"
          />

          <Input
            type="date"
            label="Date"
            bind:value={formDate}
            required
          />
        </div>

        <Select
          label="Vendor"
          bind:value={formVendorId}
          options={vendors.map(v => ({ value: v.id!, label: v.name }))}
          placeholder="Select vendor (optional)"
        />

        <Select
          label="Expense Account"
          bind:value={formExpenseAccountId}
          required
          options={expenseAccounts.map(a => ({
            value: a.id,
            label: `${a.code} - ${a.name}`
          }))}
          placeholder="Select expense category"
        />

        <Select
          label="Paid From"
          bind:value={formPaymentAccountId}
          required
          options={assetAccounts
            .filter(a => a.code.startsWith('10'))
            .map(a => ({
              value: a.id,
              label: `${a.code} - ${a.name}`
            }))}
          placeholder="Select payment account"
        />

        <Input
          label="Reference"
          bind:value={formReference}
          placeholder="Receipt #, invoice #, etc."
        />

        <Input
          label="Notes"
          bind:value={formNotes}
          placeholder="Optional notes"
        />
      </Card>

      <div class="form-actions">
        <Button variant="ghost" on:click={() => view = 'list'}>
          Cancel
        </Button>
        <Button type="submit">
          Record Expense
        </Button>
      </div>
    </form>
  {/if}
</div>

<style>
  .expenses-view {
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

  .badge.posted {
    background: #d5f4e6;
    color: #27ae60;
  }

  .badge.void {
    background: #fadbd8;
    color: #e74c3c;
  }
</style>
