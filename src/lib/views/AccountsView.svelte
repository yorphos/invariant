<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import { seedDefaultAccounts } from '../services/seed';
  import type { Account, PolicyMode, AccountType } from '../domain/types';
  import Button from '../ui/Button.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Card from '../ui/Card.svelte';
  import Modal from '../ui/Modal.svelte';
  import Table from '../ui/Table.svelte';

  export let mode: PolicyMode;

  let accounts: Account[] = [];
  let loading = true;
  let showModal = false;
  let showInitModal = false;
  let editingAccount: Account | null = null;
  let filterType: AccountType | 'all' = 'all';
  let showInactive = false;

  // Form fields
  let formCode = '';
  let formName = '';
  let formType: AccountType = 'asset';
  let formParentId: number | '' = '';
  let formIsActive = true;

  onMount(async () => {
    await loadAccounts();
  });

  async function loadAccounts() {
    loading = true;
    try {
      accounts = await persistenceService.getAccounts(true); // Include inactive accounts
      
      // If no accounts exist, show initialization modal
      if (accounts.length === 0) {
        showInitModal = true;
      }
    } catch (e) {
      console.error('Failed to load accounts:', e);
    }
    loading = false;
  }

  async function handleInitialize() {
    try {
      await seedDefaultAccounts();
      await loadAccounts();
      showInitModal = false;
      alert('Chart of Accounts initialized successfully with default accounts!');
    } catch (e) {
      console.error('Failed to initialize accounts:', e);
      alert('Failed to initialize accounts: ' + e);
    }
  }

  function openCreateModal() {
    if (mode === 'beginner') {
      alert('Creating custom accounts requires Pro Mode. Please switch to Pro Mode in Settings.');
      return;
    }

    editingAccount = null;
    formCode = '';
    formName = '';
    formType = 'asset';
    formParentId = '';
    formIsActive = true;
    showModal = true;
  }

  function openEditModal(account: Account) {
    if (mode === 'beginner') {
      alert('Editing accounts requires Pro Mode. Please switch to Pro Mode in Settings.');
      return;
    }

    editingAccount = account;
    formCode = account.code;
    formName = account.name;
    formType = account.type;
    formParentId = account.parent_id || '';
    formIsActive = account.is_active;
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingAccount = null;
  }

  async function handleSubmit() {
    try {
      const accountData = {
        code: formCode,
        name: formName,
        type: formType,
        parent_id: typeof formParentId === 'number' ? formParentId : null,
        is_active: formIsActive,
      };

      if (editingAccount && editingAccount.id !== undefined) {
        // Update existing account
        await persistenceService.updateAccount(editingAccount.id, accountData);
      } else {
        // Create new account
        await persistenceService.createAccount(accountData);
      }
      
      await loadAccounts();
      closeModal();
    } catch (e) {
      console.error('Failed to save account:', e);
      alert('Failed to save account: ' + e);
    }
  }

  async function toggleAccountStatus(account: Account) {
    if (mode === 'beginner') {
      alert('Managing account status requires Pro Mode.');
      return;
    }

    try {
      await persistenceService.updateAccount(account.id, {
        ...account,
        is_active: !account.is_active
      });
      await loadAccounts();
    } catch (e) {
      console.error('Failed to update account status:', e);
      alert('Failed to update account status: ' + e);
    }
  }

  // Group accounts by type
  $: groupedAccounts = accounts
    .filter(a => filterType === 'all' || a.type === filterType)
    .filter(a => showInactive || a.is_active)
    .reduce((groups, account) => {
      if (!groups[account.type]) {
        groups[account.type] = [];
      }
      groups[account.type].push(account);
      return groups;
    }, {} as Record<AccountType, Account[]>);

  // Get account type display name
  function getTypeDisplay(type: AccountType): string {
    return type.charAt(0).toUpperCase() + type.slice(1) + 's';
  }

  // Get account type color
  function getTypeColor(type: AccountType): string {
    const colors = {
      asset: '#2980b9',
      liability: '#e74c3c',
      equity: '#8e44ad',
      revenue: '#27ae60',
      expense: '#d68910'
    };
    return colors[type];
  }

  // Check if account can be edited/deleted (has no journal entries)
  async function canModifyAccount(account: Account): Promise<boolean> {
    try {
      const result = await persistenceService.hasAccountTransactions(account.id);
      return !result;
    } catch {
      return false;
    }
  }
