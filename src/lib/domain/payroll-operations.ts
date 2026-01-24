/**
 * Payroll Operations
 * 
 * Business logic for payroll processing:
 * - Payroll run creation and management
 * - Employee line items with deductions
 * - Canadian tax calculations (CPP, EI, federal income tax)
 * - Payroll posting (DR Salary Expense, CR Cash/Payables)
 * 
 * Accounting Principles:
 * - Payroll run creates journal entry when approved
 * - DR Salary Expense (gross + employer portions)
 * - CR Cash (net pay)
 * - CR CPP Payable, EI Payable, Income Tax Payable (employee + employer portions)
 * - Immutable after posting (void to correct)
 * 
 * Tax Rates (2026 - approximate):
 * - CPP: 5.95% employee, 5.95% employer on pensionable earnings
 * - CPP Basic Exemption: $3,500/year ($292/month, $135/biweekly)
 * - CPP Maximum: $68,500/year
 * - EI: 1.66% employee, 2.32% employer (1.4× employee rate)
 * - EI Maximum: $63,200/year
 * - Federal Income Tax: Simplified progressive rates
 */

import { getDatabase } from '../services/database';
import type { 
  PayrollRun, 
  PayrollLine, 
  PayrollCalculation,
  PolicyContext 
} from '../domain/types';

export interface PayrollRunInput {
  run_number: string;
  period_start: string;
  period_end: string;
  pay_date: string;
}

export interface EmployeePayInput {
  employee_name: string;
  employee_id?: string;
  gross_pay: number;
  other_deductions?: number; // Optional additional deductions (benefits, garnishments, etc.)
  ytd_cpp_pensionable?: number; // Year-to-date CPP pensionable earnings (for max calculation)
  ytd_ei_insurable?: number; // Year-to-date EI insurable earnings (for max calculation)
}

export interface PostingResult {
  ok: boolean;
  warnings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }>;
  payroll_run_id?: number;
  journal_entry_id?: number;
}

/**
 * 2026 Canadian Payroll Tax Rates and Limits
 */
const TAX_RATES_2026 = {
  cpp: {
    employee_rate: 0.0595,
    employer_rate: 0.0595,
    basic_exemption_annual: 3500,
    basic_exemption_monthly: 292,
    basic_exemption_biweekly: 135,
    basic_exemption_weekly: 67,
    maximum_pensionable_annual: 68500,
  },
  ei: {
    employee_rate: 0.0166,
    employer_multiplier: 1.4, // Employer pays 1.4× employee rate
    maximum_insurable_annual: 63200,
  },
  income_tax: {
    // Federal tax brackets 2026 (simplified)
    brackets: [
      { limit: 55867, rate: 0.15 },      // 15% up to $55,867
      { limit: 111733, rate: 0.205 },    // 20.5% up to $111,733
      { limit: 173205, rate: 0.26 },     // 26% up to $173,205
      { limit: 246752, rate: 0.29 },     // 29% up to $246,752
      { limit: Infinity, rate: 0.33 },   // 33% above $246,752
    ],
    basic_personal_amount: 15705, // 2026 federal basic personal amount
  },
};

/**
 * Calculate CPP contribution for a pay period
 * Uses basic exemption and maximum pensionable earnings
 */
export function calculateCPP(
  grossPay: number,
  payPeriodType: 'monthly' | 'biweekly' | 'weekly' = 'biweekly',
  ytdPensionable: number = 0
): { employee: number; employer: number } {
  // Determine basic exemption for period
  let basicExemption: number;
  if (payPeriodType === 'monthly') {
    basicExemption = TAX_RATES_2026.cpp.basic_exemption_monthly;
  } else if (payPeriodType === 'biweekly') {
    basicExemption = TAX_RATES_2026.cpp.basic_exemption_biweekly;
  } else {
    basicExemption = TAX_RATES_2026.cpp.basic_exemption_weekly;
  }

  // Calculate pensionable earnings for this period
  const pensionableEarnings = Math.max(0, grossPay - basicExemption);

  // Check if we've hit the annual maximum
  const remainingPensionable = Math.max(
    0,
    TAX_RATES_2026.cpp.maximum_pensionable_annual - ytdPensionable
  );

  const contributablePay = Math.min(pensionableEarnings, remainingPensionable);

  const employeeContribution = contributablePay * TAX_RATES_2026.cpp.employee_rate;
  const employerContribution = contributablePay * TAX_RATES_2026.cpp.employer_rate;

  return {
    employee: Math.round(employeeContribution * 100) / 100,
    employer: Math.round(employerContribution * 100) / 100,
  };
}

