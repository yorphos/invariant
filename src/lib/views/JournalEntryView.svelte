<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import { postingEngine } from '../domain/posting-engine';
  import type { PolicyMode, Account, JournalEntry, JournalLine } from '../domain/types';
  import Button from '../ui/Button.svelte';
  import Card from '../ui/Card.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Table from '../ui/Table.svelte';
  import Modal from '../ui/Modal.svelte';

  export let mode: PolicyMode;

  // View state
  let view: 'list' | 'create' = 'list';
  let loading = true;
  let submitting = false;

  // Data
  let journalEntries: (JournalEntry & { lines?: JournalLine[] })[] = [];
  let accounts: Account[] = [];

  // Form state
  let formDate = new Date().toISOString().split('T')[0];
  let formDescription = '';
  let formReference = '';
  let formLines: {
    account_id: number | '';
    debit_amount: number;
    credit_amount: number;
    description: string;
  }[] = [
    { account_id: '', debit_amount: 0, credit_amount: 0, description: '' },
    { account_id: '', debit_amount: 0, credit_amount: 0, description: '' }
  ];

  // Detail modal
  let showDetailModal = false;
  let selectedEntry: (JournalEntry & { lines?: JournalLine[] }) | null = null;

  // Validation
  let validationErrors: string[] = [];

  // Reactive calculations
  $: totalDebits = formLines.reduce((sum, line) => sum + (line.debit_amount || 0), 0);
  $: totalCredits = formLines.reduce((sum, line) => sum + (line.credit_amount || 0), 0);
  $: isBalanced = Math.abs(totalDebits - totalCredits) <= 0.01;
  $: difference = totalDebits - totalCredits;

  // Account options for dropdown
  $: accountOptions = accounts
    .filter(a => a.is_active)
    .map(a => ({
      value: a.id!,
      label: `${a.code} - ${a.name}`
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      const [entriesResult, accountsResult] = await Promise.all([
        persistenceService.getJournalEntries(),
        persistenceService.getAccounts()
      ]);
      
      // Load lines for each entry
      journalEntries = await Promise.all(
        entriesResult.slice(0, 50).map(async (entry: JournalEntry) => {
          const lines = await persistenceService.getJournalLines(entry.id!);
          return { ...entry, lines };
        })
      );
      
      accounts = accountsResult;
    } catch (e) {
      console.error('Failed to load journal entries:', e);
    }
    loading = false;
  }

  function addLine() {
    formLines = [
      ...formLines,
      { account_id: '', debit_amount: 0, credit_amount: 0, description: '' }
    ];
  }

  function removeLine(index: number) {
    if (formLines.length > 2) {
      formLines = formLines.filter((_, i) => i !== index);
    }
  }

  function handleDebitChange(index: number, value: number) {
    // If debit is entered, clear credit
    if (value > 0) {
      formLines[index].credit_amount = 0;
    }
    formLines[index].debit_amount = value;
    formLines = [...formLines]; // Trigger reactivity
  }

  function handleCreditChange(index: number, value: number) {
    // If credit is entered, clear debit
    if (value > 0) {
      formLines[index].debit_amount = 0;
    }
    formLines[index].credit_amount = value;
    formLines = [...formLines]; // Trigger reactivity
  }

  function validateForm(): boolean {
    validationErrors = [];

    if (!formDate) {
      validationErrors.push('Date is required');
    }

    if (!formDescription.trim()) {
      validationErrors.push('Description is required');
    }

    // Check lines
    const validLines = formLines.filter(
      line => line.account_id && (line.debit_amount > 0 || line.credit_amount > 0)
    );

    if (validLines.length < 2) {
      validationErrors.push('At least two lines with amounts are required');
    }

    // Check for missing accounts
    for (let i = 0; i < formLines.length; i++) {
      const line = formLines[i];
      if ((line.debit_amount > 0 || line.credit_amount > 0) && !line.account_id) {
        validationErrors.push(`Line ${i + 1}: Account is required`);
      }
    }

    // Check balance
    if (!isBalanced) {
      validationErrors.push(`Entry is not balanced. Difference: ${formatCurrency(Math.abs(difference))}`);
    }

    // Use posting engine validation
    const linesToValidate: JournalLine[] = formLines
      .filter(line => line.account_id && (line.debit_amount > 0 || line.credit_amount > 0))
      .map(line => ({
        account_id: line.account_id as number,
        debit_amount: line.debit_amount || 0,
        credit_amount: line.credit_amount || 0,
        description: line.description
      }));

    const balanceWarnings = postingEngine.validateBalance(linesToValidate);
    for (const warning of balanceWarnings) {
      if (warning.level === 'error' && !validationErrors.includes(warning.message)) {
        validationErrors.push(warning.message);
      }
    }

    return validationErrors.length === 0;
  }

  async function handleSubmit() {
    if (!validateForm()) {
      return;
    }

    submitting = true;

    try {
      // Create transaction event for audit trail
      const eventId = await persistenceService.createTransactionEvent({
        event_type: 'manual_journal_entry',
        description: formDescription,
        reference: formReference || undefined,
        created_by: 'user'
      });

      // Prepare journal lines
      const linesToCreate: Omit<JournalLine, 'id' | 'journal_entry_id'>[] = formLines
        .filter(line => line.account_id && (line.debit_amount > 0 || line.credit_amount > 0))
        .map(line => ({
          account_id: line.account_id as number,
          debit_amount: line.debit_amount || 0,
          credit_amount: line.credit_amount || 0,
          description: line.description || formDescription
        }));

      // Create journal entry with lines
      await persistenceService.createJournalEntry(
        {
          event_id: eventId,
          entry_date: formDate,
          description: formDescription,
          reference: formReference || undefined,
          status: 'posted'
        },
        linesToCreate
      );

      // Success - reload and reset
      await loadData();
      resetForm();
      view = 'list';
    } catch (e) {
      console.error('Failed to create journal entry:', e);
      validationErrors = [`Failed to create journal entry: ${e}`];
    }

    submitting = false;
  }

  function resetForm() {
    formDate = new Date().toISOString().split('T')[0];
    formDescription = '';
    formReference = '';
    formLines = [
      { account_id: '', debit_amount: 0, credit_amount: 0, description: '' },
      { account_id: '', debit_amount: 0, credit_amount: 0, description: '' }
    ];
    validationErrors = [];
  }

  function handleCancel() {
    resetForm();
    view = 'list';
  }

  async function viewEntryDetails(entry: JournalEntry & { lines?: JournalLine[] }) {
    selectedEntry = entry;
    showDetailModal = true;
  }

  function closeDetailModal() {
    showDetailModal = false;
    selectedEntry = null;
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
    return account ? `${account.code} - ${account.name}` : `Account #${accountId}`;
  }

  function getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'posted': return 'status-posted';
      case 'draft': return 'status-draft';
      case 'void': return 'status-void';
      default: return '';
    }
  }
