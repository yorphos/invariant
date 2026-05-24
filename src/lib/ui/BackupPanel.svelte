<script lang="ts">
import Modal from './Modal.svelte';
import { toasts } from '../stores/toast';
import {
  backupDatabase,
  restoreDatabase,
  resetDatabase,
  RESET_CONFIRMATION_TEXT,
  isResetConfirmationValid,
} from '../services/backup';
import type { PolicyMode } from '../domain/types';

interface Props {
  open: boolean;
  mode: PolicyMode;
  onclose?: () => void;
}

let { open, mode, onclose = () => {} }: Props = $props();

// Reset state
let showResetModal = $state(false);
let resetConfirmationInput = $state('');
let resetInProgress = $state(false);

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
      location.reload();
    }
  } catch (e) {
    toasts.error(`Restore failed: ${e}`);
  }
}

function openResetModal() {
  resetConfirmationInput = '';
  showResetModal = true;
}

function closeResetModal() {
  showResetModal = false;
  resetConfirmationInput = '';
}

async function handleDatabaseReset() {
  if (!isResetConfirmationValid(resetConfirmationInput)) {
    toasts.error(`Please type "${RESET_CONFIRMATION_TEXT}" exactly to confirm.`);
    return;
  }

  try {
    resetInProgress = true;
    await resetDatabase(resetConfirmationInput);
    toasts.success('Database reset to factory state. The application will now reload.');
    closeResetModal();
    setTimeout(() => location.reload(), 1500);
  } catch (e) {
    toasts.error(`Reset failed: ${e}`);
  } finally {
    resetInProgress = false;
  }
}
</script>