/**
 * Calculate EI contribution for a pay period
 */
export function calculateEI(
  grossPay: number,
  ytdInsurable: number = 0
): { employee: number; employer: number } {
  // Check if we've hit the annual maximum
  const remainingInsurable = Math.max(
    0,
    TAX_RATES_2026.ei.maximum_insurable_annual - ytdInsurable
  );

  const insurablePay = Math.min(grossPay, remainingInsurable);

  const employeeContribution = insurablePay * TAX_RATES_2026.ei.employee_rate;
  const employerContribution = employeeContribution * TAX_RATES_2026.ei.employer_multiplier;

  return {
    employee: Math.round(employeeContribution * 100) / 100,
    employer: Math.round(employerContribution * 100) / 100,
  };
}

/**
 * Calculate federal income tax (simplified progressive calculation)
 * NOTE: This is a simplified calculation. Real payroll requires proper tax tables
 * considering claim codes, provincial tax, etc.
 */
export function calculateIncomeTax(
  grossPay: number,
  payPeriodsPerYear: number = 26 // Biweekly default
): number {
  // Annualize the gross pay
  const annualizedIncome = grossPay * payPeriodsPerYear;

  // Apply basic personal amount (tax-free)
  const taxableIncome = Math.max(0, annualizedIncome - TAX_RATES_2026.income_tax.basic_personal_amount);

  // Calculate tax using progressive brackets
  let tax = 0;
  let previousLimit = 0;

  for (const bracket of TAX_RATES_2026.income_tax.brackets) {
    if (taxableIncome <= previousLimit) break;

    const taxableInBracket = Math.min(taxableIncome, bracket.limit) - previousLimit;
    tax += taxableInBracket * bracket.rate;

    previousLimit = bracket.limit;
  }

  // De-annualize the tax
  const periodTax = tax / payPeriodsPerYear;

  return Math.round(periodTax * 100) / 100;
}

/**
 * Calculate complete payroll for an employee
 */
export function calculatePayroll(
  employee: EmployeePayInput,
  payPeriodType: 'monthly' | 'biweekly' | 'weekly' = 'biweekly'
): PayrollCalculation {
  // Calculate CPP
  const cpp = calculateCPP(
    employee.gross_pay,
    payPeriodType,
    employee.ytd_cpp_pensionable || 0
  );

  // Calculate EI
  const ei = calculateEI(
    employee.gross_pay,
    employee.ytd_ei_insurable || 0
  );

  // Calculate income tax
  const payPeriodsPerYear = payPeriodType === 'monthly' ? 12 : payPeriodType === 'biweekly' ? 26 : 52;
  const incomeTax = calculateIncomeTax(employee.gross_pay, payPeriodsPerYear);

  // Other deductions
  const otherDeductions = employee.other_deductions || 0;

  // Calculate net pay
  const totalDeductions = cpp.employee + ei.employee + incomeTax + otherDeductions;
  const netPay = employee.gross_pay - totalDeductions;

  // Calculate total employer cost
  const totalEmployerCost = employee.gross_pay + cpp.employer + ei.employer;

  return {
    gross_pay: employee.gross_pay,
    cpp_employee: cpp.employee,
    cpp_employer: cpp.employer,
    ei_employee: ei.employee,
    ei_employer: ei.employer,
    income_tax: incomeTax,
    other_deductions: otherDeductions,
    net_pay: Math.round(netPay * 100) / 100,
    total_employer_cost: Math.round(totalEmployerCost * 100) / 100,
  };
}

