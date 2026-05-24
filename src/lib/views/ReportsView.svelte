<script lang="ts">
import { onMount } from 'svelte';
import { getDatabase } from '../services/database';
import {
  getBalanceSheetData,
  getProfitAndLossData,
  getTrialBalanceData,
  getInventoryValuationData,
  getCashFlowData,
  getGeneralLedgerData,
} from '../services/reports';
import {
  getBudgets,
  getBudgetVsActual,
  type BudgetRecord,
  type BudgetVsActualData,
} from '../services/budget';
import type {
  AccountBalance,
  InventoryValuationLine,
  CashFlowData,
  GeneralLedgerLine,
} from '../services/reports';
import type { Account } from '../domain/types';
import { toasts } from '../stores/toast';
import { logger } from '../utils/logger';
import Card from '../ui/Card.svelte';
import Input from '../ui/Input.svelte';
import Select from '../ui/Select.svelte';
import Table from '../ui/Table.svelte';
import Button from '../ui/Button.svelte';
import { toCSV, downloadCSV, formatCurrencyForCSV } from '../utils/csv-export';
import type { CSVRow } from '../utils/csv-export';

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

// Budget vs Actual
let budgetsList: BudgetRecord[] = [];
let selectedBudgetId: number | '' = '';
let bvaStartDate = '';
let bvaEndDate = '';
let budgetVsActualData: BudgetVsActualData | null = null;

// Report type selector: 'all' shows all reports, otherwise specific report
let reportType: 'all' | 'cash-flow' | 'general-ledger' | 'budget-vs-actual' = 'all';

// Cash Flow
let cashFlowData: CashFlowData | null = null;
let cfStartDate = '';
let cfEndDate = '';

// General Ledger
let generalLedgerLines: GeneralLedgerLine[] = [];
let glStartDate = '';
let glEndDate = '';
let glAccountId: number | undefined = undefined;
let glAccounts: Account[] = [];
let glTotalDebits = 0;
let glTotalCredits = 0;
let glStartBalance = 0;
let glEndBalance = 0;

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

  // Default to current month for cash flow and GL
  cfStartDate = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  cfEndDate = today.toISOString().split('T')[0];
  glStartDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]; // YTD
  glEndDate = today.toISOString().split('T')[0];

  // Load accounts for GL filter
  try {
    const db = await getDatabase();
    glAccounts = await db.select<Account[]>(
      'SELECT * FROM account WHERE is_active = 1 ORDER BY code',
    );
  } catch (e) {
    logger.error('Failed to load accounts:', e);
    toasts.error('Failed to load accounts for reports');
  }

  // Set default dates for budget vs actual
  bvaStartDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0]; // YTD
  bvaEndDate = today.toISOString().split('T')[0];

  await loadAllReports();
  await loadBudgetsList();
});

async function loadAllReports() {
  await Promise.all([
    loadBalanceSheet(),
    loadIncomeStatement(),
    loadTrialBalance(),
    loadARIntegrityCheck(),
    loadARAging(),
    loadAPAging(),
  ]);
}

async function loadBalanceSheet() {
  loading = true;
  try {
    // Use optimized service layer with grouped aggregate query
    const data = await getBalanceSheetData(asOfDate);
    balanceSheetBalances = [...data.assets, ...data.liabilities, ...data.equity];
  } catch (e) {
    logger.error('Failed to load balance sheet:', e);
    toasts.error('Failed to load balance sheet: ' + e);
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
    logger.error('Failed to load income statement:', e);
    toasts.error('Failed to load income statement: ' + e);
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
    logger.error('Failed to load trial balance:', e);
    toasts.error('Failed to load trial balance: ' + e);
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
      [asOfDate],
    );

    const subledgerTotal = subledgerResult[0]?.total || 0;

    // Get A/R balance from general ledger
    const accounts = await db.select<Account[]>(
      `SELECT * FROM account WHERE code = '1100' LIMIT 1`,
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
        [accounts[0].id, asOfDate],
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
    logger.error('Failed to load A/R integrity check:', e);
    toasts.error('Failed to load A/R integrity check');
  }
  loading = false;
}

