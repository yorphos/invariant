<script lang="ts">
import { onMount } from 'svelte';
import { getDatabase } from '../services/database';
import { persistenceService } from '../services/persistence';
import {
  createBudget,
  getBudget,
  getBudgets,
  updateBudgetLines,
  deleteBudget,
  type BudgetRecord,
  type BudgetWithLines,
  type BudgetLineRecord,
} from '../services/budget';
import type { Account, PolicyMode } from '../domain/types';
import { toasts } from '../stores/toast';
import { logger } from '../utils/logger';
import Button from '../ui/Button.svelte';
import Input from '../ui/Input.svelte';
import Select from '../ui/Select.svelte';
import Card from '../ui/Card.svelte';
import Modal from '../ui/Modal.svelte';

export let mode: PolicyMode;

let budgets: BudgetRecord[] = [];
let accounts: Account[] = [];
let loading = true;
let showCreateModal = false;
let showEditModal = false;
let editingBudget: BudgetWithLines | null = null;

// Filters
let filterFiscalYear: number | '' = '';

// Form fields
let formName = '';
let formFiscalYear: number = new Date().getFullYear();
let formPeriodType: 'monthly' | 'quarterly' | 'yearly' = 'monthly';
let formNotes = '';
let formLines: Array<{
  account_id: number;
  period: number;
  amount: number;
  notes: string;
}> = [];

onMount(async () => {
  await loadData();
});

async function loadData() {
  loading = true;
  try {
    const db = await getDatabase();
    accounts = await db.select<Account[]>(
      "SELECT * FROM account WHERE is_active = 1 AND type IN ('revenue', 'expense') ORDER BY code",
    );
    await loadBudgets();
  } catch (e) {
    logger.error('Failed to load budget data:', e);
    toasts.error('Failed to load budget data');
  }
  loading = false;
}

async function loadBudgets() {
  try {
    budgets = await getBudgets(filterFiscalYear !== '' ? Number(filterFiscalYear) : undefined);
  } catch (e) {
    logger.error('Failed to load budgets:', e);
    toasts.error('Failed to load budgets');
  }
}

$: if (filterFiscalYear !== undefined) {
  loadBudgets();
}

function getPeriodLabel(periodType: string, period: number): string {
  if (periodType === 'monthly') {
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    return months[period - 1] || `M${period}`;
  }
  if (periodType === 'quarterly') {
    return `Q${period}`;
  }
  return 'Annual';
}

function getPeriodCount(periodType: string): number {
  if (periodType === 'monthly') return 12;
  if (periodType === 'quarterly') return 4;
  return 1;
}

function openCreateModal() {
  if (mode === 'beginner') {
    toasts.warning('Budget management requires Pro Mode. Please switch to Pro Mode in Settings.');
    return;
  }

  editingBudget = null;
  formName = '';
  formFiscalYear = new Date().getFullYear();
  formPeriodType = 'monthly';
  formNotes = '';
  formLines = [];
  showCreateModal = true;
}

async function openEditModal(budget: BudgetRecord) {
  if (mode === 'beginner') {
    toasts.warning('Budget management requires Pro Mode. Please switch to Pro Mode in Settings.');
    return;
  }

  try {
    const full = await getBudget(budget.id);
    if (!full) {
      toasts.error('Budget not found');
      return;
    }

    editingBudget = full;
    formName = full.name;
    formFiscalYear = full.fiscal_year;
    formPeriodType = full.period_type;
    formNotes = full.notes || '';
    formLines = full.lines.map((l) => ({
      account_id: l.account_id,
      period: l.period,
      amount: l.amount,
      notes: l.notes || '',
    }));
    showEditModal = true;
  } catch (e) {
    logger.error('Failed to load budget for editing:', e);
    toasts.error('Failed to load budget: ' + e);
  }
}

function closeModals() {
  showCreateModal = false;
  showEditModal = false;
  editingBudget = null;
}

function initLineDefaults() {
  const periodCount = getPeriodCount(formPeriodType);
  // Initialize all accounts with zero amounts for each period
  const newLines: Array<{
    account_id: number;
    period: number;
    amount: number;
    notes: string;
  }> = [];

  for (const account of accounts) {
    for (let p = 1; p <= periodCount; p++) {
      newLines.push({
        account_id: account.id,
        period: p,
        amount: 0,
        notes: '',
      });
    }
  }
  formLines = newLines;
}

$: if (showCreateModal && formLines.length === 0 && accounts.length > 0) {
  initLineDefaults();
}

