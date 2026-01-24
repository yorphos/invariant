<script lang="ts">
  import { onMount } from 'svelte';
  import { getDatabase } from './lib/services/database';
  import { persistenceService } from './lib/services/persistence';
  import type { PolicyMode } from './lib/domain/types';
  
  import ContactsView from './lib/views/ContactsView.svelte';
  import InvoicesView from './lib/views/InvoicesView.svelte';
  import PaymentsView from './lib/views/PaymentsView.svelte';
  import BillsView from './lib/views/BillsView.svelte';
  import ExpensesView from './lib/views/ExpensesView.svelte';
  import ReportsView from './lib/views/ReportsView.svelte';
  import DashboardView from './lib/views/DashboardView.svelte';
  import AccountsView from './lib/views/AccountsView.svelte';
  import ReconciliationView from './lib/views/ReconciliationView.svelte';
  import BatchOperationsView from './lib/views/BatchOperationsView.svelte';
  import BankImportView from './lib/views/BankImportView.svelte';
  import InventoryView from './lib/views/InventoryView.svelte';
  import PayrollView from './lib/views/PayrollView.svelte';
  import JournalEntryView from './lib/views/JournalEntryView.svelte';
  import ToastContainer from './lib/ui/ToastContainer.svelte';
  import Modal from './lib/ui/Modal.svelte';
  import { toasts } from './lib/stores/toast';
  import { backupDatabase, restoreDatabase } from './lib/services/backup';
  import { 
    getFiscalYears, 
    closeFiscalYear, 
    previewClosingEntries,
    type FiscalYear,
    type ClosingEntry 
  } from './lib/services/period-close';
  import {
    getAllSystemAccounts,
    updateSystemAccount,
    type SystemAccountRole
  } from './lib/services/system-accounts';
  import type { Account } from './lib/domain/types';

  let mode: PolicyMode = 'beginner';
  let dbReady = false;
  let error = '';
  let activeView: 'dashboard' | 'accounts' | 'contacts' | 'invoices' | 'payments' | 'bills' | 'expenses' | 'reports' | 'reconciliation' | 'batch' | 'bank-import' | 'inventory' | 'payroll' | 'journal' | 'settings' = 'dashboard';
  
  // Period close state
  let fiscalYears: FiscalYear[] = [];
  let closingPreview: { entries: ClosingEntry[]; netIncome: number; totalRevenue: number; totalExpenses: number } | null = null;
  let selectedYearToClose: number | null = null;
  let closingInProgress = false;

  // System accounts state
  let systemAccounts: Map<SystemAccountRole, Account> = new Map();
  let allAccounts: Account[] = [];
  let systemAccountsLoading = false;
  let systemAccountsError = '';

  // Mode switch confirmation state
  let showModeConfirmModal = false;
  let pendingNewMode: PolicyMode | null = null;

  onMount(async () => {
    try {
      await getDatabase();
      mode = await persistenceService.getMode();
      dbReady = true;
      await loadFiscalYears();
      await loadSystemAccounts();
    } catch (e) {
      error = `Failed to initialize database: ${e}`;
      console.error(error);
    }
  });

  async function loadFiscalYears() {
    try {
      fiscalYears = await getFiscalYears();
    } catch (e) {
      console.error('Failed to load fiscal years:', e);
    }
  }

  async function loadSystemAccounts() {
    try {
      systemAccountsLoading = true;
      systemAccountsError = '';
      const [sysAccts, accts] = await Promise.all([
        getAllSystemAccounts(),
        persistenceService.getAccounts()
      ]);
      systemAccounts = sysAccts;
      allAccounts = accts;
    } catch (e) {
      console.error('Failed to load system accounts:', e);
      systemAccountsError = `Failed to load system accounts: ${e}`;
    } finally {
      systemAccountsLoading = false;
    }
  }

  async function handleUpdateSystemAccount(role: SystemAccountRole, newAccountId: number) {
    try {
      systemAccountsLoading = true;
      systemAccountsError = '';
      await updateSystemAccount(role, newAccountId);
      await loadSystemAccounts();
    } catch (e) {
      systemAccountsError = `Failed to update system account: ${e}`;
    } finally {
      systemAccountsLoading = false;
    }
  }

  function getSystemAccountRoleLabel(role: SystemAccountRole): string {
    const labels: Record<SystemAccountRole, string> = {
      accounts_receivable: 'Accounts Receivable (A/R)',
      accounts_payable: 'Accounts Payable (A/P)',
      sales_tax_payable: 'Sales Tax Payable',
      retained_earnings: 'Retained Earnings',
      current_year_earnings: 'Current Year Earnings'
    };
    return labels[role] || role;
  }

  function getExpectedAccountTypes(role: SystemAccountRole): string[] {
    const types: Record<SystemAccountRole, string[]> = {
      accounts_receivable: ['asset'],
      accounts_payable: ['liability'],
      sales_tax_payable: ['liability'],
      retained_earnings: ['equity'],
      current_year_earnings: ['equity']
    };
    return types[role] || [];
  }

  function getAccountsForRole(role: SystemAccountRole): Account[] {
    const types = getExpectedAccountTypes(role);
    return allAccounts.filter(a => a.is_active && types.includes(a.type));
  }

  function requestModeSwitch() {
    pendingNewMode = mode === 'beginner' ? 'pro' : 'beginner';
    showModeConfirmModal = true;
  }

  async function confirmModeSwitch() {
    if (!pendingNewMode) return;
    await persistenceService.setMode(pendingNewMode);
    mode = pendingNewMode;
    showModeConfirmModal = false;
    pendingNewMode = null;
    toasts.success(`Switched to ${mode === 'pro' ? 'Pro' : 'Beginner'} Mode`);
  }

  function cancelModeSwitch() {
    showModeConfirmModal = false;
    pendingNewMode = null;
  }

  async function handleBackup() {
    try {
      const success = await backupDatabase();
      if (success) {
        toasts.success('Database backed up successfully!');
      }
    } catch (e) {
      toasts.error(`Backup failed: ${e}`);
    }
  }

  async function handleRestore() {
    try {
      const success = await restoreDatabase();
      if (success) {
        // App restart required
        location.reload();
      }
    } catch (e) {
      toasts.error(`Restore failed: ${e}`);
    }
  }

  async function handlePreviewClose(year: number) {
    try {
      closingInProgress = true;
      selectedYearToClose = year;
      closingPreview = await previewClosingEntries(year);
    } catch (e) {
      toasts.error(`Failed to preview closing entries: ${e}`);
      closingPreview = null;
      selectedYearToClose = null;
    } finally {
      closingInProgress = false;
    }
  }

  async function handleConfirmClose() {
    if (!selectedYearToClose) return;
    
    const confirmed = confirm(
      `Are you sure you want to close fiscal year ${selectedYearToClose}?\n\n` +
      `This will:\n` +
      `- Zero out all revenue and expense accounts\n` +
      `- Transfer net income to Retained Earnings\n` +
      `- Mark the year as closed\n\n` +
      `This action creates a permanent journal entry.`
    );
    
    if (!confirmed) return;
    
    try {
      closingInProgress = true;
      const result = await closeFiscalYear(selectedYearToClose, { mode });
      
      if (result.ok) {
        toasts.success(`Fiscal year ${selectedYearToClose} closed successfully! Net Income: $${result.net_income?.toFixed(2) || '0.00'}`);
        closingPreview = null;
        selectedYearToClose = null;
        await loadFiscalYears();
      } else {
        const errorMsg = result.warnings.map(w => w.message).join('\n');
        toasts.error(`Failed to close fiscal year:\n${errorMsg}`);
      }
    } catch (e) {
      toasts.error(`Failed to close fiscal year: ${e}`);
    } finally {
      closingInProgress = false;
    }
  }

  function handleCancelClose() {
    closingPreview = null;
    selectedYearToClose = null;
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount);
  }

  function setView(view: typeof activeView) {
    activeView = view;
  }
