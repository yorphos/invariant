<script lang="ts">
import { createEventDispatcher } from 'svelte';
import Modal from './Modal.svelte';
import { persistenceService } from '../services/persistence';
import { toasts } from '../stores/toast';
import { logger } from '../utils/logger';
import {
  getAllSystemAccounts,
  updateSystemAccount,
  type SystemAccountRole,
} from '../services/system-accounts';
import {
  checkForUpdate,
  downloadAndInstallUpdate,
  type UpdateMetadata,
  type DownloadProgress,
} from '../services/updater';
import type { Account, PolicyMode } from '../domain/types';
import UpdateModal from './UpdateModal.svelte';

interface Props {
  open: boolean;
  mode: PolicyMode;
  onclose?: () => void;
}

let { open, mode, onclose = () => {} }: Props = $props();

const dispatch = createEventDispatcher<{ modeChange: PolicyMode }>();

// Mode switch confirmation state
let showModeConfirmModal = $state(false);
let pendingNewMode: PolicyMode | null = $state(null);

// System accounts state
let systemAccounts: Map<SystemAccountRole, Account> = $state(new Map());
let allAccounts: Account[] = $state([]);
let systemAccountsLoading = $state(false);
let systemAccountsError = $state('');

// Update state
let updateAvailable: UpdateMetadata | null = $state(null);
let showUpdateModal = $state(false);
let downloadProgress: DownloadProgress | null = $state(null);
let skippedVersion: string | null = $state(null);

$effect(() => {
  if (open && systemAccounts.size === 0) {
    loadSystemAccounts();
  }
});

async function loadSystemAccounts() {
  try {
    systemAccountsLoading = true;
    systemAccountsError = '';
    const [sysAccts, accts] = await Promise.all([
      getAllSystemAccounts(),
      persistenceService.getAccounts(),
    ]);
    systemAccounts = sysAccts;
    allAccounts = accts;
  } catch (e) {
    logger.error('Failed to load system accounts:', e);
    toasts.error('Failed to load system accounts');
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
    current_year_earnings: 'Current Year Earnings',
    cash_default: 'Default Cash Account',
    checking_account: 'Checking Account',
    customer_deposits: 'Customer Deposits (Unapplied)',
    salary_expense: 'Salary Expense',
    cpp_payable: 'CPP Payable',
    ei_payable: 'EI Payable',
    tax_withholding_payable: 'Tax Withholding Payable',
    inventory_asset: 'Inventory Asset',
    cogs_expense: 'Cost of Goods Sold',
    fx_gain_loss: 'FX Gain/Loss',
    default_revenue: 'Default Revenue',
    default_expense: 'Default Expense',
  };
  return labels[role] || role;
}

function getExpectedAccountTypes(role: SystemAccountRole): string[] {
  const types: Record<SystemAccountRole, string[]> = {
    accounts_receivable: ['asset'],
    accounts_payable: ['liability'],
    sales_tax_payable: ['liability'],
    retained_earnings: ['equity'],
    current_year_earnings: ['equity'],
    cash_default: ['asset'],
    checking_account: ['asset'],
    customer_deposits: ['liability'],
    salary_expense: ['expense'],
    cpp_payable: ['liability'],
    ei_payable: ['liability'],
    tax_withholding_payable: ['liability'],
    inventory_asset: ['asset'],
    cogs_expense: ['expense'],
    fx_gain_loss: ['revenue', 'expense'],
    default_revenue: ['revenue'],
    default_expense: ['expense'],
  };
  return types[role] || [];
}

function getAccountsForRole(role: SystemAccountRole): Account[] {
  const types = getExpectedAccountTypes(role);
  return allAccounts.filter((a) => a.is_active && types.includes(a.type));
}

// Mode switching
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
  dispatch('modeChange', mode);
}

function cancelModeSwitch() {
  showModeConfirmModal = false;
  pendingNewMode = null;
}

// Update functions
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

async function handleUpdateChannelChange(newChannel: string) {
  const channel = newChannel as 'stable' | 'beta';
  try {
    await persistenceService.setUpdateChannel(channel);
    toasts.success(`Update channel changed to ${channel}`);
  } catch (e) {
    toasts.error(`Failed to change update channel: ${e}`);
  }
}
</script>