function getLineAmount(accountId: number, period: number): number {
  const line = formLines.find((l) => l.account_id === accountId && l.period === period);
  return line ? line.amount : 0;
}

function setLineAmount(accountId: number, period: number, amount: number) {
  const existing = formLines.findIndex((l) => l.account_id === accountId && l.period === period);
  if (existing >= 0) {
    formLines[existing].amount = amount;
    formLines = formLines; // Trigger reactivity
  } else {
    formLines = [...formLines, { account_id: accountId, period, amount, notes: '' }];
  }
}

function getPeriodTotal(period: number): number {
  return formLines.filter((l) => l.period === period).reduce((sum, l) => sum + (l.amount || 0), 0);
}

function getAccountTotal(accountId: number): number {
  return formLines
    .filter((l) => l.account_id === accountId)
    .reduce((sum, l) => sum + (l.amount || 0), 0);
}

function getGrandTotal(): number {
  return formLines.reduce((sum, l) => sum + (l.amount || 0), 0);
}

async function handleCreate() {
  if (!formName.trim()) {
    toasts.error('Budget name is required');
    return;
  }

  if (formLines.length === 0) {
    toasts.error('At least one budget line is required');
    return;
  }

  try {
    await createBudget({
      fiscal_year: formFiscalYear,
      name: formName.trim(),
      period_type: formPeriodType,
      notes: formNotes || undefined,
      lines: formLines.map((l) => ({
        account_id: l.account_id,
        period: l.period,
        amount: l.amount,
        notes: l.notes || undefined,
      })),
    });

    toasts.success('Budget created successfully!');
    closeModals();
    await loadBudgets();
  } catch (e) {
    logger.error('Failed to create budget:', e);
    toasts.error('Failed to create budget: ' + e);
  }
}

async function handleUpdate() {
  if (!editingBudget) return;

  if (!formName.trim()) {
    toasts.error('Budget name is required');
    return;
  }

  try {
    await updateBudgetLines(
      editingBudget.id,
      formLines.map((l) => ({
        account_id: l.account_id,
        period: l.period,
        amount: l.amount,
        notes: l.notes || undefined,
      })),
    );

    toasts.success('Budget updated successfully!');
    closeModals();
    await loadBudgets();
  } catch (e) {
    logger.error('Failed to update budget:', e);
    toasts.error('Failed to update budget: ' + e);
  }
}

async function handleDelete(budgetId: number) {
  if (!confirm('Are you sure you want to delete this budget? This action cannot be undone.')) {
    return;
  }

  try {
    await deleteBudget(budgetId);
    toasts.success('Budget deleted successfully!');
    await loadBudgets();
  } catch (e) {
    logger.error('Failed to delete budget:', e);
    toasts.error('Failed to delete budget: ' + e);
  }
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(amount);
}
</script>

