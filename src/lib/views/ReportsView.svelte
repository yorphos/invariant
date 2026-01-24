<script lang="ts">
  import { onMount } from 'svelte';
  import { getDatabase } from '../services/database';
  import { getBalanceSheetData, getProfitAndLossData, getTrialBalanceData, getInventoryValuationData } from '../services/reports';
  import type { AccountBalance, InventoryValuationLine } from '../services/reports';
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

  // Separate balances for different report types
  let balanceSheetBalances: AccountBalance[] = [];
  let incomeStatementBalances: AccountBalance[] = [];
  let trialBalances: AccountBalance[] = [];
  
  // Integrity check
  interface IntegrityCheck {
    subledgerTotal: number;
    glBalance: number;
    difference: number;
    isBalanced: boolean;
  }
  let arIntegrityCheck: IntegrityCheck | null = null;
  
  // A/R Aging
  interface AgingBucket {
    customer_name: string;
    current: number;
    days_1_30: number;
    days_31_60: number;
    days_61_90: number;
    days_over_90: number;
    total: number;
  }
  let arAging: AgingBucket[] = [];
  
  // A/P Aging
  interface APAgingBucket {
    vendor_name: string;
    current: number;
    days_1_30: number;
    days_31_60: number;
    days_61_90: number;
    days_over_90: number;
    total: number;
  }
  let apAging: APAgingBucket[] = [];
  
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
      loadTrialBalance(),
      loadARIntegrityCheck(),
      loadARAging(),
      loadAPAging()
    ]);
  }

  async function loadBalanceSheet() {
    loading = true;
    try {
      // Use optimized service layer with grouped aggregate query
      const data = await getBalanceSheetData(asOfDate);
      balanceSheetBalances = [...data.assets, ...data.liabilities, ...data.equity];
    } catch (e) {
      console.error('Failed to load balance sheet:', e);
      alert('Failed to load balance sheet: ' + e);
    }
    loading = false;
  }

  async function loadIncomeStatement() {
    loading = true;
    try {
      // Use optimized service layer with grouped aggregate query
      const data = await getProfitAndLossData(incomeStartDate, incomeEndDate);
      incomeStatementBalances = [...data.revenue, ...data.expenses];
    } catch (e) {
      console.error('Failed to load income statement:', e);
      alert('Failed to load income statement: ' + e);
    }
    loading = false;
  }

  async function loadTrialBalance() {
    loading = true;
    try {
      // Use optimized service layer with grouped aggregate query
      const data = await getTrialBalanceData(asOfDate);
      trialBalances = data.accounts;
    } catch (e) {
      console.error('Failed to load trial balance:', e);
      alert('Failed to load trial balance: ' + e);
    }
    loading = false;
  }

  async function loadARIntegrityCheck() {
    loading = true;
    try {
      const db = await getDatabase();
      
      // Get total from invoice subledger (total_amount - paid_amount)
      const subledgerResult = await db.select<Array<{ total: number }>>(
        `SELECT COALESCE(SUM(total_amount - paid_amount), 0) as total
         FROM invoice
         WHERE status NOT IN ('void', 'paid')
         AND DATE(issue_date) <= ?`,
        [asOfDate]
      );
      
      const subledgerTotal = subledgerResult[0]?.total || 0;
      
      // Get A/R balance from general ledger
      const accounts = await db.select<Account[]>(
        `SELECT * FROM account WHERE code = '1100' LIMIT 1`
      );
      
      if (accounts[0]) {
        const glResult = await db.select<Array<{ debit_total: number; credit_total: number }>>(
          `SELECT 
            COALESCE(SUM(debit_amount), 0) as debit_total,
            COALESCE(SUM(credit_amount), 0) as credit_total
          FROM journal_line jl
          JOIN journal_entry je ON jl.journal_entry_id = je.id
          WHERE jl.account_id = ? 
            AND je.status = 'posted'
            AND DATE(je.entry_date) <= ?`,
          [accounts[0].id, asOfDate]
        );
        
        const debitTotal = glResult[0]?.debit_total || 0;
        const creditTotal = glResult[0]?.credit_total || 0;
        const glBalance = debitTotal - creditTotal;
        
        const difference = Math.abs(subledgerTotal - glBalance);
        const isBalanced = difference < 0.01;
        
        arIntegrityCheck = {
          subledgerTotal,
          glBalance,
          difference,
          isBalanced,
        };
      }
    } catch (e) {
      console.error('Failed to load A/R integrity check:', e);
    }
    loading = false;
  }

  async function loadARAging() {
    loading = true;
    try {
      const db = await getDatabase();
      
      const invoices = await db.select<Array<{
        contact_id: number;
        customer_name: string;
        due_date: string;
        outstanding: number;
      }>>(
        `SELECT 
          i.contact_id,
          c.name as customer_name,
          i.due_date,
          (i.total_amount - i.paid_amount) as outstanding
        FROM invoice i
        JOIN contact c ON c.id = i.contact_id
        WHERE i.status NOT IN ('void', 'paid')
          AND (i.total_amount - i.paid_amount) > 0.01
          AND DATE(i.issue_date) <= ?
        ORDER BY c.name, i.due_date`,
        [asOfDate]
      );
      
      // Group by customer and age buckets
      const customerMap = new Map<string, AgingBucket>();
      
      for (const inv of invoices) {
        const dueDate = new Date(inv.due_date);
        const asOf = new Date(asOfDate);
        const daysOverdue = Math.floor((asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        
        let bucket = customerMap.get(inv.customer_name);
        if (!bucket) {
          bucket = {
            customer_name: inv.customer_name,
            current: 0,
            days_1_30: 0,
            days_31_60: 0,
            days_61_90: 0,
            days_over_90: 0,
            total: 0,
          };
          customerMap.set(inv.customer_name, bucket);
        }
        
        if (daysOverdue <= 0) {
          bucket.current += inv.outstanding;
        } else if (daysOverdue <= 30) {
          bucket.days_1_30 += inv.outstanding;
        } else if (daysOverdue <= 60) {
          bucket.days_31_60 += inv.outstanding;
        } else if (daysOverdue <= 90) {
          bucket.days_61_90 += inv.outstanding;
        } else {
          bucket.days_over_90 += inv.outstanding;
        }
        
        bucket.total += inv.outstanding;
      }
      
      arAging = Array.from(customerMap.values())
        .sort((a, b) => b.total - a.total); // Sort by total descending
    } catch (e) {
      console.error('Failed to load A/R aging:', e);
    }
    loading = false;
  }

  async function loadAPAging() {
    loading = true;
    try {
      const db = await getDatabase();
      
      const bills = await db.select<Array<{
        vendor_id: number;
        vendor_name: string;
        due_date: string;
        outstanding: number;
      }>>(
        `SELECT 
          b.vendor_id,
          c.name as vendor_name,
          b.due_date,
          (b.total_amount - b.paid_amount) as outstanding
        FROM bill b
        JOIN contact c ON c.id = b.vendor_id
        WHERE b.status NOT IN ('void', 'paid')
          AND (b.total_amount - b.paid_amount) > 0.01
          AND DATE(b.bill_date) <= ?
        ORDER BY c.name, b.due_date`,
        [asOfDate]
      );
      
      // Group by vendor and age buckets
      const vendorMap = new Map<string, APAgingBucket>();
      
      for (const bill of bills) {
        const dueDate = new Date(bill.due_date);
        const asOf = new Date(asOfDate);
        const daysOverdue = Math.floor((asOf.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        
        let bucket = vendorMap.get(bill.vendor_name);
        if (!bucket) {
          bucket = {
            vendor_name: bill.vendor_name,
            current: 0,
            days_1_30: 0,
            days_31_60: 0,
            days_61_90: 0,
            days_over_90: 0,
            total: 0,
          };
          vendorMap.set(bill.vendor_name, bucket);
        }
        
        if (daysOverdue <= 0) {
          bucket.current += bill.outstanding;
        } else if (daysOverdue <= 30) {
          bucket.days_1_30 += bill.outstanding;
        } else if (daysOverdue <= 60) {
          bucket.days_31_60 += bill.outstanding;
        } else if (daysOverdue <= 90) {
          bucket.days_61_90 += bill.outstanding;
        } else {
          bucket.days_over_90 += bill.outstanding;
        }
        
        bucket.total += bill.outstanding;
      }
      
      apAging = Array.from(vendorMap.values())
        .sort((a, b) => b.total - a.total); // Sort by total descending
    } catch (e) {
      console.error('Failed to load A/P aging:', e);
    }
    loading = false;
  }

  // Inventory Valuation (uses imported type from reports.ts)
  let inventoryValuation: InventoryValuationLine[] = [];

  async function loadInventoryValuation() {
    loading = true;
    try {
      // Use optimized service layer with grouped aggregate queries
      // Reduces from 2N queries to 2 queries total
      const data = await getInventoryValuationData(asOfDate);
      inventoryValuation = data.items;
    } catch (e) {
      console.error('Failed to load inventory valuation:', e);
    }
    loading = false;
  }

  // Inventory Movements Report
  interface InventoryMovementLine {
    movement_date: string;
    item_sku: string;
    item_name: string;
    movement_type: string;
    quantity: number;
    unit_cost: number | null;
    notes: string | null;
  }
  let inventoryMovements: InventoryMovementLine[] = [];

  async function loadInventoryMovements() {
    loading = true;
    try {
      const db = await getDatabase();
      
      const movements = await db.select<InventoryMovementLine[]>(
        `SELECT 
          im.movement_date,
          i.sku as item_sku,
          i.name as item_name,
          im.movement_type,
          im.quantity,
          im.unit_cost,
          im.notes
        FROM inventory_movement im
        JOIN item i ON i.id = im.item_id
        WHERE im.movement_date BETWEEN ? AND ?
        ORDER BY im.movement_date DESC, im.id DESC
        LIMIT 500`,
        [incomeStartDate, incomeEndDate]
      );
      
      inventoryMovements = movements;
    } catch (e) {
      console.error('Failed to load inventory movements:', e);
    }
    loading = false;
  }

  // Automatically reload reports when dates change
  $: if (asOfDate) {
    loadBalanceSheet();
    loadTrialBalance();
    loadARIntegrityCheck();
    loadARAging();
    loadAPAging();
    loadInventoryValuation();
  }
  
  $: if (incomeStartDate && incomeEndDate) {
    loadIncomeStatement();
    loadInventoryMovements();
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount);
  }

  // Balance Sheet totals
  $: totalAssets = balanceSheetBalances
    .filter(b => b.account_type === 'asset')
    .reduce((sum, b) => sum + b.balance, 0);

  $: totalLiabilities = balanceSheetBalances
    .filter(b => b.account_type === 'liability')
    .reduce((sum, b) => sum + b.balance, 0);

  $: totalEquity = balanceSheetBalances
    .filter(b => b.account_type === 'equity')
    .reduce((sum, b) => sum + b.balance, 0);

  // Income Statement totals (from period-filtered data)
  $: totalRevenue = incomeStatementBalances
    .filter(b => b.account_type === 'revenue')
    .reduce((sum, b) => sum + b.balance, 0);

  $: totalExpenses = incomeStatementBalances
    .filter(b => b.account_type === 'expense')
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
      .filter(b => b.account_type === 'asset')
      .map(b => ({
        Type: 'Asset',
        Code: b.account_code,
        Account: b.account_name,
        Balance: formatCurrencyForCSV(b.balance),
      }));

    const liabilities = balanceSheetBalances
      .filter(b => b.account_type === 'liability')
      .map(b => ({
        Type: 'Liability',
        Code: b.account_code,
        Account: b.account_name,
        Balance: formatCurrencyForCSV(b.balance),
      }));

    const equity = balanceSheetBalances
      .filter(b => b.account_type === 'equity')
      .map(b => ({
        Type: 'Equity',
        Code: b.account_code,
        Account: b.account_name,
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
      .filter(b => b.account_type === 'revenue')
      .map(b => ({
        Type: 'Revenue',
        Code: b.account_code,
        Account: b.account_name,
        Amount: formatCurrencyForCSV(b.balance),
      }));

    const expenses = incomeStatementBalances
      .filter(b => b.account_type === 'expense')
      .map(b => ({
        Type: 'Expense',
        Code: b.account_code,
        Account: b.account_name,
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
      Code: b.account_code,
      Account: b.account_name,
      Type: b.account_type as string,
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
        <Button variant="secondary" onclick={exportBalanceSheet}>Export CSV</Button>
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
              {#each balanceSheetBalances.filter(b => b.account_type === 'asset') as item}
                <tr>
                  <td>{item.account_code} - {item.account_name}</td>
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
              {#each balanceSheetBalances.filter(b => b.account_type === 'liability') as item}
                <tr>
                  <td>{item.account_code} - {item.account_name}</td>
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
              {#each balanceSheetBalances.filter(b => b.account_type === 'equity') as item}
                <tr>
                  <td>{item.account_code} - {item.account_name}</td>
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
              <Button variant="secondary" size="sm" onclick={() => setDateRange('this-month')}>This Month</Button>
              <Button variant="secondary" size="sm" onclick={() => setDateRange('last-month')}>Last Month</Button>
              <Button variant="secondary" size="sm" onclick={() => setDateRange('this-quarter')}>This Quarter</Button>
              <Button variant="secondary" size="sm" onclick={() => setDateRange('ytd')}>YTD</Button>
              <Button variant="secondary" size="sm" onclick={() => setDateRange('last-year')}>Last Year</Button>
            </div>
          </div>
        </div>
        <Button variant="secondary" onclick={exportProfitLoss}>Export CSV</Button>
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
              {#each incomeStatementBalances.filter(b => b.account_type === 'revenue') as item}
                <tr>
                  <td>{item.account_code} - {item.account_name}</td>
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
              {#each incomeStatementBalances.filter(b => b.account_type === 'expense') as item}
                <tr>
                  <td>{item.account_code} - {item.account_name}</td>
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
        <Button variant="secondary" onclick={exportTrialBalance}>Export CSV</Button>
      </div>

      {#if trialBalances.length === 0}
        <div class="section">
          <p>No trial balance data available for the selected date.</p>
        </div>
      {:else}
        <Table headers={['Code', 'Account', 'Debit', 'Credit']}>
          {#each trialBalances as item}
            <tr>
              <td>{item.account_code}</td>
              <td>{item.account_name}</td>
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

    <!-- A/R Subledger Integrity Check -->
    <Card title="A/R Subledger Integrity Check" padding={false}>
      <div class="report-header">
        <h3>As of {new Date(asOfDate).toLocaleDateString('en-CA')}</h3>
      </div>

      {#if arIntegrityCheck}
        <div class="section">
          <div class="integrity-grid">
            <div class="integrity-item">
              <span class="label">Subledger (Invoice) Total:</span>
              <strong>{formatCurrency(arIntegrityCheck.subledgerTotal)}</strong>
            </div>
            <div class="integrity-item">
              <span class="label">G/L A/R Account Balance:</span>
              <strong>{formatCurrency(arIntegrityCheck.glBalance)}</strong>
            </div>
            <div class="integrity-item">
              <span class="label">Difference:</span>
              <strong class:warning={!arIntegrityCheck.isBalanced}>
                {formatCurrency(arIntegrityCheck.difference)}
              </strong>
            </div>
            <div class="integrity-result" class:balanced={arIntegrityCheck.isBalanced} class:unbalanced={!arIntegrityCheck.isBalanced}>
              {#if arIntegrityCheck.isBalanced}
                <span class="success-icon">✓</span>
                <strong>Balanced</strong>
                <p>Subledger matches General Ledger</p>
              {:else}
                <span class="error-icon">⚠️</span>
                <strong>Out of Balance</strong>
                <p>Manual journal entries may have bypassed the invoice module. Review A/R account transactions.</p>
              {/if}
            </div>
          </div>
        </div>
      {:else}
        <div class="section">
          <p>Integrity check data not available.</p>
        </div>
      {/if}
    </Card>

    <!-- A/R Aging Report -->
    <Card title="Accounts Receivable Aging" padding={false}>
      <div class="report-header">
        <h3>As of {new Date(asOfDate).toLocaleDateString('en-CA')}</h3>
      </div>

      {#if arAging.length === 0}
        <div class="section">
          <p>No outstanding invoices.</p>
        </div>
      {:else}
        <div class="aging-table">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th class="amount">Current</th>
                <th class="amount">1-30 Days</th>
                <th class="amount">31-60 Days</th>
                <th class="amount">61-90 Days</th>
                <th class="amount">Over 90 Days</th>
                <th class="amount">Total</th>
              </tr>
            </thead>
            <tbody>
              {#each arAging as aging}
                <tr>
                  <td><strong>{aging.customer_name}</strong></td>
                  <td class="amount">{aging.current > 0 ? formatCurrency(aging.current) : '-'}</td>
                  <td class="amount" class:warning={aging.days_1_30 > 0}>{aging.days_1_30 > 0 ? formatCurrency(aging.days_1_30) : '-'}</td>
                  <td class="amount" class:warning={aging.days_31_60 > 0}>{aging.days_31_60 > 0 ? formatCurrency(aging.days_31_60) : '-'}</td>
                  <td class="amount" class:danger={aging.days_61_90 > 0}>{aging.days_61_90 > 0 ? formatCurrency(aging.days_61_90) : '-'}</td>
                  <td class="amount" class:danger={aging.days_over_90 > 0}>{aging.days_over_90 > 0 ? formatCurrency(aging.days_over_90) : '-'}</td>
                  <td class="amount"><strong>{formatCurrency(aging.total)}</strong></td>
                </tr>
              {/each}
              <tr class="total-row">
                <td><strong>Totals</strong></td>
                <td class="amount"><strong>{formatCurrency(arAging.reduce((sum, a) => sum + a.current, 0))}</strong></td>
                <td class="amount"><strong>{formatCurrency(arAging.reduce((sum, a) => sum + a.days_1_30, 0))}</strong></td>
                <td class="amount"><strong>{formatCurrency(arAging.reduce((sum, a) => sum + a.days_31_60, 0))}</strong></td>
                <td class="amount"><strong>{formatCurrency(arAging.reduce((sum, a) => sum + a.days_61_90, 0))}</strong></td>
                <td class="amount"><strong>{formatCurrency(arAging.reduce((sum, a) => sum + a.days_over_90, 0))}</strong></td>
                <td class="amount"><strong>{formatCurrency(arAging.reduce((sum, a) => sum + a.total, 0))}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      {/if}
    </Card>

    <!-- A/P Aging Report -->
    <Card title="Accounts Payable Aging" padding={false}>
      <div class="report-header">
        <h3>As of {new Date(asOfDate).toLocaleDateString('en-CA')}</h3>
      </div>

      {#if apAging.length === 0}
        <div class="section">
          <p>No outstanding bills.</p>
        </div>
      {:else}
        <div class="aging-table">
          <table>
            <thead>
              <tr>
                <th>Vendor</th>
                <th class="amount">Current</th>
                <th class="amount">1-30 Days</th>
                <th class="amount">31-60 Days</th>
                <th class="amount">61-90 Days</th>
                <th class="amount">Over 90 Days</th>
                <th class="amount">Total</th>
              </tr>
            </thead>
            <tbody>
              {#each apAging as aging}
                <tr>
                  <td><strong>{aging.vendor_name}</strong></td>
                  <td class="amount">{aging.current > 0 ? formatCurrency(aging.current) : '-'}</td>
                  <td class="amount" class:warning={aging.days_1_30 > 0}>{aging.days_1_30 > 0 ? formatCurrency(aging.days_1_30) : '-'}</td>
                  <td class="amount" class:warning={aging.days_31_60 > 0}>{aging.days_31_60 > 0 ? formatCurrency(aging.days_31_60) : '-'}</td>
                  <td class="amount" class:danger={aging.days_61_90 > 0}>{aging.days_61_90 > 0 ? formatCurrency(aging.days_61_90) : '-'}</td>
                  <td class="amount" class:danger={aging.days_over_90 > 0}>{aging.days_over_90 > 0 ? formatCurrency(aging.days_over_90) : '-'}</td>
                  <td class="amount"><strong>{formatCurrency(aging.total)}</strong></td>
                </tr>
              {/each}
              <tr class="total-row">
                <td><strong>Totals</strong></td>
                <td class="amount"><strong>{formatCurrency(apAging.reduce((sum, a) => sum + a.current, 0))}</strong></td>
                <td class="amount"><strong>{formatCurrency(apAging.reduce((sum, a) => sum + a.days_1_30, 0))}</strong></td>
                <td class="amount"><strong>{formatCurrency(apAging.reduce((sum, a) => sum + a.days_31_60, 0))}</strong></td>
                <td class="amount"><strong>{formatCurrency(apAging.reduce((sum, a) => sum + a.days_61_90, 0))}</strong></td>
                <td class="amount"><strong>{formatCurrency(apAging.reduce((sum, a) => sum + a.days_over_90, 0))}</strong></td>
                <td class="amount"><strong>{formatCurrency(apAging.reduce((sum, a) => sum + a.total, 0))}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      {/if}
    </Card>
  {/if}

  <!-- Inventory Valuation Report -->
  {#if inventoryValuation.length > 0}
    <Card title="Inventory Valuation" padding={false}>
      <div class="report-header">
        <div>
          <h3>Inventory Valuation</h3>
          <p>As of: {asOfDate}</p>
        </div>
        <Button 
          size="sm" 
          onclick={() => {
            const csv = toCSV(
              inventoryValuation.map(item => ({
                SKU: item.sku,
                Item: item.name,
                Quantity: item.quantity.toFixed(2),
                'Avg Cost': formatCurrencyForCSV(item.average_cost),
                'Total Value': formatCurrencyForCSV(item.total_value)
              }))
            );
            downloadCSV(csv, `inventory-valuation-${asOfDate}.csv`);
          }}
        >
          Export CSV
        </Button>
      </div>
      {#if loading}
        <div class="section">Loading...</div>
      {:else}
        <div class="section">
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Item Name</th>
                <th class="amount">Quantity</th>
                <th class="amount">Avg Cost</th>
                <th class="amount">Total Value</th>
              </tr>
            </thead>
            <tbody>
              {#each inventoryValuation as item}
                <tr>
                  <td>{item.sku}</td>
                  <td>{item.name}</td>
                  <td class="amount">{item.quantity.toFixed(2)}</td>
                  <td class="amount">{formatCurrency(item.average_cost)}</td>
                  <td class="amount">{formatCurrency(item.total_value)}</td>
                </tr>
              {/each}
              <tr class="total-row">
                <td colspan="4"><strong>Total Inventory Value</strong></td>
                <td class="amount">
                  <strong>{formatCurrency(inventoryValuation.reduce((sum, i) => sum + i.total_value, 0))}</strong>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      {/if}
    </Card>
  {/if}

  <!-- Inventory Movements Report -->
  {#if inventoryMovements.length > 0}
    <Card title="Inventory Movements" padding={false}>
      <div class="report-header">
        <div>
          <h3>Inventory Movements</h3>
          <p>Period: {incomeStartDate} to {incomeEndDate}</p>
        </div>
        <Button 
          size="sm" 
          onclick={() => {
            const csv = toCSV(
              inventoryMovements.map(mov => ({
                Date: mov.movement_date,
                SKU: mov.item_sku,
                Item: mov.item_name,
                Type: mov.movement_type,
                Quantity: mov.quantity.toFixed(2),
                'Unit Cost': mov.unit_cost ? formatCurrencyForCSV(mov.unit_cost) : '',
                Notes: mov.notes || ''
              }))
            );
            downloadCSV(csv, `inventory-movements-${incomeStartDate}-${incomeEndDate}.csv`);
          }}
        >
          Export CSV
        </Button>
      </div>
      {#if loading}
        <div class="section">Loading...</div>
      {:else}
        <div class="section">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>SKU</th>
                <th>Item Name</th>
                <th>Type</th>
                <th class="amount">Quantity</th>
                <th class="amount">Unit Cost</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {#each inventoryMovements as mov}
                <tr>
                  <td>{mov.movement_date}</td>
                  <td>{mov.item_sku}</td>
                  <td>{mov.item_name}</td>
                  <td class="movement-type-{mov.movement_type}">{mov.movement_type}</td>
                  <td class="amount" class:negative={mov.quantity < 0}>
                    {mov.quantity > 0 ? '+' : ''}{mov.quantity.toFixed(2)}
                  </td>
                  <td class="amount">
                    {mov.unit_cost ? formatCurrency(mov.unit_cost) : '-'}
                  </td>
                  <td>{mov.notes || '-'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
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

  .integrity-grid {
    display: grid;
    gap: 16px;
    padding: 24px;
  }

  .integrity-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .integrity-item .label {
    color: #666;
  }

  .integrity-result {
    padding: 20px;
    border-radius: 8px;
    text-align: center;
    margin-top: 8px;
  }

  .integrity-result.balanced {
    background: #d5f4e6;
    border: 2px solid #27ae60;
  }

  .integrity-result.unbalanced {
    background: #fadbd8;
    border: 2px solid #e74c3c;
  }

  .success-icon {
    font-size: 48px;
    display: block;
    margin-bottom: 8px;
    color: #27ae60;
  }

  .error-icon {
    font-size: 48px;
    display: block;
    margin-bottom: 8px;
  }

  .integrity-result strong {
    display: block;
    font-size: 18px;
    margin-bottom: 8px;
  }

  .integrity-result p {
    margin: 0;
    color: #555;
    font-size: 14px;
  }

  .aging-table {
    overflow-x: auto;
  }

  .aging-table table {
    width: 100%;
    border-collapse: collapse;
  }

  .aging-table th {
    background: #2c3e50;
    color: white;
    padding: 12px;
    text-align: left;
    font-weight: 600;
    font-size: 13px;
  }

  .aging-table td {
    padding: 12px;
    border-bottom: 1px solid #ecf0f1;
    font-size: 14px;
  }

  .aging-table td.danger {
    background: #fadbd8;
    font-weight: 600;
  }

  .aging-table .total-row {
    background: #f8f9fa;
    border-top: 3px double #2c3e50;
  }

  .negative {
    color: #d32f2f;
  }

  .movement-type-purchase {
    color: #4caf50;
    font-weight: 600;
  }

  .movement-type-sale {
    color: #f44336;
    font-weight: 600;
  }

  .movement-type-adjustment {
    color: #ff9800;
    font-weight: 600;
  }

  .movement-type-transfer {
    color: #2196f3;
    font-weight: 600;
  }
</style>