</script>

<div class="journal-entry-view">
  {#if mode !== 'pro'}
    <div class="mode-warning">
      <h3>Pro Mode Required</h3>
      <p>Manual journal entries are only available in Pro Mode. This feature is for accountants and advanced users who need to create adjusting entries, corrections, or complex transactions.</p>
      <p>Switch to Pro Mode in Settings to access this feature.</p>
    </div>
  {:else if loading}
    <div class="loading-state">
      <p>Loading journal entries...</p>
    </div>
  {:else if view === 'list'}
    <div class="header">
      <h2>Journal Entries</h2>
      <Button on:click={() => view = 'create'}>+ New Journal Entry</Button>
    </div>

    <Card>
      <p class="help-text">
        Manual journal entries allow you to record adjusting entries, corrections, and complex transactions directly. 
        All entries must balance (debits = credits) and are posted immediately.
      </p>
    </Card>

    {#if journalEntries.length === 0}
      <Card>
        <p class="empty-state">No journal entries found. Create your first manual journal entry to get started.</p>
      </Card>
    {:else}
      <div class="entries-table">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Reference</th>
              <th class="amount">Debit</th>
              <th class="amount">Credit</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each journalEntries as entry}
              {@const totalDebit = entry.lines?.reduce((sum, l) => sum + l.debit_amount, 0) || 0}
              {@const totalCredit = entry.lines?.reduce((sum, l) => sum + l.credit_amount, 0) || 0}
              <tr>
                <td>{formatDate(entry.entry_date)}</td>
                <td>{entry.description}</td>
                <td>{entry.reference || '-'}</td>
                <td class="amount">{formatCurrency(totalDebit)}</td>
                <td class="amount">{formatCurrency(totalCredit)}</td>
                <td>
                  <span class="status-badge {getStatusBadgeClass(entry.status)}">
                    {entry.status.toUpperCase()}
                  </span>
                </td>
                <td>
                  <Button variant="ghost" on:click={() => viewEntryDetails(entry)}>View</Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

  {:else if view === 'create'}
    <div class="header">
      <h2>New Journal Entry</h2>
      <Button variant="ghost" on:click={handleCancel}>Cancel</Button>
    </div>

    {#if validationErrors.length > 0}
      <div class="error-box">
        <strong>Please fix the following errors:</strong>
        <ul>
          {#each validationErrors as error}
            <li>{error}</li>
          {/each}
        </ul>
      </div>
    {/if}

    <form on:submit|preventDefault={handleSubmit}>
      <Card title="Entry Details">
        <div class="form-row">
          <Input 
            type="date" 
            label="Date" 
            bind:value={formDate} 
            required 
          />
          <Input 
            label="Reference" 
            bind:value={formReference} 
            placeholder="Optional reference number"
          />
        </div>
        <Input 
          label="Description" 
          bind:value={formDescription} 
          required 
          placeholder="Describe the purpose of this entry"
        />
      </Card>

      <Card title="Journal Lines">
        <div class="lines-header">
          <span class="col-account">Account</span>
          <span class="col-description">Description</span>
          <span class="col-debit">Debit</span>
          <span class="col-credit">Credit</span>
          <span class="col-actions"></span>
        </div>

        {#each formLines as line, index}
          <div class="line-row">
            <div class="col-account">
              <Select
                bind:value={line.account_id}
                options={accountOptions}
                placeholder="Select account..."
              />
            </div>
            <div class="col-description">
              <input
                type="text"
                bind:value={line.description}
                placeholder="Line description (optional)"
                class="line-input"
              />
            </div>
            <div class="col-debit">
              <input
                type="number"
                step="0.01"
                min="0"
                value={line.debit_amount || ''}
                on:input={(e) => handleDebitChange(index, parseFloat(e.currentTarget.value) || 0)}
                class="line-input amount-input"
                placeholder="0.00"
              />
            </div>
            <div class="col-credit">
              <input
                type="number"
                step="0.01"
                min="0"
                value={line.credit_amount || ''}
                on:input={(e) => handleCreditChange(index, parseFloat(e.currentTarget.value) || 0)}
                class="line-input amount-input"
                placeholder="0.00"
              />
            </div>
            <div class="col-actions">
              {#if formLines.length > 2}
                <button type="button" class="remove-btn" on:click={() => removeLine(index)}>
                  &times;
                </button>
              {/if}
            </div>
          </div>
        {/each}

        <div class="add-line-row">
          <Button type="button" variant="ghost" on:click={addLine}>+ Add Line</Button>
        </div>

        <div class="totals-row" class:balanced={isBalanced} class:unbalanced={!isBalanced}>
          <span class="totals-label">Totals:</span>
          <span class="total-debit">{formatCurrency(totalDebits)}</span>
          <span class="total-credit">{formatCurrency(totalCredits)}</span>
          <span class="balance-indicator">
            {#if isBalanced}
              <span class="balanced-badge">Balanced</span>
            {:else}
              <span class="unbalanced-badge">
                Difference: {formatCurrency(Math.abs(difference))}
              </span>
            {/if}
          </span>
        </div>
      </Card>

      <div class="form-actions">
        <Button type="button" variant="ghost" on:click={handleCancel}>Cancel</Button>
        <Button type="submit" disabled={submitting || !isBalanced}>
          {submitting ? 'Posting...' : 'Post Journal Entry'}
        </Button>
      </div>
    </form>
  {/if}

  <!-- Detail Modal -->
  <Modal 
    open={showDetailModal} 
    title="Journal Entry Details" 
    size="large"
    onClose={closeDetailModal}
  >
    {#if selectedEntry}
      <div class="detail-section">
        <div class="detail-row">
          <span class="detail-label">Date:</span>
          <span class="detail-value">{formatDate(selectedEntry.entry_date)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Description:</span>
          <span class="detail-value">{selectedEntry.description}</span>
        </div>
        {#if selectedEntry.reference}
          <div class="detail-row">
            <span class="detail-label">Reference:</span>
            <span class="detail-value">{selectedEntry.reference}</span>
          </div>
        {/if}
        <div class="detail-row">
          <span class="detail-label">Status:</span>
          <span class="status-badge {getStatusBadgeClass(selectedEntry.status)}">
            {selectedEntry.status.toUpperCase()}
          </span>
        </div>
      </div>

      <h4>Journal Lines</h4>
      <div class="detail-table">
        <table>
          <thead>
            <tr>
              <th>Account</th>
              <th>Description</th>
              <th class="amount">Debit</th>
              <th class="amount">Credit</th>
            </tr>
          </thead>
          <tbody>
            {#each selectedEntry.lines || [] as line}
              <tr>
                <td>{getAccountName(line.account_id)}</td>
                <td>{line.description || '-'}</td>
                <td class="amount">
                  {line.debit_amount > 0 ? formatCurrency(line.debit_amount) : '-'}
                </td>
                <td class="amount">
                  {line.credit_amount > 0 ? formatCurrency(line.credit_amount) : '-'}
                </td>
              </tr>
            {/each}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="2"><strong>Totals</strong></td>
              <td class="amount">
                <strong>
                  {formatCurrency(selectedEntry.lines?.reduce((sum, l) => sum + l.debit_amount, 0) || 0)}
                </strong>
              </td>
              <td class="amount">
                <strong>
                  {formatCurrency(selectedEntry.lines?.reduce((sum, l) => sum + l.credit_amount, 0) || 0)}
                </strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div class="modal-actions">
        <Button on:click={closeDetailModal}>Close</Button>
      </div>
    {/if}
  </Modal>
</div>

<style>
  .journal-entry-view {
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

  .mode-warning {
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 24px;
  }

  .mode-warning h3 {
    margin: 0 0 12px 0;
    color: #856404;
  }

  .mode-warning p {
    margin: 0 0 8px 0;
    color: #856404;
  }

  .loading-state {
    text-align: center;
    padding: 40px;
    color: #7f8c8d;
  }

  .help-text {
    margin: 0;
    color: #666;
    font-size: 14px;
    line-height: 1.6;
  }

  .empty-state {
    text-align: center;
    color: #7f8c8d;
    padding: 20px;
    margin: 0;
  }

  .entries-table {
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    margin-top: 16px;
  }

  .entries-table table {
    width: 100%;
    border-collapse: collapse;
  }

  .entries-table th {
    background: #f8f9fa;
    padding: 12px 16px;
    text-align: left;
    font-weight: 600;
    font-size: 13px;
    color: #2c3e50;
    border-bottom: 2px solid #ecf0f1;
  }

  .entries-table td {
    padding: 12px 16px;
    border-bottom: 1px solid #ecf0f1;
    font-size: 14px;
  }

  .entries-table tr:hover {
    background: #f8f9fa;
  }

  .amount {
    text-align: right;
    font-family: 'Courier New', monospace;
  }

  .status-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .status-posted {
    background: #d4edda;
    color: #155724;
  }

  .status-draft {
    background: #fff3cd;
    color: #856404;
  }

  .status-void {
    background: #f8d7da;
    color: #721c24;
  }

  .error-box {
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 24px;
    color: #721c24;
  }

  .error-box strong {
    display: block;
    margin-bottom: 8px;
  }

  .error-box ul {
    margin: 0;
    padding-left: 20px;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .lines-header {
    display: grid;
    grid-template-columns: 2fr 1.5fr 1fr 1fr 40px;
    gap: 12px;
    padding: 12px 0;
    border-bottom: 2px solid #ecf0f1;
    font-weight: 600;
    font-size: 13px;
    color: #2c3e50;
  }

  .line-row {
    display: grid;
    grid-template-columns: 2fr 1.5fr 1fr 1fr 40px;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid #ecf0f1;
    align-items: start;
  }

  .line-input {
    width: 100%;
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    font-family: inherit;
  }

  .line-input:focus {
    outline: none;
    border-color: #3498db;
  }

  .amount-input {
    text-align: right;
    font-family: 'Courier New', monospace;
  }

  .remove-btn {
    background: none;
    border: none;
    font-size: 20px;
    color: #e74c3c;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
  }

  .remove-btn:hover {
    background: #f8d7da;
  }

  .add-line-row {
    padding: 12px 0;
  }

  .totals-row {
    display: grid;
    grid-template-columns: 2fr 1.5fr 1fr 1fr 40px;
    gap: 12px;
    padding: 16px 0;
    border-top: 2px solid #2c3e50;
    font-weight: 600;
    align-items: center;
  }

  .totals-label {
    grid-column: span 2;
    text-align: right;
    padding-right: 12px;
  }

  .total-debit, .total-credit {
    text-align: right;
    font-family: 'Courier New', monospace;
    padding: 8px 12px;
    background: #f8f9fa;
    border-radius: 4px;
  }

  .totals-row.unbalanced .total-debit,
  .totals-row.unbalanced .total-credit {
    background: #f8d7da;
  }

  .totals-row.balanced .total-debit,
  .totals-row.balanced .total-credit {
    background: #d4edda;
  }

  .balance-indicator {
    grid-column: span 1;
  }

  .balanced-badge {
    background: #27ae60;
    color: white;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
  }

  .unbalanced-badge {
    background: #e74c3c;
    color: white;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid #ecf0f1;
  }

  /* Detail Modal Styles */
  .detail-section {
    background: #f8f9fa;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 24px;
  }

  .detail-row {
    display: flex;
    gap: 12px;
    padding: 8px 0;
  }

  .detail-label {
    font-weight: 600;
    color: #2c3e50;
    min-width: 100px;
  }

  .detail-value {
    color: #555;
  }

  .detail-table {
    background: white;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #ecf0f1;
  }

  .detail-table table {
    width: 100%;
    border-collapse: collapse;
  }

  .detail-table th {
    background: #f8f9fa;
    padding: 12px 16px;
    text-align: left;
    font-weight: 600;
    font-size: 13px;
    color: #2c3e50;
  }

  .detail-table td {
    padding: 12px 16px;
    border-top: 1px solid #ecf0f1;
    font-size: 14px;
  }

  .detail-table tfoot td {
    background: #f8f9fa;
    border-top: 2px solid #2c3e50;
  }

  h4 {
    margin: 0 0 16px 0;
    color: #2c3e50;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid #ecf0f1;
  }

  /* Responsive adjustments */
  @media (max-width: 900px) {
    .form-row {
      grid-template-columns: 1fr;
    }

    .lines-header {
      display: none;
    }

    .line-row {
      grid-template-columns: 1fr;
      gap: 8px;
      padding: 16px 0;
    }

    .totals-row {
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .totals-label {
      grid-column: span 2;
      text-align: left;
    }

    .balance-indicator {
      grid-column: span 2;
    }
  }
</style>