<Modal {open} title="Backup & Restore" size="medium" {onclose}>
  <div class="backup-content">
    <div class="section">
      <h3>Database Backup</h3>
      <p>
        Back up your accounting data to prevent data loss. Backups are stored as SQLite database files.
      </p>
      <div class="button-group">
        <button class="btn-primary" onclick={handleBackup}>
          Backup Database
        </button>
        <button class="btn-danger" onclick={handleRestore}>
          Restore from Backup
        </button>
      </div>
      <div class="info">
        <p><strong>Backup:</strong> Save a copy of your database to a location of your choice.</p>
        <p><strong>Restore:</strong> Replace your current database with a backup. <em>This will delete all current data!</em></p>
      </div>
    </div>

    {#if mode === 'pro'}
      <div class="section danger-zone">
        <h3>Danger Zone</h3>
        <p>
          <strong>Warning:</strong> The following action is destructive and cannot be undone.
        </p>
        <button onclick={openResetModal} class="btn-danger">
          Reset Database to Factory State
        </button>
        <div class="info danger-info">
          <p>This will <strong>permanently delete ALL data</strong> including:</p>
          <ul>
            <li>All transactions, invoices, and payments</li>
            <li>All contacts (customers and vendors)</li>
            <li>All journal entries and reconciliations</li>
            <li>Custom accounts (reset to default chart)</li>
            <li>System settings and preferences</li>
          </ul>
        </div>
      </div>
    {/if}
  </div>
</Modal>

<!-- Database Reset Confirmation Modal -->
<Modal
  open={showResetModal}
  title="Reset Database to Factory State"
  size="medium"
  onclose={closeResetModal}
>
  <div class="reset-modal-content">
    <div class="reset-warning-header">
      <span class="danger-icon">&#9888;</span>
      <h3>This action cannot be undone!</h3>
    </div>

    <p>You are about to <strong>permanently delete all data</strong> and reset the application to its factory state.</p>

    <div class="reset-impact">
      <h4>What will be deleted:</h4>
      <ul>
        <li>All transactions, invoices, payments, and bills</li>
        <li>All customers, vendors, and contacts</li>
        <li>All journal entries and account balances</li>
        <li>All reconciliations and bank imports</li>
        <li>All payroll records</li>
        <li>All custom accounts and settings</li>
      </ul>
    </div>

    <div class="reset-confirmation-box">
      <p>To confirm, type <code>{RESET_CONFIRMATION_TEXT}</code> in the box below:</p>
      <input
        type="text"
        bind:value={resetConfirmationInput}
        placeholder="Type RESET DATABASE to confirm"
        class="reset-confirmation-input"
        autocomplete="off"
        disabled={resetInProgress}
      />
    </div>

    {#if resetConfirmationInput.length > 0 && !isResetConfirmationValid(resetConfirmationInput)}
      <div class="reset-mismatch-warning">
        Text does not match. Please type <code>{RESET_CONFIRMATION_TEXT}</code> exactly.
      </div>
    {/if}
  </div>

  <div class="reset-modal-actions">
    <button class="btn-secondary" onclick={closeResetModal} disabled={resetInProgress}>
      Cancel
    </button>
    <button
      class="btn-danger"
      onclick={handleDatabaseReset}
      disabled={resetInProgress || !isResetConfirmationValid(resetConfirmationInput)}
    >
      {#if resetInProgress}
        Resetting...
      {:else}
        Reset Database
      {/if}
    </button>
  </div>
</Modal>

<style>
  .backup-content {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  .section {
    padding-bottom: 16px;
  }

  .section h3 {
    margin: 0 0 8px 0;
    color: #2c3e50;
    font-size: 16px;
  }

  .section > p {
    margin: 0 0 16px 0;
    color: #555;
    line-height: 1.5;
    font-size: 14px;
  }

  .button-group {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
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
    transition: background 0.2s;
  }

  .btn-secondary:hover {
    background: #7f8c8d;
  }

  .btn-secondary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-danger {
    background: #e74c3c;
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-danger:hover {
    background: #c0392b;
  }

  .btn-danger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .info {
    background: #f8f9fa;
    padding: 16px;
    border-radius: 6px;
    font-size: 13px;
    line-height: 1.6;
    color: #555;
  }

  .info p {
    margin: 0 0 8px 0;
  }

  .info p:last-child {
    margin-bottom: 0;
  }

  .danger-zone {
    border-top: 2px solid #e74c3c;
    padding-top: 20px;
  }

  .danger-info {
    margin-top: 16px;
    border: 1px solid #f5c6cb;
    background: #fff5f5;
  }

  .danger-info ul {
    margin: 8px 0 0 0;
    padding-left: 20px;
    line-height: 1.8;
  }

  /* Reset modal styles */
  .reset-modal-content {
    padding-bottom: 16px;
  }

  .reset-warning-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
    color: #e74c3c;
  }

  .reset-warning-header h3 {
    margin: 0;
    font-size: 18px;
  }

  .danger-icon {
    font-size: 24px;
  }

  .reset-modal-content > p {
    margin: 0 0 20px 0;
    color: #555;
    line-height: 1.6;
  }

  .reset-impact {
    background: #fff5f5;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 20px;
    border: 1px solid #f5c6cb;
  }

  .reset-impact h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: #721c24;
  }

  .reset-impact ul {
    margin: 0;
    padding-left: 20px;
    line-height: 1.8;
    color: #555;
  }

  .reset-confirmation-box {
    background: #f8f9fa;
    padding: 16px;
    border-radius: 8px;
    margin-bottom: 12px;
  }

  .reset-confirmation-box p {
    margin: 0 0 12px 0;
    font-size: 14px;
    color: #2c3e50;
  }

  .reset-confirmation-box code {
    background: #e9ecef;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 600;
  }

  .reset-confirmation-input {
    width: 100%;
    padding: 10px 12px;
    border: 2px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    box-sizing: border-box;
  }

  .reset-confirmation-input:focus {
    outline: none;
    border-color: #e74c3c;
  }

  .reset-confirmation-input:disabled {
    opacity: 0.5;
  }

  .reset-mismatch-warning {
    padding: 8px 12px;
    background: #fff3cd;
    border: 1px solid #ffc107;
    border-radius: 4px;
    color: #856404;
    font-size: 13px;
    margin-bottom: 12px;
  }

  .reset-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding-top: 16px;
    border-top: 1px solid #ecf0f1;
  }
</style>
