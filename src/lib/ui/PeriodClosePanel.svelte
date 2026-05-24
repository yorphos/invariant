<script lang="ts">
import Modal from './Modal.svelte';
import { confirmAction } from '../utils/confirm-action';
import { toasts } from '../stores/toast';
import { logger } from '../utils/logger';
import {
  getFiscalYears,
  closeFiscalYear,
  previewClosingEntries,
  type FiscalYear,
  type ClosingEntry,
} from '../services/period-close';
import type { PolicyMode } from '../domain/types';

interface Props {
  open: boolean;
  mode: PolicyMode;
  onclose?: () => void;
}

let { open, mode, onclose = () => {} }: Props = $props();

let fiscalYears: FiscalYear[] = $state([]);
let closingPreview: {
  entries: ClosingEntry[];
  netIncome: number;
  totalRevenue: number;
  totalExpenses: number;
} | null = $state(null);
let selectedYearToClose: number | null = $state(null);
let closingInProgress = $state(false);

$effect(() => {
  if (open && fiscalYears.length === 0) {
    loadFiscalYears();
  }
});

async function loadFiscalYears() {
  try {
    fiscalYears = await getFiscalYears();
  } catch (e) {
    logger.error('Failed to load fiscal years:', e);
    toasts.error('Failed to load fiscal years');
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

  const confirmed = await confirmAction(
    'Close Fiscal Year',
    `Are you sure you want to close fiscal year ${selectedYearToClose}?\n\n` +
      `This will:\n` +
      `- Zero out all revenue and expense accounts\n` +
      `- Transfer net income to Retained Earnings\n` +
      `- Mark the year as closed\n\n` +
      `This action creates a permanent journal entry.`,
  );

  if (!confirmed) return;

  try {
    closingInProgress = true;
    const result = await closeFiscalYear(selectedYearToClose, { mode });

    if (result.ok) {
      toasts.success(
        `Fiscal year ${selectedYearToClose} closed successfully! Net Income: $${result.net_income?.toFixed(2) || '0.00'}`,
      );
      closingPreview = null;
      selectedYearToClose = null;
      await loadFiscalYears();
    } else {
      const errorMsg = result.warnings.map((w: { message: string }) => w.message).join('\n');
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
    currency: 'CAD',
  }).format(amount);
}
</script>

<Modal {open} title="Fiscal Year Close" size="large" {onclose}>
  <div class="period-close-content">
    {#if mode === 'pro'}
      <div class="section">
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
                    class="btn-secondary"
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
              <button class="btn-secondary" onclick={handleCancelClose}>Cancel</button>
              <button class="btn-primary" onclick={handleConfirmClose} disabled={closingInProgress}>
                {#if closingInProgress}
                  Closing...
                {:else}
                  Confirm & Close Fiscal Year {selectedYearToClose}
                {/if}
              </button>
            </div>

            <div class="warning-box">
              <strong>Warning:</strong> This action creates a permanent journal entry and cannot be reversed. 
              Make sure all transactions for {selectedYearToClose} have been recorded and reviewed before proceeding.
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <div class="mode-locked">
        <p>Fiscal year close is available in <strong>Pro Mode</strong>.</p>
      </div>
    {/if}
  </div>
</Modal>

<style>
  .period-close-content {
    display: flex;
    flex-direction: column;
    gap: 16px;
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

  .warning-text {
    color: #856404;
    background: #fff3cd;
    padding: 12px;
    border-radius: 6px;
    border: 1px solid #ffc107;
  }

  .fiscal-years-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .fiscal-year-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 6px;
    border: 1px solid #e9ecef;
  }

  .fiscal-year-info {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .fiscal-year-info strong {
    font-size: 15px;
    color: #2c3e50;
  }

  .date-range {
    font-size: 13px;
    color: #7f8c8d;
  }

  .status-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: #27ae60;
    color: white;
  }

  .status-badge.closed {
    background: #7f8c8d;
  }

  .btn-primary {
    background: #3498db;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: background 0.2s;
  }

  .btn-primary:hover {
    background: #2980b9;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-secondary {
    background: #95a5a6;
    color: white;
    border: none;
    padding: 8px 16px;
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

  .closed-info {
    font-size: 13px;
    color: #7f8c8d;
  }

  .closing-preview {
    margin-top: 24px;
    padding: 20px;
    background: #f8f9fa;
    border-radius: 8px;
    border: 2px solid #e74c3c;
  }

  .closing-preview h4 {
    margin: 0 0 16px 0;
    color: #2c3e50;
    font-size: 16px;
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

  .closing-entries h5 {
    margin: 0 0 12px 0;
    color: #2c3e50;
    font-size: 14px;
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

  .mode-locked {
    padding: 24px;
    text-align: center;
    color: #7f8c8d;
  }
</style>