</script>

<div class="app">
  {#if error}
    <div class="error">
      <h2>Error</h2>
      <p>{error}</p>
    </div>
  {:else if !dbReady}
    <div class="loading">
      <h2>Initializing Invariant Accounting...</h2>
      <p>Setting up database and running migrations...</p>
    </div>
  {:else}
    <aside class="sidebar">
      <h1>Invariant</h1>
      <nav>
        <button 
          class:active={activeView === 'dashboard'}
          onclick={() => setView('dashboard')}
        >
          Dashboard
        </button>
        <button 
          class:active={activeView === 'accounts'}
          onclick={() => setView('accounts')}
        >
          Chart of Accounts
        </button>
        <button 
          class:active={activeView === 'contacts'}
          onclick={() => setView('contacts')}
        >
          Contacts
        </button>
        <button 
          class:active={activeView === 'invoices'}
          onclick={() => setView('invoices')}
        >
          Invoices
        </button>
        <button 
          class:active={activeView === 'payments'}
          onclick={() => setView('payments')}
        >
          Payments
        </button>
        <button 
          class:active={activeView === 'bills'}
          onclick={() => setView('bills')}
        >
          Bills
        </button>
        <button 
          class:active={activeView === 'expenses'}
          onclick={() => setView('expenses')}
        >
          Expenses
        </button>
        <button 
          class:active={activeView === 'reports'}
          onclick={() => setView('reports')}
        >
          Reports
        </button>
        <button 
          class:active={activeView === 'reconciliation'}
          onclick={() => setView('reconciliation')}
        >
          Reconciliation
        </button>
        <button 
          class:active={activeView === 'batch'}
          onclick={() => setView('batch')}
        >
          Batch Operations
        </button>
        <button 
          class:active={activeView === 'bank-import'}
          onclick={() => setView('bank-import')}
        >
          Bank Import
        </button>
        <button 
          class:active={activeView === 'inventory'}
          onclick={() => setView('inventory')}
        >
          Inventory
        </button>
        <button 
          class:active={activeView === 'payroll'}
          onclick={() => setView('payroll')}
        >
          Payroll
        </button>
        <button 
          class:active={activeView === 'journal'}
          onclick={() => setView('journal')}
        >
          Journal Entries
        </button>
        <button 
          class:active={activeView === 'settings'}
          onclick={() => setView('settings')}
        >
          Settings
        </button>
      </nav>
      <div class="mode-indicator">
        <span class="mode-badge" class:pro={mode === 'pro'}>
          {mode.toUpperCase()} MODE
        </span>
      </div>
    </aside>

    <main>
      {#if activeView === 'dashboard'}
        <DashboardView {mode} onNavigate={setView} />
      {:else if activeView === 'accounts'}
        <AccountsView {mode} />
      {:else if activeView === 'contacts'}
        <ContactsView />
      {:else if activeView === 'invoices'}
        <InvoicesView {mode} />
      {:else if activeView === 'payments'}
        <PaymentsView {mode} />
      {:else if activeView === 'bills'}
        <BillsView {mode} />
      {:else if activeView === 'expenses'}
        <ExpensesView {mode} />
      {:else if activeView === 'reports'}
        <ReportsView />
      {:else if activeView === 'reconciliation'}
        <ReconciliationView {mode} />
      {:else if activeView === 'batch'}
        <BatchOperationsView {mode} />
      {:else if activeView === 'bank-import'}
        <BankImportView {mode} />
      {:else if activeView === 'inventory'}
        <InventoryView {mode} />
      {:else if activeView === 'payroll'}
        <PayrollView {mode} />
      {:else if activeView === 'journal'}
        <JournalEntryView {mode} />
      {:else if activeView === 'settings'}
        <div class="view">
          <h2>Settings</h2>
          
          <div class="setting-group">
            <h3>Mode</h3>
            <p>
              Current mode: <strong>{mode}</strong>
            </p>
            <button onclick={requestModeSwitch}>
              Switch to {mode === 'beginner' ? 'Pro' : 'Beginner'} Mode
            </button>
            
            <div class="mode-info">
              {#if mode === 'beginner'}
                <h4>Beginner Mode</h4>
                <ul>
                  <li>Guided workflows for common tasks</li>
                  <li>Prevents editing posted entries directly</li>
                  <li>Suggests correct account usage</li>
                  <li>Recommends proper transaction flows</li>
                </ul>
              {:else}
                <h4>Pro Mode</h4>
                <ul>
                  <li>Full chart of accounts editing</li>
                  <li>Direct journal entry creation</li>
                  <li>Override suggestions and warnings</li>
                  <li>Advanced features unlocked</li>
                </ul>
              {/if}
            </div>
          </div>

          <div class="setting-group">
            <h3>Database Backup</h3>
            <p>
              Back up your accounting data to prevent data loss. Backups are stored as SQLite database files.
            </p>
            <div class="button-group">
              <button onclick={handleBackup}>
                Backup Database
              </button>
              <button onclick={handleRestore} class="danger">
                Restore from Backup
              </button>
            </div>
            <div class="info">
              <p><strong>Backup:</strong> Save a copy of your database to a location of your choice.</p>
              <p><strong>Restore:</strong> Replace your current database with a backup. <em>This will delete all current data!</em></p>
            </div>
          </div>

          {#if mode === 'pro'}
            <div class="setting-group">
              <h3>Fiscal Year Close</h3>
              <p>
                Close fiscal years to transfer net income to Retained Earnings and zero out revenue/expense accounts.
                <strong>This is a critical year-end accounting process.</strong>
              </p>
              
              {#if fiscalYears.length === 0}
                <p class="warning-text">No fiscal years found. Fiscal years are created automatically when needed.</p>
              {:else}
                <div class="fiscal-years-list">
                  {#each fiscalYears as fy}
                    <div class="fiscal-year-item">
                      <div class="fiscal-year-info">
                        <strong>Fiscal Year {fy.year}</strong>
                        <span class="date-range">{fy.start_date} to {fy.end_date}</span>
                        <span class="status-badge" class:closed={fy.status === 'closed'}>
                          {fy.status.toUpperCase()}
                        </span>
                      </div>
                      {#if fy.status === 'open'}
                        <button 
                          onclick={() => handlePreviewClose(fy.year)}
                          disabled={closingInProgress}
                        >
                          {closingInProgress && selectedYearToClose === fy.year ? 'Loading...' : 'Close Year'}
                        </button>
                      {:else}
                        <span class="closed-info">
                          Closed on {new Date(fy.closed_at || '').toLocaleDateString()}
                        </span>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}

              {#if closingPreview && selectedYearToClose}
                <div class="closing-preview">
                  <h4>Closing Entries Preview for {selectedYearToClose}</h4>
                  
                  <div class="closing-summary">
                    <div class="summary-item">
                      <span>Total Revenue:</span>
                      <strong class="positive">{formatCurrency(closingPreview.totalRevenue)}</strong>
                    </div>
                    <div class="summary-item">
                      <span>Total Expenses:</span>
                      <strong>{formatCurrency(closingPreview.totalExpenses)}</strong>
                    </div>
                    <div class="summary-item net-income">
                      <span>Net Income:</span>
                      <strong class:positive={closingPreview.netIncome > 0} class:negative={closingPreview.netIncome < 0}>
                        {formatCurrency(closingPreview.netIncome)}
                      </strong>
                    </div>
                  </div>

                  <div class="closing-entries">
                    <h5>Journal Entries ({closingPreview.entries.length} lines)</h5>
                    <div class="entries-table">
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
                          {#each closingPreview.entries as entry}
                            <tr>
                              <td>{entry.account_code} - {entry.account_name}</td>
                              <td>{entry.description}</td>
                              <td class="amount">{entry.debit_amount > 0 ? formatCurrency(entry.debit_amount) : '-'}</td>
                              <td class="amount">{entry.credit_amount > 0 ? formatCurrency(entry.credit_amount) : '-'}</td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div class="closing-actions">
                    <button onclick={handleCancelClose}>Cancel</button>
                    <button onclick={handleConfirmClose} class="danger" disabled={closingInProgress}>
                      {closingInProgress ? 'Closing...' : 'Confirm Close Year'}
                    </button>
                  </div>

                  <div class="warning-box">
                    <strong>⚠️ Warning:</strong> This action creates permanent journal entries and cannot be easily undone. 
                    Make sure you have a recent backup before proceeding.
                  </div>
                </div>
              {/if}
            </div>

            <div class="setting-group">
              <h3>System Account Mapping</h3>
              <p>
                Configure which accounts are used for system operations like invoicing, bills, and year-end closing.
                <strong>Only change these if you've renumbered your chart of accounts.</strong>
              </p>

              {#if systemAccountsError}
                <div class="error-message">{systemAccountsError}</div>
              {/if}

              {#if systemAccountsLoading}
                <p>Loading system accounts...</p>
              {:else}
                <div class="system-accounts-list">
                  {#each ['accounts_receivable', 'accounts_payable', 'sales_tax_payable', 'retained_earnings', 'current_year_earnings'] as role}
                    {@const currentAccount = systemAccounts.get(role as SystemAccountRole)}
                    {@const availableAccounts = getAccountsForRole(role as SystemAccountRole)}
                    <div class="system-account-item">
                      <div class="system-account-label">
                        <strong>{getSystemAccountRoleLabel(role as SystemAccountRole)}</strong>
                        <span class="expected-type">
                          (expects: {getExpectedAccountTypes(role as SystemAccountRole).join(', ')})
                        </span>
                      </div>
                      <div class="system-account-select">
                        <select 
                          value={currentAccount?.id || ''}
                          onchange={(e) => {
                            const newId = parseInt((e.target as HTMLSelectElement).value);
                            if (newId && newId !== currentAccount?.id) {
                              handleUpdateSystemAccount(role as SystemAccountRole, newId);
                            }
                          }}
                          disabled={systemAccountsLoading}
                        >
                          {#if !currentAccount}
                            <option value="">-- Select Account --</option>
                          {/if}
                          {#each availableAccounts as account}
                            <option value={account.id}>
                              {account.code} - {account.name}
                            </option>
                          {/each}
                        </select>
                        {#if currentAccount}
                          <span class="current-account-badge">
                            Current: {currentAccount.code}
                          </span>
                        {/if}
                      </div>
                    </div>
                  {/each}
                </div>

                <div class="info">
                  <p><strong>Accounts Receivable:</strong> Used when creating invoices (money owed to you by customers).</p>
                  <p><strong>Accounts Payable:</strong> Used when recording bills (money you owe to vendors).</p>
                  <p><strong>Sales Tax Payable:</strong> Used to track collected sales taxes that must be remitted.</p>
                  <p><strong>Retained Earnings:</strong> Net income is transferred here during year-end close.</p>
                  <p><strong>Current Year Earnings:</strong> Running total of current year's net income.</p>
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </main>
  {/if}
</div>

<!-- Mode Switch Confirmation Modal -->
<Modal 
  open={showModeConfirmModal} 
  title="Switch Application Mode" 
  size="medium"
  onclose={cancelModeSwitch}
>
  {#if pendingNewMode === 'pro'}
    <div class="mode-confirm-content">
      <div class="mode-confirm-header pro">
        <span class="mode-icon">⚠</span>
        <h3>Switch to Pro Mode</h3>
      </div>
      
      <p>Pro Mode unlocks advanced accounting features designed for experienced users and accountants.</p>
      
      <div class="mode-features">
        <h4>What you can do in Pro Mode:</h4>
        <ul>
          <li><strong>Create and edit accounts</strong> - Customize your chart of accounts</li>
          <li><strong>Manual journal entries</strong> - Create adjusting entries and corrections</li>
          <li><strong>System account mapping</strong> - Reconfigure which accounts are used for A/R, A/P, etc.</li>
          <li><strong>Fiscal year close</strong> - Execute year-end closing process</li>
          <li><strong>Override warnings</strong> - Bypass guardrails when needed</li>
        </ul>
      </div>
      
      <div class="mode-warning-box">
        <strong>Important:</strong> In Pro Mode, fewer guardrails are in place. Incorrect entries can cause your books to be out of balance. Make sure you understand double-entry bookkeeping before using Pro Mode features.
      </div>
    </div>
  {:else}
    <div class="mode-confirm-content">
      <div class="mode-confirm-header beginner">
        <span class="mode-icon">✓</span>
        <h3>Switch to Beginner Mode</h3>
      </div>
      
      <p>Beginner Mode provides guided workflows with extra validation to prevent accounting errors.</p>
      
      <div class="mode-features">
        <h4>What changes in Beginner Mode:</h4>
        <ul>
          <li><strong>Account editing locked</strong> - Chart of accounts cannot be modified</li>
          <li><strong>Guided workflows</strong> - Step-by-step assistance for transactions</li>
          <li><strong>Extra validation</strong> - More warnings and confirmations</li>
          <li><strong>Simplified interface</strong> - Some advanced features hidden</li>
        </ul>
      </div>
      
      <div class="mode-info-box">
        <strong>Note:</strong> Your existing data and transactions are not affected. You can switch back to Pro Mode at any time.
      </div>
    </div>
  {/if}
  
  <div class="mode-confirm-actions">
    <button class="btn-secondary" onclick={cancelModeSwitch}>Cancel</button>
    <button class="btn-primary" onclick={confirmModeSwitch}>
      Switch to {pendingNewMode === 'pro' ? 'Pro' : 'Beginner'} Mode
    </button>
  </div>
</Modal>

<ToastContainer />

<style>
  .app {
    display: flex;
    height: 100vh;
    background: #f5f5f5;
  }

  .sidebar {
    width: 240px;
    background: #2c3e50;
    color: white;
    display: flex;
    flex-direction: column;
    padding: 20px;
  }

  .sidebar h1 {
    font-size: 24px;
    margin: 0 0 30px 0;
    font-weight: 600;
  }

  nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  nav button {
    background: transparent;
    border: none;
    color: #ecf0f1;
    padding: 12px 16px;
    text-align: left;
    cursor: pointer;
    border-radius: 6px;
    font-size: 14px;
    transition: all 0.2s;
  }

  nav button:hover {
    background: #34495e;
  }

  nav button.active {
    background: #3498db;
    font-weight: 500;
  }

  .mode-indicator {
    padding: 12px 0;
    border-top: 1px solid #34495e;
  }

  .mode-badge {
    display: inline-block;
    padding: 6px 12px;
    background: #27ae60;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
  }

  .mode-badge.pro {
    background: #e74c3c;
  }

  main {
    flex: 1;
    overflow-y: auto;
    padding: 40px;
  }

  .view {
    max-width: 900px;
  }

  .view h2 {
    margin: 0 0 24px 0;
    color: #2c3e50;
    font-size: 28px;
  }

  .setting-group {
    background: white;
    padding: 24px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    margin-bottom: 24px;
  }

  .setting-group h3 {
    margin: 0 0 16px 0;
    color: #2c3e50;
  }

  .setting-group button {
    background: #3498db;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    margin: 16px 0;
  }

  .setting-group button:hover {
    background: #2980b9;
  }

  .button-group {
    display: flex;
    gap: 12px;
    margin: 16px 0;
  }

  .setting-group button.danger {
    background: #e74c3c;
  }

  .setting-group button.danger:hover {
    background: #c0392b;
  }

  .info {
    background: #e8f4f8;
    padding: 16px;
    border-radius: 6px;
    border-left: 4px solid #3498db;
    margin-top: 16px;
    color: #2c3e50;
  }

  .info p {
    margin: 8px 0;
    font-size: 14px;
    line-height: 1.6;
  }

  .info p:first-child {
    margin-top: 0;
  }

  .info p:last-child {
    margin-bottom: 0;
  }

  .mode-info {
    margin-top: 20px;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .mode-info h4 {
    margin: 0 0 12px 0;
    color: #2c3e50;
  }

  .mode-info ul {
    margin: 0;
    padding-left: 20px;
    line-height: 1.8;
    color: #555;
  }

  .loading, .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    text-align: center;
    padding: 40px;
  }

  .error {
    color: #e74c3c;
  }

  .loading h2, .error h2 {
    margin: 0 0 12px 0;
    font-size: 24px;
  }

  .loading p, .error p {
    margin: 0;
    color: #7f8c8d;
    max-width: 500px;
  }

  .fiscal-years-list {
    margin-top: 20px;
  }

  .fiscal-year-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 6px;
    margin-bottom: 12px;
    border: 1px solid #e9ecef;
  }

  .fiscal-year-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .date-range {
    font-size: 13px;
    color: #666;
  }

  .status-badge {
    display: inline-block;
    padding: 4px 10px;
    background: #27ae60;
    color: white;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    align-self: flex-start;
  }

  .status-badge.closed {
    background: #95a5a6;
  }

  .closed-info {
    font-size: 13px;
    color: #666;
  }

  .warning-text {
    color: #e67e22;
    font-style: italic;
    margin: 16px 0;
  }

  .closing-preview {
    margin-top: 24px;
    padding: 24px;
    background: #fff3cd;
    border: 2px solid #ffc107;
    border-radius: 8px;
  }

  .closing-preview h4 {
    margin: 0 0 20px 0;
    color: #2c3e50;
  }

  .closing-preview h5 {
    margin: 0 0 12px 0;
    color: #2c3e50;
    font-size: 14px;
  }

  .closing-summary {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
    padding: 16px;
    background: white;
    border-radius: 6px;
  }

  .summary-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 15px;
  }

  .summary-item.net-income {
    padding-top: 12px;
    border-top: 2px solid #2c3e50;
    font-size: 16px;
  }

  .summary-item strong.positive {
    color: #27ae60;
  }

  .summary-item strong.negative {
    color: #e74c3c;
  }

  .closing-entries {
    margin-bottom: 20px;
  }

  .entries-table {
    background: white;
    border-radius: 6px;
    overflow: hidden;
  }

  .entries-table table {
    width: 100%;
    border-collapse: collapse;
  }

  .entries-table th {
    background: #ecf0f1;
    padding: 12px;
    text-align: left;
    font-weight: 600;
    font-size: 13px;
    color: #2c3e50;
    border-bottom: 2px solid #bdc3c7;
  }

  .entries-table td {
    padding: 12px;
    border-bottom: 1px solid #ecf0f1;
    font-size: 13px;
  }

  .entries-table .amount {
    text-align: right;
    font-family: 'Courier New', monospace;
  }

  .closing-actions {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }

  .closing-actions button {
    flex: 1;
  }

  .warning-box {
    padding: 16px;
    background: #fff;
    border: 2px solid #e74c3c;
    border-radius: 6px;
    color: #2c3e50;
    font-size: 14px;
    line-height: 1.6;
  }

  .warning-box strong {
    color: #e74c3c;
  }

  /* System Account Mapping styles */
  .system-accounts-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin: 20px 0;
  }

  .system-account-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #e9ecef;
    gap: 16px;
  }

  .system-account-label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 200px;
  }

  .system-account-label strong {
    font-size: 14px;
    color: #2c3e50;
  }

  .expected-type {
    font-size: 12px;
    color: #7f8c8d;
  }

  .system-account-select {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
  }

  .system-account-select select {
    flex: 1;
    padding: 10px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    background: white;
    min-width: 250px;
  }

  .system-account-select select:focus {
    outline: none;
    border-color: #3498db;
  }

  .current-account-badge {
    font-size: 12px;
    color: #27ae60;
    font-weight: 500;
    white-space: nowrap;
  }

  .error-message {
    padding: 12px 16px;
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 6px;
    color: #721c24;
    margin-bottom: 16px;
  }

  @media (max-width: 768px) {
    .system-account-item {
      flex-direction: column;
      align-items: stretch;
    }

    .system-account-select {
      flex-direction: column;
      align-items: stretch;
    }

    .system-account-select select {
      min-width: unset;
    }
  }

  /* Mode Switch Confirmation Modal styles */
  .mode-confirm-content {
    padding: 0;
  }

  .mode-confirm-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .mode-confirm-header.pro {
    color: #e74c3c;
  }

  .mode-confirm-header.beginner {
    color: #27ae60;
  }

  .mode-confirm-header h3 {
    margin: 0;
    font-size: 18px;
  }

  .mode-icon {
    font-size: 24px;
  }

  .mode-confirm-content > p {
    margin: 0 0 20px 0;
    color: #555;
    line-height: 1.6;
  }

  .mode-features {
    background: #f8f9fa;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 20px;
  }

  .mode-features h4 {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: #2c3e50;
  }

  .mode-features ul {
    margin: 0;
    padding-left: 20px;
    line-height: 1.8;
    color: #555;
  }

  .mode-features li strong {
    color: #2c3e50;
  }

  .mode-warning-box {
    padding: 16px;
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 8px;
    color: #856404;
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 24px;
  }

  .mode-info-box {
    padding: 16px;
    background: #d1ecf1;
    border: 1px solid #bee5eb;
    border-radius: 8px;
    color: #0c5460;
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 24px;
  }

  .mode-confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid #ecf0f1;
  }

  .btn-secondary {
    background: #ecf0f1;
    color: #2c3e50;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: #bdc3c7;
  }

  .btn-primary {
    background: #3498db;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
  }

  .btn-primary:hover {
    background: #2980b9;
  }
</style>
