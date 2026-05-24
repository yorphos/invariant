<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { PolicyMode } from '../domain/types';

  type ViewName = 'dashboard' | 'accounts' | 'contacts' | 'invoices' | 'payments' | 'bills' | 'expenses' | 'reports' | 'reconciliation' | 'batch' | 'bank-import' | 'inventory' | 'payroll' | 'journal' | 'credit-notes' | 'budget' | 'settings';

  interface Props {
    activeView: ViewName;
    mode: PolicyMode;
  }

  let { activeView, mode }: Props = $props();

  const dispatch = createEventDispatcher<{ navigate: ViewName }>();

  function setView(view: ViewName) {
    dispatch('navigate', view);
  }
</script>

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
      class:active={activeView === 'credit-notes'}
      onclick={() => setView('credit-notes')}
    >
      Credit Notes
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
      class:active={activeView === 'budget'}
      onclick={() => setView('budget')}
    >
      Budget
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

<style>
  .sidebar {
    width: 240px;
    background: #2c3e50;
    color: white;
    display: flex;
    flex-direction: column;
    padding: 20px;
    height: 100vh;
    flex-shrink: 0;
    overflow: hidden;
  }

  .sidebar h1 {
    font-size: 24px;
    margin: 0 0 30px 0;
    font-weight: 600;
    flex-shrink: 0;
  }

  nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    min-height: 0;
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
    margin-top: auto;
    flex-shrink: 0;
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
</style>
