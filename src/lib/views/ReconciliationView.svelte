<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import {
    getReconciliations,
    getUnreconciledTransactions,
    getBookBalance,
    createReconciliation,
    addReconciliationItems,
    removeReconciliationItems,
    calculateReconciliationDifference,
    completeReconciliation,
    cancelReconciliation,
    getReconciliationSummary
  } from '../services/bank-reconciliation';
  import type {
    Account,
    BankReconciliation,
    UnreconciledTransaction,
    PolicyMode
  } from '../domain/types';
  import Button from '../ui/Button.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Card from '../ui/Card.svelte';
  import Table from '../ui/Table.svelte';

  export let mode: PolicyMode;

  let accounts: Account[] = [];
  let selectedAccountId: number | '' = '';
  let reconciliations: BankReconciliation[] = [];
  let loading = true;
  let view: 'list' | 'create' | 'reconcile' = 'list';
  
  // Reconciliation form
  let statementDate = '';
  let statementBalance = 0;
  let bookBalance = 0;
  let currentReconciliationId: number | null = null;
  let unreconciledTransactions: UnreconciledTransaction[] = [];
  let clearedTransactionIds: Set<number> = new Set();
  
  // Summary stats
  let reconSummary: {
    lastReconciliationDate: string | null;
    unreconciledTransactionCount: number;
    lastReconciledBalance: number | null;
  } | null = null;
  
  // Reconciliation difference
  let reconDifference: {
    statementBalance: number;
    clearedBalance: number;
    difference: number;
    isBalanced: boolean;
  } | null = null;

  $: bankAccounts = accounts.filter(a => a.type === 'asset' && a.is_active);
  $: bankAccountOptions = [
    { value: '', label: 'Select account...' },
    ...bankAccounts.map(acc => ({ value: acc.id, label: `${acc.code} - ${acc.name}` }))
  ];
  $: clearedBalance = unreconciledTransactions
    .filter(txn => clearedTransactionIds.has(txn.journal_line_id))
    .reduce((sum, txn) => sum + (txn.debit_amount - txn.credit_amount), 0);
  $: difference = clearedBalance - statementBalance;
  $: isBalanced = Math.abs(difference) < 0.01;

  onMount(async () => {
    await loadAccounts();
  });

  async function loadAccounts() {
    loading = true;
    try {
      accounts = await persistenceService.getAccounts();
      statementDate = new Date().toISOString().split('T')[0];
    } catch (e) {
      console.error('Failed to load accounts:', e);
    }
    loading = false;
  }

  async function handleAccountChange() {
    if (selectedAccountId && typeof selectedAccountId === 'number') {
      await loadReconciliations();
      await loadSummary();
    }
  }

  async function loadReconciliations() {
    if (!selectedAccountId || typeof selectedAccountId !== 'number') return;
    
    try {
      reconciliations = await getReconciliations(selectedAccountId);
    } catch (e) {
      console.error('Failed to load reconciliations:', e);
    }
  }

  async function loadSummary() {
    if (!selectedAccountId || typeof selectedAccountId !== 'number') return;
    
    try {
      reconSummary = await getReconciliationSummary(selectedAccountId);
    } catch (e) {
      console.error('Failed to load summary:', e);
    }
  }

  async function startNewReconciliation() {
    if (!selectedAccountId || typeof selectedAccountId === 'number' === false) {
      alert('Please select a bank account');
      return;
    }
    
    try {
      // Get book balance
      bookBalance = await getBookBalance(selectedAccountId as number, statementDate);
      
      // Load unreconciled transactions
      unreconciledTransactions = await getUnreconciledTransactions(
        selectedAccountId as number,
        statementDate
      );
      
      clearedTransactionIds.clear();
      view = 'create';
    } catch (e) {
      console.error('Failed to start reconciliation:', e);
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  function toggleTransaction(txn: UnreconciledTransaction) {
    if (clearedTransactionIds.has(txn.journal_line_id)) {
      clearedTransactionIds.delete(txn.journal_line_id);
    } else {
      clearedTransactionIds.add(txn.journal_line_id);
    }
    clearedTransactionIds = clearedTransactionIds; // Trigger reactivity
  }

  async function saveReconciliation() {
    if (!selectedAccountId || typeof selectedAccountId !== 'number') {
      alert('Please select a bank account');
      return;
    }
    
    if (statementBalance === 0) {
      alert('Please enter the statement balance');
      return;
    }
    
    try {
      // Create the reconciliation
      const reconId = await createReconciliation(
        selectedAccountId,
        statementDate,
        statementBalance,
        { mode }
      );
      
      // Add cleared items
      if (clearedTransactionIds.size > 0) {
        await addReconciliationItems(
          reconId,
          Array.from(clearedTransactionIds),
          { mode }
        );
      }
      
      currentReconciliationId = reconId;
      view = 'reconcile';
      
      // Calculate difference
      await updateReconciliationDifference();
    } catch (e) {
      console.error('Failed to save reconciliation:', e);
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  async function updateReconciliationDifference() {
    if (!currentReconciliationId) return;
    
    try {
      reconDifference = await calculateReconciliationDifference(currentReconciliationId);
    } catch (e) {
      console.error('Failed to calculate difference:', e);
    }
  }

  async function handleComplete() {
    if (!currentReconciliationId) return;
    
    if (!reconDifference?.isBalanced) {
      const confirm = window.confirm(
        `This reconciliation does not balance (difference: $${Math.abs(reconDifference?.difference || 0).toFixed(2)}). ` +
        `Are you sure you want to complete it?`
      );
      if (!confirm) return;
    }
    
    try {
      await completeReconciliation(currentReconciliationId, { mode });
      alert('Reconciliation completed successfully!');
      
      // Reset and reload
      currentReconciliationId = null;
      reconDifference = null;
      clearedTransactionIds.clear();
      view = 'list';
      await loadReconciliations();
      await loadSummary();
    } catch (e) {
      console.error('Failed to complete reconciliation:', e);
      alert(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  async function handleCancel() {
    if (currentReconciliationId) {
      try {
        await cancelReconciliation(currentReconciliationId, { mode });
      } catch (e) {
        console.error('Failed to cancel reconciliation:', e);
      }
    }
    
    currentReconciliationId = null;
    reconDifference = null;
    clearedTransactionIds.clear();
    view = 'list';
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

<div class="reconciliation-view">
  <div class="header">
    <h1>Bank Reconciliation</h1>
    <div class="account-selector">
      <Select
        label="Bank Account"
        bind:value={selectedAccountId}
        options={bankAccountOptions}
        on:change={handleAccountChange}
        disabled={view !== 'list'}
      />
    </div>
  </div>

  {#if loading}
    <p>Loading...</p>
  {:else if view === 'list'}
    {#if selectedAccountId}
      <Card>
        <h2>Reconciliation Summary</h2>
        {#if reconSummary}
          <div class="summary-grid">
            <div class="summary-item">
              <span class="label">Last Reconciliation:</span>
              <span class="value">
                {reconSummary.lastReconciliationDate 
                  ? formatDate(reconSummary.lastReconciliationDate)
                  : 'Never'}
              </span>
            </div>
            <div class="summary-item">
              <span class="label">Last Reconciled Balance:</span>
              <span class="value">
                {reconSummary.lastReconciledBalance !== null
                  ? formatCurrency(reconSummary.lastReconciledBalance)
                  : 'N/A'}
              </span>
            </div>
            <div class="summary-item">
              <span class="label">Unreconciled Transactions:</span>
              <span class="value">{reconSummary.unreconciledTransactionCount}</span>
            </div>
          </div>
        {/if}
        <div class="actions">
          <Button on:click={startNewReconciliation}>Start New Reconciliation</Button>
        </div>
      </Card>

      <Card>
        <h2>Reconciliation History</h2>
        {#if reconciliations.length > 0}
          <Table>
            <thead>
              <tr>
                <th>Statement Date</th>
                <th>Statement Balance</th>
                <th>Status</th>
                <th>Completed</th>
              </tr>
            </thead>
            <tbody>
              {#each reconciliations as recon}
                <tr>
                  <td>{formatDate(recon.statement_date)}</td>
                  <td>{formatCurrency(recon.statement_balance)}</td>
                  <td>
                    <span class="status-badge status-{recon.status}">
                      {recon.status.toUpperCase()}
                    </span>
                  </td>
                  <td>
                    {recon.completed_at ? formatDate(recon.completed_at) : '-'}
                  </td>
                </tr>
              {/each}
            </tbody>
          </Table>
        {:else}
          <p>No reconciliations yet. Start your first one!</p>
        {/if}
      </Card>
    {:else}
      <Card>
        <p>Please select a bank account to view reconciliations.</p>
      </Card>
    {/if}
  {:else if view === 'create'}
    <Card>
      <h2>New Reconciliation</h2>
      <div class="form-grid">
        <Input
          label="Statement Date"
          type="date"
          bind:value={statementDate}
        />
        <Input
          label="Statement Balance"
          type="number"
          step="0.01"
          bind:value={statementBalance}
        />
        <div class="info-item">
          <span class="label">Book Balance (as of {formatDate(statementDate)}):</span>
          <span class="value">{formatCurrency(bookBalance)}</span>
        </div>
      </div>

      <h3>Transactions to Reconcile</h3>
      <p class="help-text">
        Check the transactions that appear on your bank statement.
      </p>
      
      {#if unreconciledTransactions.length > 0}
        <div class="transactions-list">
          <table>
            <thead>
              <tr>
                <th>Cleared</th>
                <th>Date</th>
                <th>Description</th>
                <th>Reference</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Balance</th>
              </tr>
            </thead>
            <tbody>
              {#each unreconciledTransactions as txn}
                <tr class:cleared={clearedTransactionIds.has(txn.journal_line_id)}>
                  <td>
                    <input
                      type="checkbox"
                      checked={clearedTransactionIds.has(txn.journal_line_id)}
                      on:change={() => toggleTransaction(txn)}
                    />
                  </td>
                  <td>{formatDate(txn.entry_date)}</td>
                  <td>{txn.description}</td>
                  <td>{txn.reference || '-'}</td>
                  <td>{txn.debit_amount > 0 ? formatCurrency(txn.debit_amount) : ''}</td>
                  <td>{txn.credit_amount > 0 ? formatCurrency(txn.credit_amount) : ''}</td>
                  <td>{formatCurrency(txn.running_balance)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>

        <div class="reconciliation-summary">
          <div class="summary-row">
            <span class="label">Statement Balance:</span>
            <span class="value">{formatCurrency(statementBalance)}</span>
          </div>
          <div class="summary-row">
            <span class="label">Cleared Balance:</span>
            <span class="value">{formatCurrency(clearedBalance)}</span>
          </div>
          <div class="summary-row difference" class:balanced={isBalanced}>
            <span class="label">Difference:</span>
            <span class="value">{formatCurrency(difference)}</span>
          </div>
          {#if isBalanced}
            <div class="balanced-message">✓ Reconciliation is balanced!</div>
          {:else}
            <div class="unbalanced-message">
              ⚠ Difference of {formatCurrency(Math.abs(difference))}. 
              Review cleared transactions.
            </div>
          {/if}
        </div>
      {:else}
        <p>No unreconciled transactions found for this date range.</p>
      {/if}

      <div class="actions">
        <Button variant="secondary" on:click={handleCancel}>Cancel</Button>
        <Button on:click={saveReconciliation}>Save & Continue</Button>
      </div>
    </Card>
  {:else if view === 'reconcile'}
    <Card>
      <h2>Complete Reconciliation</h2>
      
      {#if reconDifference}
        <div class="final-summary">
          <div class="summary-row">
            <span class="label">Statement Balance:</span>
            <span class="value">{formatCurrency(reconDifference.statementBalance)}</span>
          </div>
          <div class="summary-row">
            <span class="label">Cleared Balance:</span>
            <span class="value">{formatCurrency(reconDifference.clearedBalance)}</span>
          </div>
          <div class="summary-row difference" class:balanced={reconDifference.isBalanced}>
            <span class="label">Difference:</span>
            <span class="value">{formatCurrency(reconDifference.difference)}</span>
          </div>
          
          {#if reconDifference.isBalanced}
            <div class="balanced-message">
              ✓ Reconciliation is balanced and ready to complete!
            </div>
          {:else}
            <div class="unbalanced-message">
              ⚠ Warning: Reconciliation has a difference of {formatCurrency(Math.abs(reconDifference.difference))}.
              <br />
              This may indicate missing or incorrect transactions.
            </div>
          {/if}
        </div>
      {/if}

      <div class="actions">
        <Button variant="secondary" on:click={handleCancel}>Cancel</Button>
        <Button 
          on:click={handleComplete}
          disabled={!reconDifference?.isBalanced}
        >
          Complete Reconciliation
        </Button>
      </div>
    </Card>
  {/if}
</div>

<style>
  .reconciliation-view {
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .header h1 {
    margin: 0;
  }

  .account-selector {
    min-width: 300px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin: 1rem 0;
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .summary-item .label {
    font-weight: 500;
    color: #666;
  }

  .summary-item .value {
    font-size: 1.25rem;
    font-weight: 600;
  }

  .form-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin: 1rem 0;
  }

  .info-item {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background: #f5f5f5;
    border-radius: 4px;
  }

  .info-item .label {
    font-weight: 500;
    color: #666;
  }

  .info-item .value {
    font-size: 1.25rem;
    font-weight: 600;
  }

  .help-text {
    color: #666;
    font-size: 0.9rem;
    margin: 0.5rem 0;
  }

  .transactions-list {
    max-height: 500px;
    overflow-y: auto;
    border: 1px solid #ddd;
    border-radius: 4px;
    margin: 1rem 0;
  }

  .transactions-list table {
    width: 100%;
    border-collapse: collapse;
  }

  .transactions-list thead {
    position: sticky;
    top: 0;
    background: #f5f5f5;
    z-index: 1;
  }

  .transactions-list th,
  .transactions-list td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #eee;
  }

  .transactions-list th {
    font-weight: 600;
    color: #333;
  }

  .transactions-list tr.cleared {
    background: #e8f5e9;
  }

  .transactions-list tr:hover {
    background: #f5f5f5;
  }

  .transactions-list tr.cleared:hover {
    background: #d4ecd6;
  }

  .reconciliation-summary,
  .final-summary {
    background: #f5f5f5;
    padding: 1.5rem;
    border-radius: 4px;
    margin: 1rem 0;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    font-size: 1rem;
  }

  .summary-row.difference {
    border-top: 2px solid #333;
    margin-top: 0.5rem;
    padding-top: 1rem;
    font-weight: 600;
    font-size: 1.1rem;
  }

  .summary-row.difference.balanced {
    color: #2e7d32;
  }

  .balanced-message {
    margin-top: 1rem;
    padding: 0.75rem;
    background: #4caf50;
    color: white;
    border-radius: 4px;
    text-align: center;
    font-weight: 500;
  }

  .unbalanced-message {
    margin-top: 1rem;
    padding: 0.75rem;
    background: #ff9800;
    color: white;
    border-radius: 4px;
    text-align: center;
    font-weight: 500;
  }

  .status-badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
  }

  .status-in_progress {
    background: #2196f3;
    color: white;
  }

  .status-completed {
    background: #4caf50;
    color: white;
  }

  .status-cancelled {
    background: #9e9e9e;
    color: white;
  }

  .actions {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    margin-top: 2rem;
  }
</style>
