<script lang="ts">
  import { onMount } from 'svelte';
  import { getDatabase } from './lib/services/database';
  import { persistenceService } from './lib/services/persistence';
  import { themeStore } from './lib/stores/theme';
  import { toasts } from './lib/stores/toast';
  import { logger } from './lib/utils/logger';
  import { checkForUpdate, downloadAndInstallUpdate, type UpdateMetadata, type DownloadProgress } from './lib/services/updater';
  import type { PolicyMode } from './lib/domain/types';

  // View imports
  import DashboardView from './lib/views/DashboardView.svelte';
  import AccountsView from './lib/views/AccountsView.svelte';
  import ContactsView from './lib/views/ContactsView.svelte';
  import InvoicesView from './lib/views/InvoicesView.svelte';
  import PaymentsView from './lib/views/PaymentsView.svelte';
  import BillsView from './lib/views/BillsView.svelte';
  import ExpensesView from './lib/views/ExpensesView.svelte';
  import ReportsView from './lib/views/ReportsView.svelte';
  import ReconciliationView from './lib/views/ReconciliationView.svelte';
  import BatchOperationsView from './lib/views/BatchOperationsView.svelte';
  import BankImportView from './lib/views/BankImportView.svelte';
  import InventoryView from './lib/views/InventoryView.svelte';
  import PayrollView from './lib/views/PayrollView.svelte';
  import JournalEntryView from './lib/views/JournalEntryView.svelte';
  import CreditNotesView from './lib/views/CreditNotesView.svelte';
  import BudgetView from './lib/views/BudgetView.svelte';

  // Extracted UI components
  import Sidebar from './lib/ui/Sidebar.svelte';
  import SettingsPanel from './lib/ui/SettingsPanel.svelte';
  import BackupPanel from './lib/ui/BackupPanel.svelte';
  import PeriodClosePanel from './lib/ui/PeriodClosePanel.svelte';
  import UpdateModal from './lib/ui/UpdateModal.svelte';
  import ToastContainer from './lib/ui/ToastContainer.svelte';

  let mode: PolicyMode = 'beginner';
  let dbReady = false;
  let error = '';
  let activeView: 'dashboard' | 'accounts' | 'contacts' | 'invoices' | 'payments' | 'bills' | 'expenses' | 'reports' | 'reconciliation' | 'batch' | 'bank-import' | 'inventory' | 'payroll' | 'journal' | 'credit-notes' | 'budget' | 'settings' = 'dashboard';

  // Modal visibility
  let showSettings = false;
  let showBackup = false;
  let showPeriodClose = false;
  let showUpdateModal = false;

  // Update state (needed for startup check and error view)
  let updateAvailable: UpdateMetadata | null = null;
  let downloadProgress: DownloadProgress | null = null;
  let skippedVersion: string | null = null;

  onMount(async () => {
    themeStore.init();

    try {
      await getDatabase();
      mode = await persistenceService.getMode();
      dbReady = true;

      checkForUpdatesOnStartup();
    } catch (e) {
      const errorMessage = String(e);
      error = `Failed to initialize: ${errorMessage}`;

      try {
        logger.info('Initialization error detected, checking for updates...');
        const channel = await persistenceService.getUpdateChannel();
        const update = await checkForUpdate(channel);

        if (update) {
          updateAvailable = update;
          showUpdateModal = true;
          error = `${error}\n\nA new version (v${update.version}) is available that may fix this issue.`;
        }
      } catch (updateError) {
        logger.error('Failed to check for updates:', updateError);
      }

      logger.error(error);
    }
  });

  async function checkForUpdatesOnStartup() {
    try {
      const channel = await persistenceService.getUpdateChannel();
      const update = await checkForUpdate(channel);

      if (update) {
        if (skippedVersion === update.version) {
          logger.debug(`Update ${update.version} was skipped this session`);
          return;
        }

        updateAvailable = update;
        showUpdateModal = true;
        await persistenceService.setLastUpdateCheck(new Date().toISOString());
      }
    } catch (e) {
      logger.error('Update check failed:', e);
    }
  }

  async function handleManualUpdateCheck() {
    try {
      toasts.info('Checking for updates...');
      const channel = await persistenceService.getUpdateChannel();
      const update = await checkForUpdate(channel);

      if (update) {
        updateAvailable = update;
        showUpdateModal = true;
        skippedVersion = null;
        await persistenceService.setLastUpdateCheck(new Date().toISOString());
      } else {
        toasts.success('You are running the latest version!');
      }
    } catch (e) {
      toasts.error(`Update check failed: ${e}`);
    }
  }

  async function handleInstallUpdate() {
    if (!updateAvailable) return;

    try {
      downloadProgress = { downloaded: 0, contentLength: null };

      await downloadAndInstallUpdate((progress) => {
        downloadProgress = progress;
      });

      toasts.success('Update installed! The app will restart now.');
    } catch (e) {
      toasts.error(`Update installation failed: ${e}`);
      downloadProgress = null;
    }
  }

  function handleSkipUpdate() {
    if (updateAvailable) {
      skippedVersion = updateAvailable.version;
      toasts.info(`Skipped version ${updateAvailable.version} for this session`);
    }
    showUpdateModal = false;
    updateAvailable = null;
    downloadProgress = null;
  }

  function handleRemindLater() {
    showUpdateModal = false;
  }

  function handleModeChange(newMode: PolicyMode) {
    mode = newMode;
    toasts.success(`Switched to ${mode === 'pro' ? 'Pro' : 'Beginner'} Mode`);
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
      <div class="error-actions">
        <p>This error may be fixed by updating to the latest version.</p>
        <button onclick={handleManualUpdateCheck}>
          Check for Updates
        </button>
        {#if updateAvailable}
          <button onclick={() => showUpdateModal = true} class="primary">
            Install Update v{updateAvailable.version}
          </button>
        {/if}
      </div>
    </div>
  {:else if !dbReady}
    <div class="loading">
      <h2>Initializing Invariant Accounting...</h2>
      <p>Setting up database and running migrations...</p>
    </div>
  {:else}
    <Sidebar {activeView} {mode} on:navigate={(e) => setView(e.detail)} />

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
        <BankImportView />
      {:else if activeView === 'inventory'}
        <InventoryView {mode} />
      {:else if activeView === 'payroll'}
        <PayrollView {mode} />
      {:else if activeView === 'journal'}
        <JournalEntryView {mode} />
      {:else if activeView === 'credit-notes'}
        <CreditNotesView {mode} />
      {:else if activeView === 'budget'}
        <BudgetView {mode} />
      {:else if activeView === 'settings'}
        <div class="view">
          <h2>Settings</h2>

          <div class="setting-group">
            <h3>Mode</h3>
            <p>
              Current mode: <strong>{mode}</strong>
            </p>
            <button onclick={() => showSettings = true}>
              Open Settings Panel
            </button>
          </div>

          <div class="setting-group">
            <h3>Database Backup</h3>
            <p>
              Back up and restore your accounting data.
            </p>
            <button onclick={() => showBackup = true}>
              Open Backup & Restore
            </button>
          </div>

          {#if mode === 'pro'}
            <div class="setting-group">
              <h3>Fiscal Year Close</h3>
              <p>
                Close fiscal years to transfer net income to Retained Earnings.
              </p>
              <button onclick={() => showPeriodClose = true}>
                Open Fiscal Year Close
              </button>
            </div>
          {/if}
        </div>
      {/if}
    </main>
  {/if}
</div>

<SettingsPanel open={showSettings} {mode} onclose={() => showSettings = false} on:modeChange={(e) => handleModeChange(e.detail)} />
<BackupPanel open={showBackup} {mode} onclose={() => showBackup = false} />
<PeriodClosePanel open={showPeriodClose} {mode} onclose={() => showPeriodClose = false} />

{#if updateAvailable}
  <UpdateModal
    open={showUpdateModal}
    updateInfo={updateAvailable}
    {downloadProgress}
    onInstall={handleInstallUpdate}
    onSkip={handleSkipUpdate}
    onRemindLater={handleRemindLater}
  />
{/if}

<ToastContainer />

<style>
  .app {
    display: flex;
    height: 100vh;
    background: #f5f5f5;
  }

  main {
    flex: 1;
    overflow-y: auto;
    padding: 40px;
    min-height: 0;
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
    transition: background 0.2s;
  }

  .setting-group button:hover {
    background: #2980b9;
  }

  .setting-group p {
    margin: 0 0 16px 0;
    color: #555;
    line-height: 1.5;
    font-size: 14px;
  }

  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    padding: 40px;
    text-align: center;
  }

  .error h2 {
    color: #e74c3c;
    margin-bottom: 16px;
  }

  .error p {
    color: #555;
    max-width: 600px;
    line-height: 1.6;
    margin-bottom: 24px;
    white-space: pre-line;
  }

  .error-actions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .error-actions button {
    background: #3498db;
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .error-actions button:hover {
    background: #2980b9;
  }

  .error-actions button.primary {
    background: #27ae60;
  }

  .error-actions button.primary:hover {
    background: #219a52;
  }

  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
  }

  .loading h2 {
    color: #2c3e50;
    margin-bottom: 12px;
  }

  .loading p {
    color: #7f8c8d;
  }
</style>
