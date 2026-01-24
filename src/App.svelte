<script lang="ts">
  import { onMount } from 'svelte';
  import { getDatabase } from './lib/services/database';
  import { persistenceService } from './lib/services/persistence';
  import type { PolicyMode } from './lib/domain/types';
  
  import ContactsView from './lib/views/ContactsView.svelte';
  import InvoicesView from './lib/views/InvoicesView.svelte';
  import PaymentsView from './lib/views/PaymentsView.svelte';
  import ExpensesView from './lib/views/ExpensesView.svelte';
  import ReportsView from './lib/views/ReportsView.svelte';
  import DashboardView from './lib/views/DashboardView.svelte';

  let mode: PolicyMode = 'beginner';
  let dbReady = false;
  let error = '';
  let activeView: 'dashboard' | 'contacts' | 'invoices' | 'payments' | 'expenses' | 'reports' | 'settings' = 'dashboard';

  onMount(async () => {
    try {
      await getDatabase();
      mode = await persistenceService.getMode();
      dbReady = true;
    } catch (e) {
      error = `Failed to initialize database: ${e}`;
      console.error(error);
    }
  });

  async function toggleMode() {
    const newMode: PolicyMode = mode === 'beginner' ? 'pro' : 'beginner';
    await persistenceService.setMode(newMode);
    mode = newMode;
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
      {:else if activeView === 'contacts'}
        <ContactsView />
      {:else if activeView === 'invoices'}
        <InvoicesView {mode} />
      {:else if activeView === 'payments'}
        <PaymentsView {mode} />
      {:else if activeView === 'expenses'}
        <ExpensesView {mode} />
      {:else if activeView === 'reports'}
        <ReportsView />
      {:else if activeView === 'settings'}
        <div class="view">
          <h2>Settings</h2>
          
          <div class="setting-group">
            <h3>Mode</h3>
            <p>
              Current mode: <strong>{mode}</strong>
            </p>
            <button onclick={toggleMode}>
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
        </div>
      {/if}
    </main>
  {/if}
</div>

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

  .info {
    background: #e8f4f8;
    padding: 16px;
    border-radius: 6px;
    border-left: 4px solid #3498db;
    margin-top: 16px;
    color: #2c3e50;
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
</style>
