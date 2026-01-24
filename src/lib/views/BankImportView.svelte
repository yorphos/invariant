<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import { 
    importCSVBankStatement, 
    getAccountImports, 
    getImportTransactions,
    getCategorizationRules,
    createCategorizationRule,
    updateCategorizationRule,
    deleteCategorizationRule,
    type BankStatementImport,
    type BankStatementTransaction,
    type CategorizationRule
  } from '../services/bank-import';
  import type { Account, PolicyMode, BankTransactionType } from '../domain/types';
  import Button from '../ui/Button.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Card from '../ui/Card.svelte';
  import Table from '../ui/Table.svelte';
  import Modal from '../ui/Modal.svelte';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export let mode: PolicyMode;

  type ViewState = 'list' | 'import' | 'transactions' | 'rules';

  let currentView: ViewState = 'list';
  let loading = false;
  let accounts: Account[] = [];
  let bankAccounts: Account[] = [];
  let imports: BankStatementImport[] = [];
  let selectedImport: BankStatementImport | null = null;
  let importTransactions: BankStatementTransaction[] = [];
  let categorizationRules: CategorizationRule[] = [];

  // Import form state
  let selectedAccountId = 0;
  let csvFileText = '';
  let importFileName = '';
  let importing = false;
  let importResult: { importId: number; transactionCount: number; autoMatchedCount: number } | null = null;

  // Rule form state
  let showRuleModal = false;
  let editingRule: CategorizationRule | null = null;
  let ruleForm = {
    rule_name: '',
    priority: 0,
    is_active: true,
    description_pattern: '',
    payee_pattern: '',
    amount_min: undefined as number | undefined,
    amount_max: undefined as number | undefined,
    transaction_type: undefined as BankTransactionType | undefined,
    assign_account_id: undefined as number | undefined,
    assign_contact_id: undefined as number | undefined,
    assign_category: '',
    notes_template: ''
  };

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      accounts = await persistenceService.getAccounts();
      bankAccounts = accounts.filter(a => a.type === 'asset' && a.is_active);
      
      if (bankAccounts.length > 0 && selectedAccountId === 0) {
        selectedAccountId = bankAccounts[0].id!;
        await loadImports();
      }
      
      categorizationRules = await getCategorizationRules();
    } catch (e) {
      console.error('Failed to load data:', e);
      alert('Failed to load data: ' + e);
    }
    loading = false;
  }

  async function loadImports() {
    if (selectedAccountId === 0) return;
    
    loading = true;
    try {
      imports = await getAccountImports(selectedAccountId);
    } catch (e) {
      console.error('Failed to load imports:', e);
      alert('Failed to load imports: ' + e);
    }
    loading = false;
  }

  function handleFileSelect(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;
    
    importFileName = file.name;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      csvFileText = e.target?.result as string;
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (selectedAccountId === 0) {
      alert('Please select a bank account');
      return;
    }
    
    if (!csvFileText) {
      alert('Please select a CSV file');
      return;
    }
    
    importing = true;
    try {
      const result = await importCSVBankStatement(
        selectedAccountId,
        importFileName,
        csvFileText,
        'user' // TODO: Get from auth context
      );
      
      importResult = result;
      await loadImports();
      
      alert(`Import successful!\n${result.transactionCount} transactions imported.\n${result.autoMatchedCount} auto-matched.`);
      
      // Reset form
      csvFileText = '';
      importFileName = '';
      currentView = 'list';
    } catch (e) {
      console.error('Import failed:', e);
      alert('Import failed: ' + e);
    }
    importing = false;
  }

  async function viewImportTransactions(importRecord: BankStatementImport) {
    selectedImport = importRecord;
    loading = true;
    try {
      importTransactions = await getImportTransactions(importRecord.id!);
      currentView = 'transactions';
    } catch (e) {
      console.error('Failed to load transactions:', e);
      alert('Failed to load transactions: ' + e);
    }
    loading = false;
  }

  function openRuleModal(rule?: CategorizationRule) {
    if (rule) {
      editingRule = rule;
      ruleForm = {
        rule_name: rule.rule_name,
        priority: rule.priority,
        is_active: rule.is_active,
        description_pattern: rule.description_pattern || '',
        payee_pattern: rule.payee_pattern || '',
        amount_min: rule.amount_min,
        amount_max: rule.amount_max,
        transaction_type: rule.transaction_type,
        assign_account_id: rule.assign_account_id,
        assign_contact_id: rule.assign_contact_id,
        assign_category: rule.assign_category || '',
        notes_template: rule.notes_template || ''
      };
    } else {
      editingRule = null;
      ruleForm = {
        rule_name: '',
        priority: 0,
        is_active: true,
        description_pattern: '',
        payee_pattern: '',
        amount_min: undefined,
        amount_max: undefined,
        transaction_type: undefined,
        assign_account_id: undefined,
        assign_contact_id: undefined,
        assign_category: '',
        notes_template: ''
      };
    }
    showRuleModal = true;
  }

  async function saveRule() {
    if (!ruleForm.rule_name) {
      alert('Please provide a rule name');
      return;
    }
    
    loading = true;
    try {
      if (editingRule) {
        await updateCategorizationRule(editingRule.id!, ruleForm);
      } else {
        await createCategorizationRule(ruleForm as Omit<CategorizationRule, 'id' | 'created_at' | 'updated_at' | 'times_applied'>);
      }
      
      categorizationRules = await getCategorizationRules();
      showRuleModal = false;
    } catch (e) {
      console.error('Failed to save rule:', e);
      alert('Failed to save rule: ' + e);
    }
    loading = false;
  }

  async function deleteRule(ruleId: number) {
    if (!confirm('Are you sure you want to delete this rule?')) return;
    
    loading = true;
    try {
      await deleteCategorizationRule(ruleId);
      categorizationRules = await getCategorizationRules();
    } catch (e) {
      console.error('Failed to delete rule:', e);
      alert('Failed to delete rule: ' + e);
    }
    loading = false;
  }

  function formatAmount(amount: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString();
  }

  function getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'completed': return 'badge badge-success';
      case 'failed': return 'badge badge-danger';
      case 'processing': return 'badge badge-warning';
      default: return 'badge badge-secondary';
    }
  }

  function getMatchStatusBadgeClass(status: string): string {
    switch (status) {
      case 'auto_matched': return 'badge badge-success';
      case 'manual_matched': return 'badge badge-primary';
      case 'imported': return 'badge badge-info';
      case 'ignored': return 'badge badge-secondary';
      default: return 'badge badge-warning';
    }
  }

  function handleAccountChange(e: Event) {
    selectedAccountId = parseInt((e.target as HTMLSelectElement).value);
    loadImports();
  }

  function handleTransactionTypeChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    ruleForm.transaction_type = value ? value as BankTransactionType : undefined;
  }

  function handleAssignAccountChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    ruleForm.assign_account_id = value ? parseInt(value) : undefined;
  }