async function loadARAging() {
  loading = true;
  try {
    const db = await getDatabase();

    const invoices = await db.select<
      Array<{
        contact_id: number;
        customer_name: string;
        due_date: string;
        outstanding: number;
      }>
    >(
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
      [asOfDate],
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

    arAging = Array.from(customerMap.values()).sort((a, b) => b.total - a.total); // Sort by total descending
  } catch (e) {
    logger.error('Failed to load A/R aging:', e);
    toasts.error('Failed to load A/R aging report');
  }
  loading = false;
}

async function loadAPAging() {
  loading = true;
  try {
    const db = await getDatabase();

    const bills = await db.select<
      Array<{
        vendor_id: number;
        vendor_name: string;
        due_date: string;
        outstanding: number;
      }>
    >(
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
      [asOfDate],
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

    apAging = Array.from(vendorMap.values()).sort((a, b) => b.total - a.total); // Sort by total descending
  } catch (e) {
    logger.error('Failed to load A/P aging:', e);
    toasts.error('Failed to load A/P aging report');
  }
  loading = false;
}

async function loadBudgetsList() {
  try {
    budgetsList = await getBudgets();
  } catch (e) {
    logger.error('Failed to load budgets:', e);
    toasts.error('Failed to load budgets for budget-vs-actual report');
  }
}

async function loadBudgetVsActual() {
  if (!selectedBudgetId) return;

  loading = true;
  try {
    budgetVsActualData = await getBudgetVsActual(
      Number(selectedBudgetId),
      bvaStartDate,
      bvaEndDate,
    );
  } catch (e) {
    logger.error('Failed to load budget vs actual:', e);
    toasts.error('Failed to load budget vs actual: ' + e);
  }
  loading = false;
}

async function loadCashFlow() {
  loading = true;
  try {
    cashFlowData = await getCashFlowData(cfStartDate, cfEndDate);
  } catch (e) {
    logger.error('Failed to load cash flow:', e);
    toasts.error('Failed to load cash flow: ' + e);
  }
  loading = false;
}

async function loadGeneralLedger() {
  loading = true;
  try {
    const data = await getGeneralLedgerData(glStartDate, glEndDate, glAccountId);
    generalLedgerLines = data.lines;
    glTotalDebits = data.totalDebits;
    glTotalCredits = data.totalCredits;
    glStartBalance = data.startBalance;
    glEndBalance = data.endBalance;
  } catch (e) {
    logger.error('Failed to load general ledger:', e);
    toasts.error('Failed to load general ledger: ' + e);
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
    logger.error('Failed to load inventory valuation:', e);
    toasts.error('Failed to load inventory valuation report');
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
      [incomeStartDate, incomeEndDate],
    );

    inventoryMovements = movements;
  } catch (e) {
    logger.error('Failed to load inventory movements:', e);
    toasts.error('Failed to load inventory movements report');
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

$: if (cfStartDate && cfEndDate) {
  loadCashFlow();
}

$: if (glStartDate && glEndDate) {
  loadGeneralLedger();
}

$: if (selectedBudgetId && bvaStartDate && bvaEndDate) {
  loadBudgetVsActual();
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency',
    currency: 'CAD',
  }).format(amount);
}

// Balance Sheet totals
$: totalAssets = balanceSheetBalances
  .filter((b) => b.account_type === 'asset')
  .reduce((sum, b) => sum + b.balance, 0);

$: totalLiabilities = balanceSheetBalances
  .filter((b) => b.account_type === 'liability')
  .reduce((sum, b) => sum + b.balance, 0);

$: totalEquity = balanceSheetBalances
  .filter((b) => b.account_type === 'equity')
  .reduce((sum, b) => sum + b.balance, 0);

// Income Statement totals (from period-filtered data)
$: totalRevenue = incomeStatementBalances
  .filter((b) => b.account_type === 'revenue')
  .reduce((sum, b) => sum + b.balance, 0);

$: totalExpenses = incomeStatementBalances
  .filter((b) => b.account_type === 'expense')
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
    case 'this-quarter': {
      const quarter = Math.floor(today.getMonth() / 3);
      start = new Date(today.getFullYear(), quarter * 3, 1);
      end = today;
      break;
    }
    case 'last-quarter': {
      const lastQuarter = Math.floor(today.getMonth() / 3) - 1;
      const year = lastQuarter < 0 ? today.getFullYear() - 1 : today.getFullYear();
      const q = lastQuarter < 0 ? 3 : lastQuarter;
      start = new Date(year, q * 3, 1);
      end = new Date(year, q * 3 + 3, 0); // Last day of quarter
      break;
    }
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
    .filter((b) => b.account_type === 'asset')
    .map((b) => ({
      Type: 'Asset',
      Code: b.account_code,
      Account: b.account_name,
      Balance: formatCurrencyForCSV(b.balance),
    }));

  const liabilities = balanceSheetBalances
    .filter((b) => b.account_type === 'liability')
    .map((b) => ({
      Type: 'Liability',
      Code: b.account_code,
      Account: b.account_name,
      Balance: formatCurrencyForCSV(b.balance),
    }));

  const equity = balanceSheetBalances
    .filter((b) => b.account_type === 'equity')
    .map((b) => ({
      Type: 'Equity',
      Code: b.account_code,
      Account: b.account_name,
      Balance: formatCurrencyForCSV(b.balance),
    }));

  // Add totals
  const data = [
    ...assets,
    {
      Type: 'Asset',
      Code: '',
      Account: 'Total Assets',
      Balance: formatCurrencyForCSV(totalAssets),
    },
    { Type: '', Code: '', Account: '', Balance: '' },
    ...liabilities,
    {
      Type: 'Liability',
      Code: '',
      Account: 'Total Liabilities',
      Balance: formatCurrencyForCSV(totalLiabilities),
    },
    { Type: '', Code: '', Account: '', Balance: '' },
    ...equity,
    { Type: 'Equity', Code: '', Account: 'Net Income', Balance: formatCurrencyForCSV(netIncome) },
    {
      Type: 'Equity',
      Code: '',
      Account: 'Total Equity',
      Balance: formatCurrencyForCSV(totalEquity + netIncome),
    },
  ];

  const csv = toCSV(data, ['Type', 'Code', 'Account', 'Balance']);
  downloadCSV(csv, `balance-sheet-${asOfDate}.csv`);
}