/**
 * Create a draft payroll run
 */
export async function createPayrollRun(
  runData: PayrollRunInput,
  employees: EmployeePayInput[],
  context: PolicyContext = { mode: 'beginner' }
): Promise<{ payroll_run_id: number }> {
  // Validation
  if (!runData.run_number || runData.run_number.trim() === '') {
    throw new Error('Payroll run number is required');
  }

  if (new Date(runData.period_end) < new Date(runData.period_start)) {
    throw new Error('Period end date must be on or after period start date');
  }

  if (new Date(runData.pay_date) < new Date(runData.period_end)) {
    throw new Error('Pay date should typically be on or after period end date');
  }

  if (employees.length === 0) {
    throw new Error('Payroll run must have at least one employee');
  }

  const db = await getDatabase();

  // Check for duplicate run number
  const existing = await db.select<PayrollRun[]>(
    'SELECT id FROM payroll_run WHERE run_number = ? LIMIT 1',
    [runData.run_number]
  );

  if (existing.length > 0) {
    throw new Error(`Payroll run "${runData.run_number}" already exists`);
  }

  // Calculate payroll for all employees
  const calculations: Array<{ employee: EmployeePayInput; calc: PayrollCalculation }> = [];
  
  for (const employee of employees) {
    if (!employee.employee_name || employee.employee_name.trim() === '') {
      throw new Error('Employee name is required');
    }
    if (employee.gross_pay <= 0) {
      throw new Error(`Gross pay for ${employee.employee_name} must be greater than zero`);
    }

    const calc = calculatePayroll(employee, 'biweekly');
    calculations.push({ employee, calc });
  }

  // Calculate totals
  const totalGross = calculations.reduce((sum, c) => sum + c.calc.gross_pay, 0);
  const totalDeductions = calculations.reduce(
    (sum, c) => sum + c.calc.cpp_employee + c.calc.ei_employee + c.calc.income_tax + c.calc.other_deductions,
    0
  );
  const totalNet = calculations.reduce((sum, c) => sum + c.calc.net_pay, 0);

  // Create payroll run (draft status)
  const runResult = await db.execute(
    `INSERT INTO payroll_run (
      run_number, period_start, period_end, pay_date, status,
      total_gross, total_deductions, total_net,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, datetime('now'), datetime('now'))`,
    [
      runData.run_number,
      runData.period_start,
      runData.period_end,
      runData.pay_date,
      totalGross,
      totalDeductions,
      totalNet,
    ]
  );

  const payrollRunId = runResult.lastInsertId!;

  // Create payroll lines for each employee
  for (const { employee, calc } of calculations) {
    await db.execute(
      `INSERT INTO payroll_line (
        payroll_run_id, employee_name, employee_id,
        gross_pay, cpp_amount, ei_amount, income_tax, other_deductions, net_pay
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        payrollRunId,
        employee.employee_name,
        employee.employee_id || null,
        calc.gross_pay,
        calc.cpp_employee,
        calc.ei_employee,
        calc.income_tax,
        calc.other_deductions,
        calc.net_pay,
      ]
    );
  }

  return { payroll_run_id: payrollRunId };
}

/**
 * Approve and post payroll run
 * Creates journal entry with proper accounting
 */
export async function approvePayrollRun(
  payrollRunId: number,
  cashAccountId: number, // Where to pay from
  salaryExpenseAccountId: number, // Salary expense account
  cppPayableAccountId: number, // CPP payable (liability)
  eiPayableAccountId: number, // EI payable (liability)
  taxPayableAccountId: number, // Income tax payable (liability)
  context: PolicyContext = { mode: 'beginner' }
): Promise<PostingResult> {
  const warnings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }> = [];

  const db = await getDatabase();

  // Get payroll run
  const runs = await db.select<PayrollRun[]>(
    'SELECT * FROM payroll_run WHERE id = ? LIMIT 1',
    [payrollRunId]
  );

  if (runs.length === 0) {
    throw new Error(`Payroll run ${payrollRunId} not found`);
  }

  const run = runs[0];

  if (run.status !== 'draft') {
    throw new Error(`Payroll run ${run.run_number} is not in draft status (current: ${run.status})`);
  }

  // Get payroll lines
  const lines = await db.select<PayrollLine[]>(
    'SELECT * FROM payroll_line WHERE payroll_run_id = ?',
    [payrollRunId]
  );

  if (lines.length === 0) {
    throw new Error('Payroll run has no employee lines');
  }

  // Recalculate totals from lines
  const totalGross = lines.reduce((sum, line) => sum + line.gross_pay, 0);
  const totalCPP = lines.reduce((sum, line) => sum + line.cpp_amount, 0);
  const totalEI = lines.reduce((sum, line) => sum + line.ei_amount, 0);
  const totalIncomeTax = lines.reduce((sum, line) => sum + line.income_tax, 0);
  const totalOtherDeductions = lines.reduce((sum, line) => sum + line.other_deductions, 0);
  const totalNet = lines.reduce((sum, line) => sum + line.net_pay, 0);

  // Calculate employer portions (using same rates)
  let totalCPPEmployer = 0;
  let totalEIEmployer = 0;

  for (const line of lines) {
    // Employer CPP = same as employee
    totalCPPEmployer += line.cpp_amount;
    
    // Employer EI = employee × 1.4
    totalEIEmployer += Math.round(line.ei_amount * TAX_RATES_2026.ei.employer_multiplier * 100) / 100;
  }

  // Create transaction event
  const eventResult = await db.execute(
    `INSERT INTO transaction_event (event_type, description, reference, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [
      'payroll',
      `Payroll run ${run.run_number} for ${run.period_start} to ${run.period_end}`,
      run.run_number,
    ]
  );

  const eventId = eventResult.lastInsertId!;

  // Create journal entry
  const jeResult = await db.execute(
    `INSERT INTO journal_entry (event_id, entry_date, description, reference, status, posted_at, posted_by)
     VALUES (?, ?, ?, ?, 'posted', datetime('now'), 'system')`,
    [
      eventId,
      run.pay_date,
      `Payroll for ${run.period_start} to ${run.period_end}`,
      run.run_number,
    ]
  );

  const journalEntryId = jeResult.lastInsertId!;

  // Post journal lines:
  // DR Salary Expense (gross + employer CPP + employer EI)
  const totalExpense = totalGross + totalCPPEmployer + totalEIEmployer;
  
  await db.execute(
    `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
     VALUES (?, ?, ?, 0.00, ?)`,
    [
      journalEntryId,
      salaryExpenseAccountId,
      totalExpense,
      `Payroll expense - ${run.run_number}`,
    ]
  );

  // CR Cash (net pay to employees)
  await db.execute(
    `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
     VALUES (?, ?, 0.00, ?, ?)`,
    [
      journalEntryId,
      cashAccountId,
      totalNet,
      `Net pay - ${run.run_number}`,
    ]
  );

  // CR CPP Payable (employee + employer portions)
  const totalCPPPayable = totalCPP + totalCPPEmployer;
  await db.execute(
    `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
     VALUES (?, ?, 0.00, ?, ?)`,
    [
      journalEntryId,
      cppPayableAccountId,
      totalCPPPayable,
      `CPP payable - ${run.run_number}`,
    ]
  );

  // CR EI Payable (employee + employer portions)
  const totalEIPayable = totalEI + totalEIEmployer;
  await db.execute(
    `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
     VALUES (?, ?, 0.00, ?, ?)`,
    [
      journalEntryId,
      eiPayableAccountId,
      totalEIPayable,
      `EI payable - ${run.run_number}`,
    ]
  );

  // CR Income Tax Payable
  await db.execute(
    `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
     VALUES (?, ?, 0.00, ?, ?)`,
    [
      journalEntryId,
      taxPayableAccountId,
      totalIncomeTax,
      `Income tax payable - ${run.run_number}`,
    ]
  );

  // CR Other Deductions (if any) - use same tax payable account for simplicity
  if (totalOtherDeductions > 0) {
    await db.execute(
      `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
       VALUES (?, ?, 0.00, ?, ?)`,
      [
        journalEntryId,
        taxPayableAccountId,
        totalOtherDeductions,
        `Other deductions - ${run.run_number}`,
      ]
    );
  }

  // Update payroll run status and event_id
  await db.execute(
    `UPDATE payroll_run 
     SET status = 'approved', event_id = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [eventId, payrollRunId]
  );

  return {
    ok: true,
    warnings,
    payroll_run_id: payrollRunId,
    journal_entry_id: journalEntryId,
  };
}

/**
 * Void a payroll run (if not yet paid)
 */
export async function voidPayrollRun(
  payrollRunId: number,
  context: PolicyContext = { mode: 'beginner' }
): Promise<PostingResult> {
  const warnings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }> = [];

  const db = await getDatabase();

  // Get payroll run
  const runs = await db.select<PayrollRun[]>(
    'SELECT * FROM payroll_run WHERE id = ? LIMIT 1',
    [payrollRunId]
  );

  if (runs.length === 0) {
    throw new Error(`Payroll run ${payrollRunId} not found`);
  }

  const run = runs[0];

  if (run.status === 'void') {
    throw new Error(`Payroll run ${run.run_number} is already voided`);
  }

  if (run.status === 'paid') {
    throw new Error(`Cannot void payroll run ${run.run_number} - it has been paid. Contact your accountant.`);
  }

  // If approved, need to create reversal entry
  if (run.status === 'approved' && run.event_id) {
    // Create reversal transaction event
    const eventResult = await db.execute(
      `INSERT INTO transaction_event (event_type, description, reference, created_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [
        'payroll_void',
        `VOID: Payroll run ${run.run_number}`,
        `VOID-${run.run_number}`,
      ]
    );

    const eventId = eventResult.lastInsertId!;

    // Get original journal entry
    const originalJE = await db.select<{ id: number }[]>(
      'SELECT id FROM journal_entry WHERE event_id = ? LIMIT 1',
      [run.event_id]
    );

    if (originalJE.length > 0) {
      // Get original lines
      const originalLines = await db.select<Array<{
        account_id: number;
        debit_amount: number;
        credit_amount: number;
        description: string;
      }>>(
        'SELECT account_id, debit_amount, credit_amount, description FROM journal_line WHERE journal_entry_id = ?',
        [originalJE[0].id]
      );

      // Create reversal journal entry
      const jeResult = await db.execute(
        `INSERT INTO journal_entry (event_id, entry_date, description, reference, status, posted_at, posted_by)
         VALUES (?, ?, ?, ?, 'posted', datetime('now'), 'system')`,
        [
          eventId,
          run.pay_date,
          `VOID: Payroll for ${run.period_start} to ${run.period_end}`,
          `VOID-${run.run_number}`,
        ]
      );

      const reversalJEId = jeResult.lastInsertId!;

      // Create reversal lines (swap debits and credits)
      for (const line of originalLines) {
        await db.execute(
          `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
           VALUES (?, ?, ?, ?, ?)`,
          [
            reversalJEId,
            line.account_id,
            line.credit_amount, // Swap
            line.debit_amount,  // Swap
            `VOID: ${line.description}`,
          ]
        );
      }
    }
  }

  // Update payroll run status
  await db.execute(
    `UPDATE payroll_run 
     SET status = 'void', updated_at = datetime('now')
     WHERE id = ?`,
    [payrollRunId]
  );

  return {
    ok: true,
    warnings,
    payroll_run_id: payrollRunId,
  };
}