</script>

<div class="bank-import-view">
  <div class="header">
    <h1>Bank Import</h1>
    <div class="actions">
      <Button on:click={() => currentView = 'list'} variant={currentView === 'list' ? 'primary' : 'secondary'}>
        Imports
      </Button>
      <Button on:click={() => currentView = 'import'} variant={currentView === 'import' ? 'primary' : 'secondary'}>
        New Import
      </Button>
      <Button on:click={() => currentView = 'rules'} variant={currentView === 'rules' ? 'primary' : 'secondary'}>
        Rules
      </Button>
    </div>
  </div>

  {#if currentView === 'list'}
    <Card>
      <div class="filter-bar">
        <Select
          label="Bank Account"
          bind:value={selectedAccountId}
          options={[
            { value: 0, label: 'Select Account' },
            ...bankAccounts.map(a => ({ value: a.id!, label: `${a.name} (${a.code})` }))
          ]}
          on:change={handleAccountChange}
        />
      </div>

      {#if loading}
        <p>Loading imports...</p>
      {:else if imports.length === 0}
        <p class="empty-state">No imports found. Click "New Import" to get started.</p>
      {:else}
        <Table headers={['Date', 'File', 'Transactions', 'Matched', 'Status', 'Actions']}>
          {#each imports as imp}
            <tr>
              <td>{formatDate(imp.import_date || '')}</td>
              <td>{imp.file_name}</td>
              <td>{imp.imported_transactions} / {imp.total_transactions}</td>
              <td>{imp.matched_transactions}</td>
              <td><span class={getStatusBadgeClass(imp.status)}>{imp.status}</span></td>
              <td>
                <Button size="sm" on:click={() => viewImportTransactions(imp)}>View</Button>
              </td>
            </tr>
          {/each}
        </Table>
      {/if}
    </Card>
  {/if}

  {#if currentView === 'import'}
    <Card title="Import Bank Statement">
      <div class="import-form">
        <Select
          label="Bank Account*"
          bind:value={selectedAccountId}
          options={[
            { value: 0, label: 'Select Account' },
            ...bankAccounts.map(a => ({ value: a.id!, label: `${a.name} (${a.code})` }))
          ]}
        />

        <div class="file-upload">
          <label for="csv-file">CSV File*</label>
          <input
            id="csv-file"
            type="file"
            accept=".csv"
            on:change={handleFileSelect}
          />
          {#if importFileName}
            <p class="file-name">Selected: {importFileName}</p>
          {/if}
        </div>

        <div class="help-text">
          <p><strong>CSV Format Requirements:</strong></p>
          <ul>
            <li>Must have columns: Date, Description, Amount</li>
            <li>Optional columns: Balance, Reference, Check Number, Payee, Type</li>
            <li>First row should contain column headers</li>
            <li>Negative amounts are debits, positive are credits</li>
          </ul>
        </div>

        <div class="button-group">
          <Button
            on:click={handleImport}
            disabled={importing || selectedAccountId === 0 || !csvFileText}
          >
            {importing ? 'Importing...' : 'Import'}
          </Button>
          <Button variant="secondary" on:click={() => currentView = 'list'}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  {/if}

  {#if currentView === 'transactions' && selectedImport}
    <Card title="Import Transactions - {selectedImport.file_name}">
      <div class="import-stats">
        <div class="stat">
          <span class="label">Total:</span>
          <span class="value">{selectedImport.total_transactions}</span>
        </div>
        <div class="stat">
          <span class="label">Matched:</span>
          <span class="value">{selectedImport.matched_transactions}</span>
        </div>
        <div class="stat">
          <span class="label">Date Range:</span>
          <span class="value">
            {selectedImport.statement_start_date ? formatDate(selectedImport.statement_start_date) : 'N/A'} - 
            {selectedImport.statement_end_date ? formatDate(selectedImport.statement_end_date) : 'N/A'}
          </span>
        </div>
      </div>

      {#if loading}
        <p>Loading transactions...</p>
      {:else if importTransactions.length === 0}
        <p class="empty-state">No transactions found.</p>
      {:else}
        <Table headers={['Date', 'Description', 'Amount', 'Payee', 'Status', 'Suggested Account']}>
          {#each importTransactions as txn}
            <tr>
              <td>{formatDate(txn.transaction_date)}</td>
              <td>{txn.description}</td>
              <td>{formatAmount(txn.amount)}</td>
              <td>{txn.payee || '-'}</td>
              <td><span class={getMatchStatusBadgeClass(txn.match_status)}>{txn.match_status}</span></td>
              <td>
                {txn.suggested_account_id 
                  ? accounts.find(a => a.id === txn.suggested_account_id)?.name || '-'
                  : '-'}
              </td>
            </tr>
          {/each}
        </Table>
      {/if}

      <div class="button-group">
        <Button on:click={() => currentView = 'list'}>
          Back to Imports
        </Button>
      </div>
    </Card>
  {/if}

  {#if currentView === 'rules'}
    <Card title="Auto-Categorization Rules">
      <div class="button-group">
        <Button on:click={() => openRuleModal()}>
          Add New Rule
        </Button>
      </div>

      {#if loading}
        <p>Loading rules...</p>
      {:else if categorizationRules.length === 0}
        <p class="empty-state">No rules defined. Click "Add New Rule" to create one.</p>
      {:else}
        <Table headers={['Name', 'Priority', 'Active', 'Pattern', 'Applied', 'Actions']}>
          {#each categorizationRules as rule}
            <tr>
              <td>{rule.rule_name}</td>
              <td>{rule.priority}</td>
              <td>{rule.is_active ? '✓' : '✗'}</td>
              <td>{rule.description_pattern || rule.payee_pattern || '-'}</td>
              <td>{rule.times_applied}</td>
              <td class="action-buttons">
                <Button size="sm" on:click={() => openRuleModal(rule)}>Edit</Button>
                <Button size="sm" variant="danger" on:click={() => deleteRule(rule.id!)}>Delete</Button>
              </td>
            </tr>
          {/each}
        </Table>
      {/if}
    </Card>
  {/if}
</div>

{#if showRuleModal}
  <Modal
    open={showRuleModal}
    title={editingRule ? 'Edit Rule' : 'New Rule'}
    onClose={() => showRuleModal = false}
    size="large"
  >
    <div class="rule-form">
      <Input
        label="Rule Name*"
        bind:value={ruleForm.rule_name}
      />

      <Input
        type="number"
        label="Priority"
        bind:value={ruleForm.priority}
      />

      <div class="checkbox-field">
        <input
          type="checkbox"
          id="is-active"
          bind:checked={ruleForm.is_active}
        />
        <label for="is-active">Active</label>
      </div>

      <h3>Matching Conditions</h3>

      <Input
        label="Description Pattern (regex)"
        bind:value={ruleForm.description_pattern}
        placeholder="e.g., (?i)amazon|aws"
      />

      <Input
        label="Payee Pattern (regex)"
        bind:value={ruleForm.payee_pattern}
        placeholder="e.g., (?i)starbucks"
      />

      <div class="amount-range">
        <Input
          type="number"
          label="Min Amount"
          bind:value={ruleForm.amount_min}
        />
        <Input
          type="number"
          label="Max Amount"
          bind:value={ruleForm.amount_max}
        />
      </div>

      <Select
        label="Transaction Type"
        value={ruleForm.transaction_type || ''}
        options={[
          { value: '', label: 'Any' },
          { value: 'debit', label: 'Debit' },
          { value: 'credit', label: 'Credit' },
          { value: 'check', label: 'Check' },
          { value: 'deposit', label: 'Deposit' },
          { value: 'fee', label: 'Fee' },
          { value: 'interest', label: 'Interest' },
          { value: 'withdrawal', label: 'Withdrawal' },
          { value: 'transfer', label: 'Transfer' },
          { value: 'other', label: 'Other' }
        ]}
        on:change={handleTransactionTypeChange}
      />

      <h3>Actions</h3>

      <Select
        label="Assign to Account"
        value={ruleForm.assign_account_id || 0}
        options={[
          { value: 0, label: 'None' },
          ...accounts.map(a => ({ value: a.id!, label: `${a.name} (${a.code})` }))
        ]}
        on:change={handleAssignAccountChange}
      />

      <Input
        label="Assign Category"
        bind:value={ruleForm.assign_category}
      />

      <Input
        label="Notes Template"
        bind:value={ruleForm.notes_template}
      />

      <div class="button-group">
        <Button on:click={saveRule} disabled={loading}>
          {loading ? 'Saving...' : 'Save Rule'}
        </Button>
        <Button variant="secondary" on:click={() => showRuleModal = false}>
          Cancel
        </Button>
      </div>
    </div>
  </Modal>
{/if}

<style>
  .bank-import-view {
    padding: 2rem;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .header h1 {
    font-size: 2rem;
    font-weight: 600;
  }

  .actions {
    display: flex;
    gap: 0.5rem;
  }

  .filter-bar {
    margin-bottom: 1rem;
  }

  .empty-state {
    text-align: center;
    padding: 3rem;
    color: #6b7280;
  }

  .import-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .file-upload {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .file-upload label {
    font-weight: 500;
    font-size: 0.875rem;
  }

  .file-upload input[type="file"] {
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
  }

  .file-name {
    font-size: 0.875rem;
    color: #6b7280;
  }

  .help-text {
    background: #f3f4f6;
    padding: 1rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
  }

  .help-text ul {
    margin: 0.5rem 0 0 1.5rem;
  }

  .help-text li {
    margin: 0.25rem 0;
  }

  .button-group {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .import-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 0.375rem;
    margin-bottom: 1.5rem;
  }

  .stat {
    display: flex;
    flex-direction: column;
  }

  .stat .label {
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 500;
  }

  .stat .value {
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
  }

  .rule-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .rule-form h3 {
    font-size: 1.125rem;
    font-weight: 600;
    margin-top: 1rem;
    margin-bottom: -0.5rem;
  }

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .checkbox-field input[type="checkbox"] {
    width: 1.25rem;
    height: 1.25rem;
  }

  .checkbox-field label {
    font-weight: 500;
    font-size: 0.875rem;
  }

  .amount-range {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .action-buttons {
    display: flex;
    gap: 0.25rem;
  }

  /* Badge styles */
  .badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: 0.25rem;
    text-transform: capitalize;
  }

  .badge-success {
    background-color: #d1fae5;
    color: #065f46;
  }

  .badge-danger {
    background-color: #fee2e2;
    color: #991b1b;
  }

  .badge-warning {
    background-color: #fef3c7;
    color: #92400e;
  }

  .badge-primary {
    background-color: #dbeafe;
    color: #1e40af;
  }

  .badge-info {
    background-color: #e0e7ff;
    color: #3730a3;
  }

  .badge-secondary {
    background-color: #e5e7eb;
    color: #374151;
  }
</style>