function exportProfitLoss() {
  const revenue = incomeStatementBalances
    .filter((b) => b.account_type === 'revenue')
    .map((b) => ({
      Type: 'Revenue',
      Code: b.account_code,
      Account: b.account_name,
      Amount: formatCurrencyForCSV(b.balance),
    }));

  const expenses = incomeStatementBalances
    .filter((b) => b.account_type === 'expense')
    .map((b) => ({
      Type: 'Expense',
      Code: b.account_code,
      Account: b.account_name,
      Amount: formatCurrencyForCSV(b.balance),
    }));

  const data = [
    ...revenue,
    {
      Type: 'Revenue',
      Code: '',
      Account: 'Total Revenue',
      Amount: formatCurrencyForCSV(totalRevenue),
    },
    { Type: '', Code: '', Account: '', Amount: '' },
    ...expenses,
    {
      Type: 'Expense',
      Code: '',
      Account: 'Total Expenses',
      Amount: formatCurrencyForCSV(totalExpenses),
    },
    { Type: '', Code: '', Account: '', Amount: '' },
    { Type: '', Code: '', Account: 'Net Income', Amount: formatCurrencyForCSV(netIncome) },
  ];

  const csv = toCSV(data, ['Type', 'Code', 'Account', 'Amount']);
  downloadCSV(csv, `profit-loss-${incomeStartDate}-to-${incomeEndDate}.csv`);
}