</script>

<div class="accounts-view">
  <div class="header">
    <h2>Chart of Accounts</h2>
    <div class="header-actions">
      <Button variant="ghost" on:click={() => showInactive = !showInactive}>
        {showInactive ? 'Hide' : 'Show'} Inactive
      </Button>
      <Button on:click={openCreateModal} disabled={mode === 'beginner'}>
        + New Account
      </Button>
    </div>
  </div>

  <!-- Filters -->
  <Card>
    <div class="filters">
      <Select
        label="Filter by Type"
        bind:value={filterType}
        options={[
          { value: 'all', label: 'All Accounts' },
          { value: 'asset', label: 'Assets' },
          { value: 'liability', label: 'Liabilities' },
          { value: 'equity', label: 'Equity' },
          { value: 'revenue', label: 'Revenue' },
          { value: 'expense', label: 'Expenses' }
        ]}
      />
      <div class="filter-summary">
        <strong>{accounts.filter(a => showInactive || a.is_active).length}</strong> accounts
        {#if !showInactive}
          ({accounts.filter(a => !a.is_active).length} inactive hidden)
        {/if}
      </div>
    </div>
  </Card>

  {#if loading}
    <Card>
      <p>Loading chart of accounts...</p>
    </Card>
  {:else if accounts.length === 0}
    <Card>
      <p>No accounts configured yet. Please initialize your chart of accounts.</p>
    </Card>
  {:else}
    <!-- Display accounts grouped by type -->
    {#each Object.entries(groupedAccounts) as [type, accountList]}
      <Card padding={false}>
        <div class="type-header" style="border-left-color: {getTypeColor(type as AccountType)}">
          <h3>{getTypeDisplay(type as AccountType)}</h3>
          <span class="account-count">{accountList.length} accounts</span>
        </div>
        
        <Table headers={['Code', 'Account Name', 'Status', 'Actions']}>
          {#each accountList as account}
            <tr class:inactive={!account.is_active}>
              <td><strong>{account.code}</strong></td>
              <td>{account.name}</td>
              <td>
                {#if account.is_active}
                  <span class="badge active">Active</span>
                {:else}
                  <span class="badge inactive">Inactive</span>
                {/if}
              </td>
              <td>
                <div class="actions">
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    on:click={() => openEditModal(account)}
                    disabled={mode === 'beginner'}
                  >
                    Edit
                  </Button>
                  <Button 
                    size="sm" 
                    variant={account.is_active ? 'ghost' : 'primary'}
                    on:click={() => toggleAccountStatus(account)}
                    disabled={mode === 'beginner'}
                  >
                    {account.is_active ? 'Deactivate' : 'Activate'}
                  </Button>
                </div>
              </td>
            </tr>
          {/each}
        </Table>
      </Card>
    {/each}
  {/if}
</div>

<!-- Initialize Chart of Accounts Modal -->
<Modal open={showInitModal} title="Initialize Chart of Accounts" onClose={() => showInitModal = false} size="medium">
  <div class="init-modal-content">
    <p class="intro">Welcome to Invariant Accounting! Before you can start tracking your finances, you need to set up your Chart of Accounts.</p>
    
    <div class="template-info">
      <h4>Default Template</h4>
      <p>We'll create a standard Chart of Accounts with the following account types:</p>
      <ul>
        <li><strong>Assets</strong> - Cash, bank accounts, receivables, equipment</li>
        <li><strong>Liabilities</strong> - Payables, loans, taxes owed</li>
        <li><strong>Equity</strong> - Owner's equity, retained earnings</li>
        <li><strong>Revenue</strong> - Sales, service income, other revenue</li>
        <li><strong>Expenses</strong> - Operating costs, utilities, professional fees</li>
      </ul>
      <p class="note">This template includes <strong>{50}+ accounts</strong> suitable for most small businesses in Canada.</p>
    </div>

    <div class="modal-actions">
      <Button variant="ghost" on:click={() => showInitModal = false}>
        Maybe Later
      </Button>
      <Button on:click={handleInitialize}>
        Initialize Chart of Accounts
      </Button>
    </div>
  </div>
</Modal>

<!-- Create/Edit Account Modal -->
<Modal open={showModal} title={editingAccount ? "Edit Account" : "New Account"} onClose={closeModal}>
  <form on:submit|preventDefault={handleSubmit}>
    <div class="form-row">
      <Input
        label="Account Code"
        bind:value={formCode}
        required
        placeholder="e.g., 1000"
        disabled={!!editingAccount}
      />

      <Select
        label="Account Type"
        bind:value={formType}
        required
        disabled={!!editingAccount}
        options={[
          { value: 'asset', label: 'Asset' },
          { value: 'liability', label: 'Liability' },
          { value: 'equity', label: 'Equity' },
          { value: 'revenue', label: 'Revenue' },
          { value: 'expense', label: 'Expense' }
        ]}
      />
    </div>

    <Input
      label="Account Name"
      bind:value={formName}
      required
      placeholder="e.g., Checking Account"
    />

    <Select
      label="Parent Account (Optional)"
      bind:value={formParentId}
      options={accounts
        .filter(a => a.type === formType && a.id !== editingAccount?.id)
        .map(a => ({ value: a.id, label: `${a.code} - ${a.name}` }))}
      placeholder="None (top-level account)"
    />

    <div class="checkbox-field">
      <label>
        <input type="checkbox" bind:checked={formIsActive} />
        <span>Account is active</span>
      </label>
    </div>

    {#if editingAccount}
      <div class="warning">
        <strong>Note:</strong> Changing account details may affect existing transactions. Exercise caution when editing accounts that have been used.
      </div>
    {/if}

    <div class="modal-actions">
      <Button variant="ghost" on:click={closeModal}>
        Cancel
      </Button>
      <Button type="submit">
        {editingAccount ? 'Update Account' : 'Create Account'}
      </Button>
    </div>
  </form>
</Modal>

<style>
  .accounts-view {
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

  .header-actions {
    display: flex;
    gap: 12px;
  }

  .filters {
    display: flex;
    align-items: end;
    gap: 24px;
  }

  .filter-summary {
    padding: 10px 0;
    color: #555;
  }

  .type-header {
    padding: 16px 24px;
    background: #f8f9fa;
    border-left: 4px solid;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .type-header h3 {
    margin: 0;
    font-size: 18px;
    color: #2c3e50;
  }

  .account-count {
    font-size: 14px;
    color: #7f8c8d;
  }

  .badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
  }

  .badge.active {
    background: #d5f4e6;
    color: #27ae60;
  }

  .badge.inactive {
    background: #ecf0f1;
    color: #95a5a6;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  tr.inactive {
    opacity: 0.6;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .checkbox-field {
    margin: 16px 0;
  }

  .checkbox-field label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
  }

  .checkbox-field input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .warning {
    padding: 12px;
    background: #fef5e7;
    border-left: 4px solid #f39c12;
    border-radius: 4px;
    margin: 16px 0;
    font-size: 14px;
    color: #555;
  }

  .init-modal-content {
    padding: 8px 0;
  }

  .intro {
    font-size: 16px;
    line-height: 1.6;
    color: #555;
    margin-bottom: 24px;
  }

  .template-info {
    background: #f8f9fa;
    padding: 20px;
    border-radius: 8px;
    margin-bottom: 24px;
  }

  .template-info h4 {
    margin: 0 0 12px 0;
    color: #2c3e50;
  }

  .template-info p {
    margin: 0 0 12px 0;
    color: #555;
    line-height: 1.6;
  }

  .template-info ul {
    margin: 0 0 16px 0;
    padding-left: 24px;
    line-height: 2;
    color: #555;
  }

  .note {
    padding: 12px;
    background: #e8f4f8;
    border-left: 4px solid #3498db;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 500;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 24px;
    padding-top: 24px;
    border-top: 1px solid #ecf0f1;
  }
</style>