<div class="budget-view">
  <div class="header">
    <h2>Budgets</h2>
    <div class="header-controls">
      <div class="filters">
        <Input
          type="number"
          label="Fiscal Year"
          bind:value={filterFiscalYear}
          placeholder="All Years"
        />
      </div>
      <Button onclick={openCreateModal}>Create Budget</Button>
    </div>
  </div>

  {#if loading}
    <Card>
      <p>Loading budgets...</p>
    </Card>
  {:else if budgets.length === 0}
    <Card>
      <p>No budgets found. Create your first budget to get started.</p>
    </Card>
  {:else}
    {#each budgets as budget}
      <Card title={budget.name} padding={false}>
        <div class="budget-card-header">
          <div class="budget-meta">
            <span class="badge">FY {budget.fiscal_year}</span>
            <span class="badge period">{budget.period_type}</span>
            {#if budget.notes}
              <span class="notes">{budget.notes}</span>
            {/if}
          </div>
          <div class="budget-actions">
            <Button variant="secondary" size="sm" onclick={() => openEditModal(budget)}>
              Edit Lines
            </Button>
            <Button variant="danger" size="sm" onclick={() => handleDelete(budget.id)}>
              Delete
            </Button>
          </div>
        </div>
      </Card>
    {/each}
  {/if}
</div>

<Modal title={editingBudget ? 'Edit Budget Lines' : 'Create Budget'} open={showCreateModal || showEditModal} size="xlarge" onclose={closeModals}>
  <div class="budget-form">
    <div class="form-row">
      <Input
        label="Budget Name"
        bind:value={formName}
        required
        placeholder="e.g. FY 2026 Operating Budget"
      />
    </div>
    <div class="form-row form-row-3">
      <Input
        type="number"
        label="Fiscal Year"
        bind:value={formFiscalYear}
        required
      />
      <Select
        label="Period Type"
        bind:value={formPeriodType}
        options={[
          { value: 'monthly', label: 'Monthly' },
          { value: 'quarterly', label: 'Quarterly' },
          { value: 'yearly', label: 'Yearly' },
        ]}
      />
      <Input
        label="Notes"
        bind:value={formNotes}
        placeholder="Optional notes..."
      />
    </div>
  </div>

  <div class="lines-section">
    <h3>Budget Lines</h3>
    <p class="hint">Enter budgeted amounts for revenue and expense accounts.</p>

    <div class="lines-table-wrapper">
      <table class="budget-lines-table">
        <thead>
          <tr>
            <th class="col-code">Code</th>
            <th class="col-name">Account</th>
            <th class="col-type">Type</th>
            {#each Array(getPeriodCount(formPeriodType)) as _, i}
              <th class="col-amount">{getPeriodLabel(formPeriodType, i + 1)}</th>
            {/each}
            <th class="col-total">Total</th>
          </tr>
        </thead>
        <tbody>
          {#each accounts as account (account.id)}
            <tr>
              <td class="col-code">{account.code}</td>
              <td class="col-name">{account.name}</td>
              <td class="col-type">{account.type}</td>
              {#each Array(getPeriodCount(formPeriodType)) as _, i}
                <td class="col-amount">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={getLineAmount(account.id, i + 1)}
                    on:input={(e) => {
                      const val = parseFloat(e.currentTarget.value) || 0;
                      setLineAmount(account.id, i + 1, val);
                    }}
                    class="amount-input"
                  />
                </td>
              {/each}
              <td class="col-total">{formatCurrency(getAccountTotal(account.id))}</td>
            </tr>
          {/each}
        </tbody>
        <tfoot>
          <tr class="total-row">
            <td colspan="3"><strong>Period Totals</strong></td>
            {#each Array(getPeriodCount(formPeriodType)) as _, i}
              <td class="col-amount">
                <strong>{formatCurrency(getPeriodTotal(i + 1))}</strong>
              </td>
            {/each}
            <td class="col-total">
              <strong>{formatCurrency(getGrandTotal())}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>

  <div class="form-actions">
    <Button variant="secondary" onclick={closeModals}>Cancel</Button>
    <Button onclick={editingBudget ? handleUpdate : handleCreate}>
      {editingBudget ? 'Save Changes' : 'Create Budget'}
    </Button>
  </div>
</Modal>

<style>
  .budget-view {
    max-width: 1200px;
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
  }

  h2 {
    margin: 0;
    color: #2c3e50;
    font-size: 28px;
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .filters {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }

  .budget-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid #ecf0f1;
  }

  .budget-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .badge {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    background: #3498db;
    color: white;
  }

  .badge.period {
    background: #2ecc71;
  }

  .notes {
    font-size: 13px;
    color: #7f8c8d;
    margin-left: 8px;
  }

  .budget-actions {
    display: flex;
    gap: 8px;
  }

  .budget-form {
    margin-bottom: 20px;
  }

  .form-row {
    margin-bottom: 16px;
  }

  .form-row-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 12px;
  }

  .lines-section {
    margin-bottom: 20px;
  }

  .lines-section h3 {
    margin: 0 0 4px 0;
    color: #2c3e50;
  }

  .hint {
    margin: 0 0 12px 0;
    font-size: 13px;
    color: #7f8c8d;
  }

  .lines-table-wrapper {
    overflow-x: auto;
  }

  .budget-lines-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .budget-lines-table th,
  .budget-lines-table td {
    padding: 6px 8px;
    border: 1px solid #ecf0f1;
    text-align: left;
  }

  .budget-lines-table thead th {
    background: #f8f9fa;
    font-weight: 600;
    color: #2c3e50;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .col-code {
    width: 80px;
    min-width: 80px;
  }

  .col-name {
    min-width: 160px;
  }

  .col-type {
    width: 60px;
    min-width: 60px;
  }

  .col-amount {
    width: 100px;
    min-width: 100px;
    text-align: right;
  }

  .col-total {
    width: 110px;
    min-width: 110px;
    text-align: right;
    font-weight: 600;
  }

  .amount-input {
    width: 90px;
    padding: 4px 6px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 13px;
    text-align: right;
    font-family: inherit;
  }

  .amount-input:focus {
    outline: none;
    border-color: #3498db;
  }

  .total-row td {
    background: #f8f9fa;
    font-weight: 600;
    color: #2c3e50;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding-top: 16px;
    border-top: 1px solid #ecf0f1;
  }
</style>
