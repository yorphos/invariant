<script lang="ts">
  import { onMount } from 'svelte';
  import { getDatabase } from '../services/database';
  import type { Account } from '../domain/types';
  import Card from '../ui/Card.svelte';
  import Input from '../ui/Input.svelte';
  import Table from '../ui/Table.svelte';
  import Button from '../ui/Button.svelte';
  import { toCSV, downloadCSV, formatCurrencyForCSV } from '../utils/csv-export';

  let loading = false;
  
  // Balance Sheet & Trial Balance use single "as of" date (point in time)
  let asOfDate = '';
  
  // Income Statement uses date range (period)
  let incomeStartDate = '';
  let incomeEndDate = '';

  interface AccountBalance {
    account: Account;
    debit_total: number;
    credit_total: number;
    balance: number;
  }

  // Separate balances for different report types
  let balanceSheetBalances: AccountBalance[] = [];
  let incomeStatementBalances: AccountBalance[] = [];
  let trialBalances: AccountBalance[] = [];
  
  onMount(async () => {
    // Set default dates
    const today = new Date();
    asOfDate = today.toISOString().split('T')[0];
    
    // Default to current month for income statement
    incomeStartDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
    incomeEndDate = today.toISOString().split('T')[0];
    
    await loadAllReports();
  });

  async function loadAllReports() {
    await Promise.all([
      loadBalanceSheet(),
      loadIncomeStatement(),
      loadTrialBalance()
    ]);
  }

  async function loadBalanceSheet() {
    loading = true;
    try {
      const db = await getDatabase();
      
      // Get all asset, liability, equity accounts
      const accounts = await db.select<Account[]>(
        `SELECT * FROM account 
         WHERE is_active = 1 
         AND type IN ('asset', 'liability', 'equity')
         ORDER BY code`
      );

      const accountBalances: AccountBalance[] = [];

      for (const account of accounts) {
        const lines = await db.select<Array<{ debit_total: number; credit_total: number }>>(
          `SELECT 
            COALESCE(SUM(debit_amount), 0) as debit_total,
            COALESCE(SUM(credit_amount), 0) as credit_total
          FROM journal_line jl
          JOIN journal_entry je ON jl.journal_entry_id = je.id
          WHERE jl.account_id = ? 
            AND je.status = 'posted'
            AND DATE(je.entry_date) <= ?`,
          [account.id, asOfDate]
        );

        const debit_total = lines[0]?.debit_total || 0;
        const credit_total = lines[0]?.credit_total || 0;

        // Calculate balance based on account type
        let balance: number;
        if (account.type === 'asset') {
          balance = debit_total - credit_total;
        } else {
          balance = credit_total - debit_total;
        }

        accountBalances.push({
          account,
          debit_total,
          credit_total,
          balance
        });
      }

      balanceSheetBalances = accountBalances.filter(b => Math.abs(b.balance) > 0.01);
    } catch (e) {
      console.error('Failed to load balance sheet:', e);
      alert('Failed to load balance sheet: ' + e);
    }
    loading = false;
  }

  async function loadIncomeStatement() {
    loading = true;
    try {
      const db = await getDatabase();
      
      // Get all revenue and expense accounts
      const accounts = await db.select<Account[]>(
        `SELECT * FROM account 
         WHERE is_active = 1 
         AND type IN ('revenue', 'expense')
         ORDER BY code`
      );

      const accountBalances: AccountBalance[] = [];

      for (const account of accounts) {
        // **KEY CHANGE**: Filter by date RANGE for income statement
        const lines = await db.select<Array<{ debit_total: number; credit_total: number }>>(
          `SELECT 
            COALESCE(SUM(debit_amount), 0) as debit_total,
            COALESCE(SUM(credit_amount), 0) as credit_total
          FROM journal_line jl
          JOIN journal_entry je ON jl.journal_entry_id = je.id
          WHERE jl.account_id = ? 
            AND je.status = 'posted'
            AND DATE(je.entry_date) >= ?
            AND DATE(je.entry_date) <= ?`,
          [account.id, incomeStartDate, incomeEndDate]
        );

        const debit_total = lines[0]?.debit_total || 0;
        const credit_total = lines[0]?.credit_total || 0;

        // Calculate balance based on account type
        let balance: number;
        if (account.type === 'expense') {
          balance = debit_total - credit_total;
        } else {
          balance = credit_total - debit_total;
        }

        accountBalances.push({
          account,
          debit_total,
          credit_total,
          balance
        });
      }

      incomeStatementBalances = accountBalances.filter(b => Math.abs(b.balance) > 0.01);
    } catch (e) {
      console.error('Failed to load income statement:', e);
      alert('Failed to load income statement: ' + e);
    }
    loading = false;
  }

  async function loadTrialBalance() {
    loading = true;
    try {
      const db = await getDatabase();
      
      // Get all accounts with their balances
      const accounts = await db.select<Account[]>(
        'SELECT * FROM account WHERE is_active = 1 ORDER BY code'
      );

      const accountBalances: AccountBalance[] = [];

      for (const account of accounts) {
        const lines = await db.select<Array<{ debit_total: number; credit_total: number }>>(
          `SELECT 
            COALESCE(SUM(debit_amount), 0) as debit_total,
            COALESCE(SUM(credit_amount), 0) as credit_total
          FROM journal_line jl
          JOIN journal_entry je ON jl.journal_entry_id = je.id
          WHERE jl.account_id = ? 
            AND je.status = 'posted'
            AND DATE(je.entry_date) <= ?`,
          [account.id, asOfDate]
        );

        const debit_total = lines[0]?.debit_total || 0;
        const credit_total = lines[0]?.credit_total || 0;

        // Calculate balance based on account type
        let balance: number;
        if (account.type === 'asset' || account.type === 'expense') {
          balance = debit_total - credit_total;
        } else {
          balance = credit_total - debit_total;
        }

        accountBalances.push({
          account,
          debit_total,
          credit_total,
          balance
        });
      }

      trialBalances = accountBalances.filter(b => Math.abs(b.balance) > 0.01);
    } catch (e) {
      console.error('Failed to load trial balance:', e);
      alert('Failed to load trial balance: ' + e);
    }
    loading = false;
  }

  // Automatically reload reports when dates change
  $: if (asOfDate) {
    loadBalanceSheet();
    loadTrialBalance();
  }
  
  $: if (incomeStartDate && incomeEndDate) {
    loadIncomeStatement();
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount);
  }

  // Balance Sheet totals
  $: totalAssets = balanceSheetBalances
    .filter(b => b.account.type === 'asset')
    .reduce((sum, b) => sum + b.balance, 0);

  $: totalLiabilities = balanceSheetBalances
    .filter(b => b.account.type === 'liability')
    .reduce((sum, b) => sum + b.balance, 0);

  $: totalEquity = balanceSheetBalances
    .filter(b => b.account.type === 'equity')
    .reduce((sum, b) => sum + b.balance, 0);

  // Income Statement totals (from period-filtered data)
  $: totalRevenue = incomeStatementBalances
    .filter(b => b.account.type === 'revenue')
    .reduce((sum, b) => sum + b.balance, 0);

  $: totalExpenses = incomeStatementBalances
    .filter(b => b.account.type === 'expense')
    .reduce((sum, b) => sum + b.balance, 0);

  $: netIncome = totalRevenue - totalExpenses;

  // Quick date range buttons
  function setDateRange(range: string) {
    const today = new Date();
    let start: Date;
    let end: Date;

    switch (range) {
      case 'this-month':
        start = new Date(today.getFullYear(), today.getMonth(), 1);
        end = today;
        break;
      case 'last-month':
        start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        end = new Date(today.getFullYear(), today.getMonth(), 0); // Last day of previous month
        break;
      case 'this-quarter':
        const quarter = Math.floor(today.getMonth() / 3);
        start = new Date(today.getFullYear(), quarter * 3, 1);
        end = today;
        break;
      case 'last-quarter':
        const lastQuarter = Math.floor(today.getMonth() / 3) - 1;
        const year = lastQuarter < 0 ? today.getFullYear() - 1 : today.getFullYear();
        const q = lastQuarter < 0 ? 3 : lastQuarter;
        start = new Date(year, q * 3, 1);
        end = new Date(year, q * 3 + 3, 0); // Last day of quarter
        break;
      case 'ytd':
        start = new Date(today.getFullYear(), 0, 1);
        end = today;
        break;
      case 'last-year':
        start = new Date(today.getFullYear() - 1, 0, 1);
        end = new Date(today.getFullYear() - 1, 11, 31);
        break;
      default:
        return;
    }

    incomeStartDate = start.toISOString().split('T')[0];
    incomeEndDate = end.toISOString().split('T')[0];
  }

  function exportBalanceSheet() {
    const assets = balanceSheetBalances
      .filter(b => b.account.type === 'asset')
      .map(b => ({
        Type: 'Asset',
        Code: b.account.code,
        Account: b.account.name,
        Balance: formatCurrencyForCSV(b.balance),
      }));

    const liabilities = balanceSheetBalances
      .filter(b => b.account.type === 'liability')
      .map(b => ({
        Type: 'Liability',
        Code: b.account.code,
        Account: b.account.name,
        Balance: formatCurrencyForCSV(b.balance),
      }));

    const equity = balanceSheetBalances
      .filter(b => b.account.type === 'equity')
      .map(b => ({
        Type: 'Equity',
        Code: b.account.code,
        Account: b.account.name,
        Balance: formatCurrencyForCSV(b.balance),
      }));

    // Add totals
    const data = [
      ...assets,
      { Type: 'Asset', Code: '', Account: 'Total Assets', Balance: formatCurrencyForCSV(totalAssets) },
      { Type: '', Code: '', Account: '', Balance: '' },
      ...liabilities,
      { Type: 'Liability', Code: '', Account: 'Total Liabilities', Balance: formatCurrencyForCSV(totalLiabilities) },
      { Type: '', Code: '', Account: '', Balance: '' },
      ...equity,
      { Type: 'Equity', Code: '', Account: 'Net Income', Balance: formatCurrencyForCSV(netIncome) },
      { Type: 'Equity', Code: '', Account: 'Total Equity', Balance: formatCurrencyForCSV(totalEquity + netIncome) },
    ];

    const csv = toCSV(data, ['Type', 'Code', 'Account', 'Balance']);
    downloadCSV(csv, `balance-sheet-${asOfDate}.csv`);
  }

  function exportProfitLoss() {
    const revenue = incomeStatementBalances
      .filter(b => b.account.type === 'revenue')
      .map(b => ({
        Type: 'Revenue',
        Code: b.account.code,
        Account: b.account.name,
        Amount: formatCurrencyForCSV(b.balance),
      }));

    const expenses = incomeStatementBalances
      .filter(b => b.account.type === 'expense')
      .map(b => ({
        Type: 'Expense',
        Code: b.account.code,
        Account: b.account.name,
        Amount: formatCurrencyForCSV(b.balance),
      }));

    const data = [
      ...revenue,
      { Type: 'Revenue', Code: '', Account: 'Total Revenue', Amount: formatCurrencyForCSV(totalRevenue) },
      { Type: '', Code: '', Account: '', Amount: '' },
      ...expenses,
      { Type: 'Expense', Code: '', Account: 'Total Expenses', Amount: formatCurrencyForCSV(totalExpenses) },
      { Type: '', Code: '', Account: '', Amount: '' },
      { Type: '', Code: '', Account: 'Net Income', Amount: formatCurrencyForCSV(netIncome) },
    ];

    const csv = toCSV(data, ['Type', 'Code', 'Account', 'Amount']);
    downloadCSV(csv, `profit-loss-${incomeStartDate}-to-${incomeEndDate}.csv`);
  }

  function exportTrialBalance() {
    const data = trialBalances.map(b => ({
      Code: b.account.code,
      Account: b.account.name,
      Type: b.account.type as string,
      Debit: b.debit_total > b.credit_total ? formatCurrencyForCSV(b.balance) : '0.00',
      Credit: b.credit_total > b.debit_total ? formatCurrencyForCSV(b.balance) : '0.00',
    }));

    // Add totals
    const totalDebits = trialBalances.reduce((sum, b) => sum + (b.debit_total > b.credit_total ? b.balance : 0), 0);
    const totalCredits = trialBalances.reduce((sum, b) => sum + (b.credit_total > b.debit_total ? b.balance : 0), 0);

    data.push({
      Code: '',
      Account: 'Totals',
      Type: '',
      Debit: formatCurrencyForCSV(totalDebits),
      Credit: formatCurrencyForCSV(totalCredits),
    });

    const csv = toCSV(data, ['Code', 'Account', 'Type', 'Debit', 'Credit']);
    downloadCSV(csv, `trial-balance-${asOfDate}.csv`);
  }