<Modal {open} title="Settings" size="xlarge" {onclose}>
  <div class="settings-content">
    <!-- Mode Section -->
    <div class="setting-section">
      <h3>Mode</h3>
      <p>
        Current mode: <strong>{mode}</strong>
      </p>
      <button class="btn-primary" onclick={requestModeSwitch}>
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

    <!-- Application Updates Section -->
    <div class="setting-section">
      <h3>Application Updates</h3>
      <p>
        Keep your application up-to-date with the latest features and bug fixes.
      </p>

      {#await persistenceService.getCurrentVersion()}
        <p>Current version: Loading...</p>
      {:then version}
        <p>Current version: <strong>v{version || '0.2.0'}</strong></p>
      {:catch}
        <p>Current version: <strong>v0.2.0</strong></p>
      {/await}

      {#await persistenceService.getLastUpdateCheck()}
        <p class="update-check-time">Last checked: Never</p>
      {:then lastCheck}
        {#if lastCheck}
          <p class="update-check-time">Last checked: {new Date(lastCheck).toLocaleString()}</p>
        {:else}
          <p class="update-check-time">Last checked: Never</p>
        {/if}
      {:catch}
        <p class="update-check-time">Last checked: Never</p>
      {/await}

      <div class="button-group">
        <button class="btn-primary" onclick={handleManualUpdateCheck}>
          Check for Updates
        </button>
      </div>

      {#if mode === 'pro'}
        <div class="update-channel-selector">
          <h4>Update Channel</h4>
          <p class="channel-info">Choose which updates to receive:</p>
          {#await persistenceService.getUpdateChannel()}
            <select disabled>
              <option>Loading...</option>
            </select>
          {:then channel}
            <select
              value={channel}
              onchange={(e) => handleUpdateChannelChange((e.target as HTMLSelectElement).value)}
            >
              <option value="stable">Stable (Recommended)</option>
              <option value="beta">Beta (Early access)</option>
            </select>
          {:catch}
            <select disabled>
              <option>Stable (Recommended)</option>
            </select>
          {/await}
          <div class="channel-description">
            <p><strong>Stable:</strong> Tested releases suitable for production use.</p>
            <p><strong>Beta:</strong> Pre-release versions with new features. May contain bugs.</p>
          </div>
        </div>
      {/if}
    </div>

    <!-- System Accounts Section (Pro Mode) -->
    {#if mode === 'pro'}
      <div class="setting-section">
        <h3>System Account Mapping</h3>
        <p>
          Configure which accounts are used for critical accounting functions.
          <strong>Changing these can affect transaction processing.</strong>
        </p>

        {#if systemAccountsError}
          <div class="error-message">{systemAccountsError}</div>
        {/if}

        {#if systemAccountsLoading && systemAccounts.size === 0}
          <p>Loading system accounts...</p>
        {:else}
          <div class="system-accounts-info">
            <p>Below are the accounts currently mapped for key system roles. Select a different account to change the mapping.</p>
          </div>

          {#if systemAccounts.size > 0}
            <div class="system-accounts-list">
              {#each Array.from(systemAccounts.entries()) as [role, currentAccount]}
                <div class="system-account-item">
                  <div class="system-account-label">
                    <strong>{getSystemAccountRoleLabel(role)}</strong>
                    <span class="expected-type">Type: {getExpectedAccountTypes(role).join(', ')}</span>
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
                      {#each getAccountsForRole(role) as account}
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

            <div class="info-box">
              <p><strong>Accounts Receivable:</strong> Used when creating invoices (money owed to you by customers).</p>
              <p><strong>Accounts Payable:</strong> Used when recording bills (money you owe to vendors).</p>
              <p><strong>Sales Tax Payable:</strong> Used to track collected sales taxes that must be remitted.</p>
              <p><strong>Retained Earnings:</strong> Net income is transferred here during year-end close.</p>
              <p><strong>Current Year Earnings:</strong> Running total of current year's net income.</p>
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  </div>
</Modal>

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
        <span class="mode-icon">&#9888;</span>
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
        <span class="mode-icon">&#10003;</span>
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

<!-- Update Modal -->
{#if updateAvailable}
  <UpdateModal
    open={showUpdateModal}
    updateInfo={updateAvailable}
    downloadProgress={downloadProgress}
    onInstall={handleInstallUpdate}
    onSkip={handleSkipUpdate}
    onRemindLater={handleRemindLater}
  />
{/if}

<style>
  .settings-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .setting-section {
    padding-bottom: 16px;
    border-bottom: 1px solid #ecf0f1;
  }

  .setting-section:last-of-type {
    border-bottom: none;
  }

  .setting-section h3 {
    margin: 0 0 8px 0;
    color: #2c3e50;
    font-size: 16px;
  }

  .setting-section > p {
    margin: 0 0 16px 0;
    color: #555;
    line-height: 1.5;
    font-size: 14px;
  }

  .btn-primary {
    background: #3498db;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-primary:hover {
    background: #2980b9;
  }

  .btn-secondary {
    background: #95a5a6;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
  }

  .btn-secondary:hover {
    background: #7f8c8d;
  }

  .mode-info {
    margin-top: 16px;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .mode-info h4 {
    margin: 0 0 8px 0;
    color: #2c3e50;
    font-size: 14px;
  }

  .mode-info ul {
    margin: 0;
    padding-left: 20px;
    line-height: 1.8;
    color: #555;
  }

  .button-group {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }

  .update-check-time {
    font-size: 13px;
    color: #7f8c8d;
    margin-top: -8px !important;
  }

  .update-channel-selector {
    margin-top: 16px;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .update-channel-selector h4 {
    margin: 0 0 4px 0;
    font-size: 14px;
    color: #2c3e50;
  }

  .channel-info {
    font-size: 13px;
    color: #555;
    margin-bottom: 12px !important;
  }

  .update-channel-selector select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    background: white;
    margin-bottom: 12px;
  }

  .update-channel-selector select:focus {
    outline: none;
    border-color: #3498db;
  }

  .channel-description {
    font-size: 12px;
    color: #7f8c8d;
    line-height: 1.6;
  }

  .channel-description p {
    margin: 0 0 4px 0;
  }

  /* System Accounts styles */
  .system-accounts-info {
    margin-bottom: 16px;
  }

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

  .info-box {
    background: #f8f9fa;
    padding: 16px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.6;
    color: #555;
  }

  .info-box p {
    margin: 0 0 8px 0;
  }

  .info-box p:last-child {
    margin-bottom: 0;
  }

  .error-message {
    padding: 12px 16px;
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 6px;
    color: #721c24;
    margin-bottom: 16px;
  }

  /* Mode Confirmation Modal styles */
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

  .mode-warning-box {
    padding: 16px;
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 6px;
    color: #856404;
    font-size: 14px;
    line-height: 1.5;
  }

  .mode-info-box {
    padding: 16px;
    background: #d4edda;
    border: 1px solid #c3e6cb;
    border-radius: 6px;
    color: #155724;
    font-size: 14px;
    line-height: 1.5;
  }

  .mode-confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid #ecf0f1;
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
</style>