function exportTrialBalance() {
  const data = trialBalances.map((b) => ({
    Code: b.account_code,
    Account: b.account_name,
    Type: b.account_type as string,
    Debit: b.debit_total > b.credit_total ? formatCurrencyForCSV(b.balance) : '0.00',
    Credit: b.credit_total > b.debit_total ? formatCurrencyForCSV(b.balance) : '0.00',
  }));

  // Add totals
  const totalDebits = trialBalances.reduce(
    (sum, b) => sum + (b.debit_total > b.credit_total ? b.balance : 0),
    0,
  );
  const totalCredits = trialBalances.reduce(
    (sum, b) => sum + (b.credit_total > b.debit_total ? b.balance : 0),
    0,
  );

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

function exportCashFlow() {
  if (!cashFlowData) return;

  const rows: CSVRow[] = [];

  rows.push({ Category: 'OPERATING ACTIVITIES', Label: '', Amount: '' });
  for (const op of cashFlowData.operatingActivities) {
    rows.push({
      Category: 'Operating',
      Label: op.label,
      Amount: formatCurrencyForCSV(op.amount),
    });
  }
  rows.push({
    Category: 'Operating',
    Label: 'Total Operating Activities',
    Amount: formatCurrencyForCSV(cashFlowData.totalOperating),
  });
  rows.push({});

  rows.push({ Category: 'INVESTING ACTIVITIES', Label: '', Amount: '' });
  for (const inv of cashFlowData.investingActivities) {
    rows.push({
      Category: 'Investing',
      Label: inv.label,
      Amount: formatCurrencyForCSV(inv.amount),
    });
  }
  rows.push({
    Category: 'Investing',
    Label: 'Total Investing Activities',
    Amount: formatCurrencyForCSV(cashFlowData.totalInvesting),
  });
  rows.push({});

  rows.push({ Category: 'FINANCING ACTIVITIES', Label: '', Amount: '' });
  for (const fin of cashFlowData.financingActivities) {
    rows.push({
      Category: 'Financing',
      Label: fin.label,
      Amount: formatCurrencyForCSV(fin.amount),
    });
  }
  rows.push({
    Category: 'Financing',
    Label: 'Total Financing Activities',
    Amount: formatCurrencyForCSV(cashFlowData.totalFinancing),
  });
  rows.push({});

  rows.push({
    Category: '',
    Label: 'Net Cash Change',
    Amount: formatCurrencyForCSV(cashFlowData.netCashChange),
  });
  rows.push({
    Category: '',
    Label: 'Beginning Cash Balance',
    Amount: formatCurrencyForCSV(cashFlowData.startCashBalance),
  });
  rows.push({
    Category: '',
    Label: 'Ending Cash Balance',
    Amount: formatCurrencyForCSV(cashFlowData.endCashBalance),
  });

  const csv = toCSV(rows, ['Category', 'Label', 'Amount']);
  downloadCSV(csv, `cash-flow-${cfStartDate}-to-${cfEndDate}.csv`);
}

function exportBudgetVsActual() {
  if (!budgetVsActualData) return;

  const data: CSVRow[] = budgetVsActualData.lines.map((line) => ({
    'Account Code': line.account_code,
    'Account Name': line.account_name,
    Type: line.account_type,
    Budget: formatCurrencyForCSV(line.budget_amount),
    Actual: formatCurrencyForCSV(line.actual_amount),
    Variance: formatCurrencyForCSV(line.variance),
    'Variance %': line.variance_pct.toFixed(2) + '%',
  }));

  // Add totals
  data.push({
    'Account Code': '',
    'Account Name': 'Totals',
    Type: '',
    Budget: formatCurrencyForCSV(budgetVsActualData.totalBudget),
    Actual: formatCurrencyForCSV(budgetVsActualData.totalActual),
    Variance: formatCurrencyForCSV(budgetVsActualData.totalVariance),
    'Variance %': '',
  });

  const csv = toCSV(data, [
    'Account Code',
    'Account Name',
    'Type',
    'Budget',
    'Actual',
    'Variance',
    'Variance %',
  ]);
  downloadCSV(csv, `budget-vs-actual-${bvaStartDate}-to-${bvaEndDate}.csv`);
}

function exportGeneralLedger() {
  const data: CSVRow[] = generalLedgerLines.map((line) => ({
    Date: line.entry_date,
    'Entry #': line.journal_entry_id,
    'Account Code': line.account_code,
    'Account Name': line.account_name,
    Description: line.description,
    Debit: formatCurrencyForCSV(line.debit_amount),
    Credit: formatCurrencyForCSV(line.credit_amount),
    'Running Balance': formatCurrencyForCSV(line.running_balance),
  }));

  // Add totals
  data.push({
    Date: '',
    'Entry #': '',
    'Account Code': '',
    'Account Name': '',
    Description: 'Totals',
    Debit: formatCurrencyForCSV(glTotalDebits),
    Credit: formatCurrencyForCSV(glTotalCredits),
    'Running Balance': '',
  });

  const csv = toCSV(data, [
    'Date',
    'Entry #',
    'Account Code',
    'Account Name',
    'Description',
    'Debit',
    'Credit',
    'Running Balance',
  ]);
  downloadCSV(csv, `general-ledger-${glStartDate}-to-${glEndDate}.csv`);
}
</script>

<div class="reports-view">
  <div class="header">
    <h2>Financial Reports</h2>
    <div class="header-controls">
      <div class="report-selector">
        <select bind:value={reportType}>
          <option value="all">All Reports</option>
          <option value="cash-flow">Cash Flow Statement</option>
          <option value="general-ledger">General Ledger Detail</option>
          <option value="budget-vs-actual">Budget vs Actual</option>
        </select>
      </div>
      <div class="date-selector">
        <Input
          type="date"
          label="Balance Sheet Date"
          bind:value={asOfDate}
        />
      </div>
    </div>
  </div>

  {#if loading}
    <Card>
      <p>Loading reports...</p>
    </Card>
  {:else if reportType === 'cash-flow'}
    <!-- Cash Flow Statement -->
    <Card title="Cash Flow Statement" padding={false}>
      <div class="report-header">
        <div>
          <h3>Period: {new Date(cfStartDate).toLocaleDateString('en-CA')} to {new Date(cfEndDate).toLocaleDateString('en-CA')}</h3>
          <div class="date-range-controls">
            <div class="date-inputs">
              <Input
                type="date"
                label="Start Date"
                bind:value={cfStartDate}
              />
              <Input
                type="date"
                label="End Date"
                bind:value={cfEndDate}
              />
            </div>
          </div>
        </div>
        <Button variant="secondary" onclick={exportCashFlow}>Export CSV</Button>
      </div>

      {#if !cashFlowData}
        <div class="section">
          <p>Loading cash flow data...</p>
        </div>
      {:else}
        <div class="cash-flow">
          <div class="section">
            <h4>Operating Activities</h4>
            <Table headers={['Item', 'Amount']}>
              {#each cashFlowData.operatingActivities as item}
                <tr>
                  <td>{item.label}</td>
                  <td class="amount">{formatCurrency(item.amount)}</td>
                </tr>
              {/each}
              <tr class="total-row">
                <td><strong>Total Operating Activities</strong></td>
                <td class="amount"><strong>{formatCurrency(cashFlowData.totalOperating)}</strong></td>
              </tr>
            </Table>
          </div>

          <div class="section">
            <h4>Investing Activities</h4>
            <Table headers={['Item', 'Amount']}>
              {#each cashFlowData.investingActivities as item}
                <tr>
                  <td>{item.label}</td>
                  <td class="amount">{formatCurrency(item.amount)}</td>
                </tr>
              {/each}
              <tr class="total-row">
                <td><strong>Total Investing Activities</strong></td>
                <td class="amount"><strong>{formatCurrency(cashFlowData.totalInvesting)}</strong></td>
              </tr>
            </Table>
          </div>

          <div class="section">
            <h4>Financing Activities</h4>
            <Table headers={['Item', 'Amount']}>
              {#each cashFlowData.financingActivities as item}
                <tr>
                  <td>{item.label}</td>
                  <td class="amount">{formatCurrency(item.amount)}</td>
                </tr>
              {/each}
              <tr class="total-row">
                <td><strong>Total Financing Activities</strong></td>
                <td class="amount"><strong>{formatCurrency(cashFlowData.totalFinancing)}</strong></td>
              </tr>
            </Table>
          </div>

          <div class="cash-flow-summary">
            <div class="summary-grid">
              <div class="summary-item">
                <span>Net Cash Change</span>
                <strong class:positive={cashFlowData.netCashChange >= 0} class:negative={cashFlowData.netCashChange < 0}>
                  {formatCurrency(cashFlowData.netCashChange)}
                </strong>
              </div>
              <div class="summary-item">
                <span>Beginning Cash Balance</span>
                <strong>{formatCurrency(cashFlowData.startCashBalance)}</strong>
              </div>
              <div class="summary-item highlight">
                <span>Ending Cash Balance</span>
                <strong>{formatCurrency(cashFlowData.endCashBalance)}</strong>
              </div>
            </div>
          </div>
        </div>
      {/if}
    </Card>

  {:else if reportType === 'general-ledger'}
    <!-- General Ledger Detail -->
    <Card title="General Ledger Detail" padding={false}>
      <div class="report-header">
        <div>
          <h3>Period: {new Date(glStartDate).toLocaleDateString('en-CA')} to {new Date(glEndDate).toLocaleDateString('en-CA')}</h3>
          <div class="date-range-controls">
            <div class="date-inputs">
              <Input
                type="date"
                label="Start Date"
                bind:value={glStartDate}
              />
              <Input
                type="date"
                label="End Date"
                bind:value={glEndDate}
              />
            </div>
            <div class="account-filter">
              <select bind:value={glAccountId}>
                <option value={undefined}>All Accounts</option>
                {#each glAccounts as account}
                  <option value={account.id}>{account.code} - {account.name}</option>
                {/each}
              </select>
            </div>
          </div>
        </div>
        <Button variant="secondary" onclick={exportGeneralLedger}>Export CSV</Button>
      </div>

      {#if generalLedgerLines.length === 0}
        <div class="section">
          <p>No journal entries found for the selected period.</p>
        </div>
      {:else}
        <div class="gl-detail-summary">
          <div class="gl-balance-info">
            <span>Opening Balance: {formatCurrency(glStartBalance)}</span>
            <span>Total Debits: {formatCurrency(glTotalDebits)}</span>
            <span>Total Credits: {formatCurrency(glTotalCredits)}</span>
            <span>Closing Balance: {formatCurrency(glEndBalance)}</span>
          </div>
        </div>
        <div class="gl-table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Entry #</th>
                <th>Account</th>
                <th>Description</th>
                <th class="amount">Debit</th>
                <th class="amount">Credit</th>
                <th class="amount">Running Balance</th>
              </tr>
            </thead>
            <tbody>
              {#each generalLedgerLines as line}
                <tr>
                  <td>{line.entry_date}</td>
                  <td>{line.journal_entry_id}</td>
                  <td>{line.account_code} - {line.account_name}</td>
                  <td>{line.description}</td>
                  <td class="amount">{line.debit_amount > 0 ? formatCurrency(line.debit_amount) : '-'}</td>
                  <td class="amount">{line.credit_amount > 0 ? formatCurrency(line.credit_amount) : '-'}</td>
                  <td class="amount">{formatCurrency(line.running_balance)}</td>
                </tr>
              {/each}
              <tr class="total-row">
                <td colspan="4"><strong>Totals</strong></td>
                <td class="amount"><strong>{formatCurrency(glTotalDebits)}</strong></td>
                <td class="amount"><strong>{formatCurrency(glTotalCredits)}</strong></td>
                <td class="amount"><strong>{formatCurrency(glEndBalance)}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      {/if}
    </Card>

  {:else if reportType === 'budget-vs-actual'}
    <!-- Budget vs Actual -->
    <Card title="Budget vs Actual" padding={false}>
      <div class="report-header">
        <div>
          <h3>Budget vs Actual Comparison</h3>
          <div class="date-range-controls">
            <div class="date-inputs">
              <Select
                label="Budget"
                bind:value={selectedBudgetId}
                options={budgetsList.map(b => ({ value: b.id, label: `${b.name} (FY ${b.fiscal_year})` }))}
              />
              <Input
                type="date"
                label="Actuals Start"
                bind:value={bvaStartDate}
              />
              <Input
                type="date"
                label="Actuals End"
                bind:value={bvaEndDate}
              />
            </div>
          </div>
        </div>
        <Button variant="secondary" onclick={exportBudgetVsActual}>Export CSV</Button>
      </div>

      {#if !budgetVsActualData}
        <div class="section">
          <p>Select a budget and date range to compare.</p>
        </div>
      {:else if budgetVsActualData.lines.length === 0}
        <div class="section">
          <p>No budget lines found for the selected budget.</p>
        </div>
      {:else}
        <div class="section">
          <div class="bva-info">
            <strong>{budgetVsActualData.budgetName}</strong>
            <span>FY {budgetVsActualData.fiscalYear}</span>
            <span>{budgetVsActualData.periodType}</span>
          </div>
          <div class="bva-table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Account</th>
                  <th class="amount">Budget</th>
                  <th class="amount">Actual</th>
                  <th class="amount">Variance</th>
                  <th class="amount">Variance %</th>
                </tr>
              </thead>
              <tbody>
                {#each budgetVsActualData.lines as line}
                  <tr>
                    <td>{line.account_code} - {line.account_name}</td>
                    <td class="amount">{formatCurrency(line.budget_amount)}</td>
                    <td class="amount">{formatCurrency(line.actual_amount)}</td>
                    <td class="amount" class:positive={line.variance > 0} class:negative={line.variance < 0}>
                      {formatCurrency(line.variance)}
                    </td>
                    <td class="amount" class:positive={line.variance > 0} class:negative={line.variance < 0}>
                      {line.variance_pct.toFixed(2)}%
                    </td>
                  </tr>
                {/each}
              </tbody>
              <tfoot>
                <tr class="total-row">
                  <td><strong>Total</strong></td>
                  <td class="amount"><strong>{formatCurrency(budgetVsActualData.totalBudget)}</strong></td>
                  <td class="amount"><strong>{formatCurrency(budgetVsActualData.totalActual)}</strong></td>
                  <td class="amount" class:positive={budgetVsActualData.totalVariance > 0} class:negative={budgetVsActualData.totalVariance < 0}>
                    <strong>{formatCurrency(budgetVsActualData.totalVariance)}</strong>
                  </td>
                  <td class="amount"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      {/if}
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

  .header-controls {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .report-selector select {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    font-family: inherit;
    color: #2c3e50;
    background: white;
    cursor: pointer;
  }

  .report-selector select:focus {
    outline: none;
    border-color: #3498db;
  }

  .cash-flow-summary {
    padding: 24px;
    border-top: 2px solid #2c3e50;
  }

  .summary-grid {
    display: grid;
    gap: 12px;
  }

  .summary-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .summary-item.highlight {
    background: #d5f4e6;
    border: 2px solid #27ae60;
    font-size: 16px;
  }

  .summary-item span {
    color: #555;
  }

  .positive {
    color: #27ae60;
  }

  .gl-detail-summary {
    padding: 16px 24px;
    border-bottom: 1px solid #ecf0f1;
  }

  .gl-balance-info {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }

  .gl-balance-info span {
    padding: 8px 16px;
    background: #f8f9fa;
    border-radius: 6px;
    font-size: 14px;
    color: #555;
  }

  .gl-table-wrapper {
    overflow-x: auto;
  }

  .gl-table-wrapper table {
    width: 100%;
    border-collapse: collapse;
  }

  .gl-table-wrapper th {
    background: #2c3e50;
    color: white;
    padding: 12px;
    text-align: left;
    font-weight: 600;
    font-size: 13px;
  }

  .gl-table-wrapper td {
    padding: 10px 12px;
    border-bottom: 1px solid #ecf0f1;
    font-size: 13px;
  }

  .gl-table-wrapper .total-row {
    background: #f8f9fa;
    border-top: 3px double #2c3e50;
  }

  .account-filter select {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    font-family: inherit;
    color: #2c3e50;
    background: white;
    cursor: pointer;
    min-width: 250px;
  }

  .account-filter select:focus {
    outline: none;
    border-color: #3498db;
  }

  .bva-info {
    display: flex;
    gap: 12px;
    align-items: center;
    margin-bottom: 16px;
    padding: 8px 12px;
    background: #f8f9fa;
    border-radius: 6px;
  }

  .bva-info strong {
    color: #2c3e50;
  }

  .bva-info span {
    color: #7f8c8d;
    font-size: 13px;
  }

  .bva-table-wrapper {
    overflow-x: auto;
  }

  .bva-table-wrapper table {
    width: 100%;
    border-collapse: collapse;
  }

  .bva-table-wrapper th,
  .bva-table-wrapper td {
    padding: 8px 12px;
    border: 1px solid #ecf0f1;
    text-align: left;
  }

  .bva-table-wrapper thead th {
    background: #f8f9fa;
    font-weight: 600;
    color: #2c3e50;
  }

  td.positive {
    color: #27ae60;
  }

  td.negative {
    color: #e74c3c;
  }
</style>