</script>

<div class="reports-view">
  <div class="header">
    <h2>Financial Reports</h2>
    <div class="date-selector">
      <Input
        type="date"
        label="Balance Sheet Date"
        bind:value={asOfDate}
      />
    </div>
  </div>

  {#if loading}
    <Card>
      <p>Loading reports...</p>
    </Card>
  {:else}
    <!-- Balance Sheet -->
    <Card title="Balance Sheet" padding={false}>
      <div class="report-header">
        <h3>As of {new Date(asOfDate).toLocaleDateString('en-CA')}</h3>
        <Button variant="secondary" on:click={exportBalanceSheet}>Export CSV</Button>
      </div>

      {#if balanceSheetBalances.length === 0}
        <div class="section">
          <p>No balance sheet data available for the selected date.</p>
        </div>
      {:else}
        <div class="balance-sheet">
          <div class="section">
            <h4>Assets</h4>
            <Table headers={['Account', 'Balance']}>
              {#each balanceSheetBalances.filter(b => b.account.type === 'asset') as item}
                <tr>
                  <td>{item.account.code} - {item.account.name}</td>
                  <td class="amount">{formatCurrency(item.balance)}</td>
                </tr>
              {/each}
              <tr class="total-row">
                <td><strong>Total Assets</strong></td>
                <td class="amount"><strong>{formatCurrency(totalAssets)}</strong></td>
              </tr>
            </Table>
          </div>

          <div class="section">
            <h4>Liabilities</h4>
            <Table headers={['Account', 'Balance']}>
              {#each balanceSheetBalances.filter(b => b.account.type === 'liability') as item}
                <tr>
                  <td>{item.account.code} - {item.account.name}</td>
                  <td class="amount">{formatCurrency(item.balance)}</td>
                </tr>
              {/each}
              <tr class="total-row">
                <td><strong>Total Liabilities</strong></td>
                <td class="amount"><strong>{formatCurrency(totalLiabilities)}</strong></td>
              </tr>
            </Table>
          </div>

          <div class="section">
            <h4>Equity</h4>
            <Table headers={['Account', 'Balance']}>
              {#each balanceSheetBalances.filter(b => b.account.type === 'equity') as item}
                <tr>
                  <td>{item.account.code} - {item.account.name}</td>
                  <td class="amount">{formatCurrency(item.balance)}</td>
                </tr>
              {/each}
              <tr>
                <td>Net Income (Current Period)</td>
                <td class="amount">{formatCurrency(netIncome)}</td>
              </tr>
              <tr class="total-row">
                <td><strong>Total Equity</strong></td>
                <td class="amount"><strong>{formatCurrency(totalEquity + netIncome)}</strong></td>
              </tr>
            </Table>
          </div>

          <div class="accounting-equation">
            <strong>Liabilities + Equity = {formatCurrency(totalLiabilities + totalEquity + netIncome)}</strong>
            {#if Math.abs((totalLiabilities + totalEquity + netIncome) - totalAssets) > 0.01}
              <span class="warning">⚠️ Not balanced!</span>
            {:else}
              <span class="success">✓ Balanced</span>
            {/if}
          </div>
        </div>
      {/if}
    </Card>

    <!-- Profit & Loss (Income Statement) -->
    <Card title="Profit & Loss Statement" padding={false}>
      <div class="report-header">
        <div>
          <h3>Period: {new Date(incomeStartDate).toLocaleDateString('en-CA')} to {new Date(incomeEndDate).toLocaleDateString('en-CA')}</h3>
          <div class="date-range-controls">
            <div class="date-inputs">
              <Input
                type="date"
                label="Start Date"
                bind:value={incomeStartDate}
              />
              <Input
                type="date"
                label="End Date"
                bind:value={incomeEndDate}
              />
            </div>
            <div class="quick-buttons">
              <Button variant="secondary" size="small" on:click={() => setDateRange('this-month')}>This Month</Button>
              <Button variant="secondary" size="small" on:click={() => setDateRange('last-month')}>Last Month</Button>
              <Button variant="secondary" size="small" on:click={() => setDateRange('this-quarter')}>This Quarter</Button>
              <Button variant="secondary" size="small" on:click={() => setDateRange('ytd')}>YTD</Button>
              <Button variant="secondary" size="small" on:click={() => setDateRange('last-year')}>Last Year</Button>
            </div>
          </div>
        </div>
        <Button variant="secondary" on:click={exportProfitLoss}>Export CSV</Button>
      </div>

      {#if incomeStatementBalances.length === 0}
        <div class="section">
          <p>No transactions found for the selected period.</p>
        </div>
      {:else}
        <div class="profit-loss">
          <div class="section">
            <h4>Revenue</h4>
            <Table headers={['Account', 'Amount']}>
              {#each incomeStatementBalances.filter(b => b.account.type === 'revenue') as item}
                <tr>
                  <td>{item.account.code} - {item.account.name}</td>
                  <td class="amount">{formatCurrency(item.balance)}</td>
                </tr>
              {/each}
              <tr class="total-row">
                <td><strong>Total Revenue</strong></td>
                <td class="amount"><strong>{formatCurrency(totalRevenue)}</strong></td>
              </tr>
            </Table>
          </div>

          <div class="section">
            <h4>Expenses</h4>
            <Table headers={['Account', 'Amount']}>
              {#each incomeStatementBalances.filter(b => b.account.type === 'expense') as item}
                <tr>
                  <td>{item.account.code} - {item.account.name}</td>
                  <td class="amount">{formatCurrency(item.balance)}</td>
                </tr>
              {/each}
              <tr class="total-row">
                <td><strong>Total Expenses</strong></td>
                <td class="amount"><strong>{formatCurrency(totalExpenses)}</strong></td>
              </tr>
            </Table>
          </div>

          <div class="net-income" class:profit={netIncome > 0} class:loss={netIncome < 0}>
            <strong>Net Income:</strong>
            <strong>{formatCurrency(netIncome)}</strong>
          </div>
        </div>
      {/if}
    </Card>

    <!-- Trial Balance -->
    <Card title="Trial Balance" padding={false}>
      <div class="report-header">
        <h3>As of {new Date(asOfDate).toLocaleDateString('en-CA')}</h3>
        <Button variant="secondary" on:click={exportTrialBalance}>Export CSV</Button>
      </div>

      {#if trialBalances.length === 0}
        <div class="section">
          <p>No trial balance data available for the selected date.</p>
        </div>
      {:else}
        <Table headers={['Code', 'Account', 'Debit', 'Credit']}>
          {#each trialBalances as item}
            <tr>
              <td>{item.account.code}</td>
              <td>{item.account.name}</td>
              <td class="amount">
                {item.debit_total > item.credit_total ? formatCurrency(item.balance) : '-'}
              </td>
              <td class="amount">
                {item.credit_total > item.debit_total ? formatCurrency(item.balance) : '-'}
              </td>
            </tr>
          {/each}
          <tr class="total-row">
            <td colspan="2"><strong>Totals</strong></td>
            <td class="amount">
              <strong>{formatCurrency(trialBalances.reduce((sum, b) => sum + (b.debit_total > b.credit_total ? b.balance : 0), 0))}</strong>
            </td>
            <td class="amount">
              <strong>{formatCurrency(trialBalances.reduce((sum, b) => sum + (b.credit_total > b.debit_total ? b.balance : 0), 0))}</strong>
            </td>
          </tr>
        </Table>
      {/if}
    </Card>
  {/if}
</div>

<style>
  .reports-view {
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

  .date-selector {
    width: 200px;
  }

  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 20px 24px;
    border-bottom: 2px solid #2c3e50;
    gap: 16px;
  }

  .report-header h3 {
    margin: 0 0 8px 0;
    font-size: 16px;
    color: #555;
  }

  .date-range-controls {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 12px;
  }

  .date-inputs {
    display: flex;
    gap: 12px;
  }

  .date-inputs :global(.input-group) {
    min-width: 150px;
  }

  .quick-buttons {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .section {
    padding: 24px;
    border-bottom: 1px solid #ecf0f1;
  }

  .section h4 {
    margin: 0 0 16px 0;
    color: #2c3e50;
    font-size: 18px;
  }

  .amount {
    text-align: right;
    font-family: 'Courier New', monospace;
  }

  :global(.total-row) {
    border-top: 2px solid #2c3e50;
    font-weight: 600;
  }

  .accounting-equation {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    background: #f8f9fa;
    font-size: 16px;
  }

  .success {
    color: #27ae60;
  }

  .warning {
    color: #e74c3c;
  }

  .net-income {
    display: flex;
    justify-content: space-between;
    padding: 20px 24px;
    font-size: 18px;
    border-top: 3px double #2c3e50;
    margin-top: 16px;
  }

  .net-income.profit {
    background: #d5f4e6;
    color: #27ae60;
  }

  .net-income.loss {
    background: #fadbd8;
    color: #e74c3c;
  }
</style>
