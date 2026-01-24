<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import { getDatabase } from '../services/database';
  import type { Invoice, Payment, PolicyMode } from '../domain/types';
  import Card from '../ui/Card.svelte';

  export let mode: PolicyMode;
  export let onNavigate: (view: 'dashboard' | 'contacts' | 'invoices' | 'payments' | 'expenses' | 'reports' | 'settings') => void;

  let loading = true;
  let stats = {
    totalInvoices: 0,
    openInvoices: 0,
    totalAR: 0,
    totalRevenue: 0,
    totalExpenses: 0,
    recentInvoices: [] as Invoice[],
    recentPayments: [] as Payment[],
  };

  onMount(async () => {
    await loadDashboard();
  });

  async function loadDashboard() {
    loading = true;
    try {
      const db = await getDatabase();

      // Get invoice stats
      const invoices = await persistenceService.getInvoices();
      const openInvoices = invoices.filter(inv => 
        ['sent', 'partial', 'overdue'].includes(inv.status)
      );

      stats.totalInvoices = invoices.length;
      stats.openInvoices = openInvoices.length;
      stats.totalAR = openInvoices.reduce((sum, inv) => 
        sum + (inv.total_amount - inv.paid_amount), 0
      );
      stats.recentInvoices = invoices.slice(0, 5);

      // Get payment stats
      const payments = await persistenceService.getPayments();
      stats.recentPayments = payments.slice(0, 5);

      // Get revenue and expense totals
      const revenueAccounts = await db.select<Array<{ total: number }>>(
        `SELECT COALESCE(SUM(jl.credit_amount - jl.debit_amount), 0) as total
         FROM journal_line jl
         JOIN account a ON jl.account_id = a.id
         JOIN journal_entry je ON jl.journal_entry_id = je.id
         WHERE a.type = 'revenue' AND je.status = 'posted'`
      );
      stats.totalRevenue = revenueAccounts[0]?.total || 0;

      const expenseAccounts = await db.select<Array<{ total: number }>>(
        `SELECT COALESCE(SUM(jl.debit_amount - jl.credit_amount), 0) as total
         FROM journal_line jl
         JOIN account a ON jl.account_id = a.id
         JOIN journal_entry je ON jl.journal_entry_id = je.id
         WHERE a.type = 'expense' AND je.status = 'posted'`
      );
      stats.totalExpenses = expenseAccounts[0]?.total || 0;

    } catch (e) {
      console.error('Failed to load dashboard:', e);
    }
    loading = false;
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-CA');
  }
</script>

<div class="dashboard">
  <h2>Dashboard</h2>

  <Card>
    <div class="welcome">
      <h3>Welcome to Invariant Accounting</h3>
      <p>
        {#if mode === 'beginner'}
          You're in <strong>Beginner Mode</strong>. The app will guide you through
          recommended workflows and prevent common mistakes.
        {:else}
          You're in <strong>Pro Mode</strong>. You have full control over all
          accounting operations.
        {/if}
      </p>
    </div>
  </Card>

  {#if loading}
    <Card>
      <p>Loading dashboard...</p>
    </Card>
  {:else}
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Total Invoices</div>
        <div class="stat-value">{stats.totalInvoices}</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Open Invoices</div>
        <div class="stat-value">{stats.openInvoices}</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Accounts Receivable</div>
        <div class="stat-value">{formatCurrency(stats.totalAR)}</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Total Revenue</div>
        <div class="stat-value success">{formatCurrency(stats.totalRevenue)}</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Total Expenses</div>
        <div class="stat-value danger">{formatCurrency(stats.totalExpenses)}</div>
      </div>

      <div class="stat-card">
        <div class="stat-label">Net Income</div>
        <div class="stat-value" class:success={stats.totalRevenue > stats.totalExpenses} class:danger={stats.totalRevenue < stats.totalExpenses}>
          {formatCurrency(stats.totalRevenue - stats.totalExpenses)}
        </div>
      </div>
    </div>

    <div class="quick-actions">
      <h3>Quick Actions</h3>
      <div class="action-grid">
        <button class="action-btn" onclick={() => onNavigate('contacts')}>
          Add Contact
        </button>
        <button class="action-btn" onclick={() => onNavigate('invoices')}>
          Create Invoice
        </button>
        <button class="action-btn" onclick={() => onNavigate('expenses')}>
          Record Expense
        </button>
        <button class="action-btn" onclick={() => onNavigate('payments')}>
          Record Payment
        </button>
        <button class="action-btn" onclick={() => onNavigate('reports')}>
          View Reports
        </button>
      </div>
    </div>

    {#if stats.recentInvoices.length > 0}
      <Card title="Recent Invoices">
        <div class="recent-list">
          {#each stats.recentInvoices as invoice}
            <div class="recent-item">
              <div>
                <strong>{invoice.invoice_number}</strong>
                <span class="date">{formatDate(invoice.issue_date)}</span>
              </div>
              <div>
                <span class="amount">{formatCurrency(invoice.total_amount)}</span>
                <span class="badge {invoice.status}">{invoice.status}</span>
              </div>
            </div>
          {/each}
        </div>
      </Card>
    {/if}

    {#if stats.recentPayments.length > 0}
      <Card title="Recent Payments">
        <div class="recent-list">
          {#each stats.recentPayments as payment}
            <div class="recent-item">
              <div>
                <strong>{payment.payment_number}</strong>
                <span class="date">{formatDate(payment.payment_date)}</span>
              </div>
              <div>
                <span class="amount">{formatCurrency(payment.amount)}</span>
                <span class="badge {payment.status}">{payment.status}</span>
              </div>
            </div>
          {/each}
        </div>
      </Card>
    {/if}
  {/if}
</div>

<style>
  .dashboard {
    max-width: 1200px;
  }

  h2 {
    margin: 0 0 24px 0;
    color: #2c3e50;
    font-size: 28px;
  }

  .welcome {
    margin-bottom: 0;
  }

  .welcome h3 {
    margin: 0 0 12px 0;
    color: #2c3e50;
  }

  .welcome p {
    margin: 0;
    line-height: 1.6;
    color: #555;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: white;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }

  .stat-label {
    font-size: 13px;
    color: #7f8c8d;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 600;
    color: #2c3e50;
  }

  .stat-value.success {
    color: #27ae60;
  }

  .stat-value.danger {
    color: #e74c3c;
  }

  .quick-actions {
    background: white;
    padding: 24px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    margin-bottom: 24px;
  }

  .quick-actions h3 {
    margin: 0 0 16px 0;
    color: #2c3e50;
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
  }

  .action-btn {
    background: #3498db;
    color: white;
    border: none;
    padding: 16px 24px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .action-btn:hover {
    background: #2980b9;
    transform: translateY(-1px);
  }

  .recent-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .recent-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .recent-item > div {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .date {
    color: #7f8c8d;
    font-size: 14px;
  }

  .amount {
    font-family: 'Courier New', monospace;
    font-weight: 500;
  }

  .badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    text-transform: capitalize;
  }

  .badge.draft { background: #ecf0f1; color: #7f8c8d; }
  .badge.sent { background: #e8f4f8; color: #2980b9; }
  .badge.paid { background: #d5f4e6; color: #27ae60; }
  .badge.partial { background: #fef5e7; color: #d68910; }
  .badge.overdue { background: #fadbd8; color: #e74c3c; }
  .badge.pending { background: #ecf0f1; color: #7f8c8d; }
  .badge.allocated { background: #d5f4e6; color: #27ae60; }
</style>
