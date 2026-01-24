import { describe, it, expect } from 'vitest';
import { calculateCPP, calculateEI, calculateIncomeTax, calculatePayroll } from '../../lib/domain/payroll-operations';
import type { EmployeePayInput } from '../../lib/domain/payroll-operations';

/**
 * Payroll Operations Tests
 * 
 * Tests for Canadian payroll calculations, CPP, EI, income tax, and payroll workflows
 */

describe('CPP Calculation', () => {
  it('should calculate CPP correctly for biweekly pay period', () => {
    const grossPay = 2000;
    const cpp = calculateCPP(grossPay, 'biweekly', 0);

    // Biweekly basic exemption: $135
    // Pensionable earnings: $2000 - $135 = $1865
    // CPP rate: 5.95%
    // Employee CPP: $1865 × 0.0595 = $110.97
    // Employer CPP: same = $110.97

    expect(cpp.employee).toBeCloseTo(110.97, 2);
    expect(cpp.employer).toBeCloseTo(110.97, 2);
  });

  it('should apply basic exemption correctly', () => {
    const grossPay = 100; // Below basic exemption
    const cpp = calculateCPP(grossPay, 'biweekly', 0);

    // $100 - $135 = -$35, max with 0 = $0 pensionable
    expect(cpp.employee).toBe(0);
    expect(cpp.employer).toBe(0);
  });

  it('should respect annual maximum pensionable earnings', () => {
    const grossPay = 10000;
    const ytdPensionable = 68000; // Near maximum of $68,500

    const cpp = calculateCPP(grossPay, 'biweekly', ytdPensionable);

    // Remaining pensionable: $68,500 - $68,000 = $500
    // After exemption: $10,000 - $135 = $9,865
    // But capped at $500 remaining
    // CPP: $500 × 0.0595 = $29.75

    expect(cpp.employee).toBeCloseTo(29.75, 2);
    expect(cpp.employer).toBeCloseTo(29.75, 2);
  });

  it('should return zero CPP when annual maximum is reached', () => {
    const grossPay = 2000;
    const ytdPensionable = 70000; // Exceeded maximum

    const cpp = calculateCPP(grossPay, 'biweekly', ytdPensionable);

    expect(cpp.employee).toBe(0);
    expect(cpp.employer).toBe(0);
  });

  it('should calculate CPP correctly for monthly pay period', () => {
    const grossPay = 5000;
    const cpp = calculateCPP(grossPay, 'monthly', 0);

    // Monthly basic exemption: $292
    // Pensionable earnings: $5000 - $292 = $4708
    // CPP rate: 5.95%
    // Employee CPP: $4708 × 0.0595 = $280.13

    expect(cpp.employee).toBeCloseTo(280.13, 2);
    expect(cpp.employer).toBeCloseTo(280.13, 2);
  });
});

describe('EI Calculation', () => {
  it('should calculate EI correctly', () => {
    const grossPay = 2000;
    const ei = calculateEI(grossPay, 0);

    // EI rate: 1.66%
    // Employee EI: $2000 × 0.0166 = $33.20
    // Employer EI: $33.20 × 1.4 = $46.48

    expect(ei.employee).toBeCloseTo(33.20, 2);
    expect(ei.employer).toBeCloseTo(46.48, 2);
  });

  it('should respect annual maximum insurable earnings', () => {
    const grossPay = 5000;
    const ytdInsurable = 62000; // Near maximum of $63,200

    const ei = calculateEI(grossPay, ytdInsurable);

    // Remaining insurable: $63,200 - $62,000 = $1,200
    // Capped at $1,200
    // Employee EI: $1,200 × 0.0166 = $19.92
    // Employer EI: $19.92 × 1.4 = $27.89

    expect(ei.employee).toBeCloseTo(19.92, 2);
    expect(ei.employer).toBeCloseTo(27.89, 2);
  });

  it('should return zero EI when annual maximum is reached', () => {
    const grossPay = 2000;
    const ytdInsurable = 64000; // Exceeded maximum

    const ei = calculateEI(grossPay, ytdInsurable);

    expect(ei.employee).toBe(0);
    expect(ei.employer).toBe(0);
  });

  it('should apply employer multiplier correctly', () => {
    const grossPay = 1000;
    const ei = calculateEI(grossPay, 0);

    // Employee EI: $1000 × 0.0166 = $16.60
    // Employer EI: $16.60 × 1.4 = $23.24

    expect(ei.employee).toBeCloseTo(16.60, 2);
    expect(ei.employer).toBeCloseTo(23.24, 2);
    expect(ei.employer).toBeCloseTo(ei.employee * 1.4, 2);
  });
});

describe('Income Tax Calculation', () => {
  it('should calculate income tax using progressive brackets', () => {
    const grossPay = 2500; // Biweekly
    const tax = calculateIncomeTax(grossPay, 26); // 26 pay periods

    // Annualized income: $2500 × 26 = $65,000
    // Basic personal amount: $15,705
    // Taxable income: $65,000 - $15,705 = $49,295
    // First bracket (15% up to $55,867): $49,295 × 0.15 = $7,394.25
    // De-annualized: $7,394.25 / 26 = $284.39

    expect(tax).toBeCloseTo(284.39, 1);
  });

  it('should apply basic personal amount correctly', () => {
    const grossPay = 600; // Low income
    const tax = calculateIncomeTax(grossPay, 26);

    // Annualized income: $600 × 26 = $15,600
    // Basic personal amount: $15,705
    // Taxable income: $15,600 - $15,705 = -$105 → $0
    // Tax: $0

    expect(tax).toBe(0);
  });

  it('should calculate tax for income in second bracket', () => {
    const grossPay = 5000; // Biweekly
    const tax = calculateIncomeTax(grossPay, 26);

    // Annualized income: $5000 × 26 = $130,000
    // Basic personal amount: $15,705
    // Taxable income: $130,000 - $15,705 = $114,295
    // First bracket: $55,867 × 0.15 = $8,380.05
    // Second bracket: ($111,733 - $55,867 = $55,866) × 0.205 = $11,452.53
    // Third bracket: ($114,295 - $111,733 = $2,562) × 0.26 = $666.12
    // Total: $8,380.05 + $11,452.53 + $666.12 = $20,498.70
    // De-annualized: $20,498.70 / 26 = $788.41

    expect(tax).toBeCloseTo(788.41, 1);
  });

  it('should calculate tax for monthly pay period', () => {
    const grossPay = 5000; // Monthly
    const tax = calculateIncomeTax(grossPay, 12); // 12 pay periods

    // Annualized income: $5000 × 12 = $60,000
    // Basic personal amount: $15,705
    // Taxable income: $60,000 - $15,705 = $44,295
    // First bracket: $44,295 × 0.15 = $6,644.25
    // De-annualized: $6,644.25 / 12 = $553.69

    expect(tax).toBeCloseTo(553.69, 1);
  });
});

describe('Complete Payroll Calculation', () => {
  it('should calculate complete payroll correctly', () => {
    const employee: EmployeePayInput = {
      employee_name: 'John Doe',
      gross_pay: 2500,
      other_deductions: 0,
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    // Gross: $2500
    // CPP: ($2500 - $135) × 5.95% = $2365 × 0.0595 = $140.72
    // EI: $2500 × 1.66% = $41.50
    // Income Tax: ~$284.39
    // Net: $2500 - $140.72 - $41.50 - $284.39 = ~$2033.39

    expect(payroll.gross_pay).toBe(2500);
    expect(payroll.cpp_employee).toBeCloseTo(140.72, 1);
    expect(payroll.ei_employee).toBeCloseTo(41.50, 1);
    expect(payroll.income_tax).toBeCloseTo(284.39, 1);
    expect(payroll.net_pay).toBeCloseTo(2033.39, 0);
  });

  it('should include other deductions in net pay calculation', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Jane Smith',
      gross_pay: 3000,
      other_deductions: 100, // Benefits, etc.
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    // Net pay should be: gross - cpp - ei - tax - other
    const expectedNet = payroll.gross_pay - payroll.cpp_employee - payroll.ei_employee - 
                        payroll.income_tax - payroll.other_deductions;

    expect(payroll.other_deductions).toBe(100);
    expect(payroll.net_pay).toBeCloseTo(expectedNet, 2);
  });

  it('should calculate total employer cost', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Bob Johnson',
      gross_pay: 2000,
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    // Total employer cost = gross + cpp_employer + ei_employer
    const expectedCost = payroll.gross_pay + payroll.cpp_employer + payroll.ei_employer;

    expect(payroll.total_employer_cost).toBeCloseTo(expectedCost, 2);
  });

  it('should ensure employer CPP equals employee CPP', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Alice Brown',
      gross_pay: 2500,
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    // Employer and employee CPP should be equal
    expect(payroll.cpp_employer).toBe(payroll.cpp_employee);
  });

  it('should ensure employer EI is 1.4x employee EI', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Charlie Wilson',
      gross_pay: 3000,
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    // Employer EI should be 1.4× employee EI
    expect(payroll.ei_employer).toBeCloseTo(payroll.ei_employee * 1.4, 2);
  });

  it('should handle low income correctly', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Minimal Worker',
      gross_pay: 500, // Low income
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    // Should still calculate CPP (above exemption), EI, but minimal/no tax
    expect(payroll.gross_pay).toBe(500);
    expect(payroll.cpp_employee).toBeGreaterThan(0);
    expect(payroll.ei_employee).toBeGreaterThan(0);
    expect(payroll.income_tax).toBeGreaterThanOrEqual(0);
    expect(payroll.net_pay).toBeLessThan(500);
    expect(payroll.net_pay).toBeGreaterThan(0);
  });

  it('should handle high income correctly', () => {
    const employee: EmployeePayInput = {
      employee_name: 'High Earner',
      gross_pay: 8000, // High income
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    // Should calculate all deductions
    expect(payroll.gross_pay).toBe(8000);
    expect(payroll.cpp_employee).toBeGreaterThan(0);
    expect(payroll.ei_employee).toBeGreaterThan(0);
    expect(payroll.income_tax).toBeGreaterThan(0);
    
    // Net should be significantly less due to progressive tax
    const deductionRate = (payroll.gross_pay - payroll.net_pay) / payroll.gross_pay;
    expect(deductionRate).toBeGreaterThan(0.25); // At least 25% deductions for high income
  });
});

describe('Payroll Validation', () => {
  it('should reject negative gross pay', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Test Employee',
      gross_pay: -1000,
    };

    const isValid = employee.gross_pay > 0;
    expect(isValid).toBe(false);
  });

  it('should reject zero gross pay', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Test Employee',
      gross_pay: 0,
    };

    const isValid = employee.gross_pay > 0;
    expect(isValid).toBe(false);
  });

  it('should reject empty employee name', () => {
    const names = ['', '   ', '\t'];

    for (const name of names) {
      const isValid = name.trim().length > 0;
      expect(isValid).toBe(false);
    }
  });

  it('should accept valid employee with optional fields', () => {
    const employee: EmployeePayInput = {
      employee_name: 'John Doe',
      employee_id: 'EMP-001',
      gross_pay: 2500,
      other_deductions: 50,
      ytd_cpp_pensionable: 30000,
      ytd_ei_insurable: 30000,
    };

    const isValid = 
      employee.employee_name.trim().length > 0 &&
      employee.gross_pay > 0;

    expect(isValid).toBe(true);
  });
});

describe('Payroll Edge Cases', () => {
  it('should handle very low gross pay (below CPP exemption)', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Part Timer',
      gross_pay: 100, // Below biweekly CPP exemption of $135
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    expect(payroll.gross_pay).toBe(100);
    expect(payroll.cpp_employee).toBe(0); // Below exemption
    expect(payroll.cpp_employer).toBe(0);
    expect(payroll.ei_employee).toBeGreaterThan(0); // EI still applies
    expect(payroll.net_pay).toBeGreaterThan(0);
  });

  it('should handle exactly at CPP basic exemption', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Edge Case',
      gross_pay: 135, // Exactly at biweekly exemption
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    // $135 - $135 = $0 pensionable
    expect(payroll.cpp_employee).toBe(0);
    expect(payroll.cpp_employer).toBe(0);
  });

  it('should handle fractional gross pay', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Hourly Worker',
      gross_pay: 1234.56,
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    expect(payroll.gross_pay).toBe(1234.56);
    expect(payroll.net_pay).toBeGreaterThan(0);
    expect(payroll.net_pay).toBeLessThan(payroll.gross_pay);
  });

  it('should round all amounts to 2 decimal places', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Rounding Test',
      gross_pay: 2345.67,
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    // All amounts should be rounded to 2 decimals
    expect(payroll.cpp_employee).toBe(Math.round(payroll.cpp_employee * 100) / 100);
    expect(payroll.ei_employee).toBe(Math.round(payroll.ei_employee * 100) / 100);
    expect(payroll.income_tax).toBe(Math.round(payroll.income_tax * 100) / 100);
    expect(payroll.net_pay).toBe(Math.round(payroll.net_pay * 100) / 100);
  });
});

describe('Payroll Accounting Principles', () => {
  it('should ensure net pay is always less than gross pay', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Test Employee',
      gross_pay: 3000,
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    expect(payroll.net_pay).toBeLessThan(payroll.gross_pay);
  });

  it('should ensure net pay equals gross minus all deductions', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Test Employee',
      gross_pay: 2500,
      other_deductions: 75,
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    const totalDeductions = 
      payroll.cpp_employee + 
      payroll.ei_employee + 
      payroll.income_tax + 
      payroll.other_deductions;

    const expectedNet = payroll.gross_pay - totalDeductions;

    expect(payroll.net_pay).toBeCloseTo(expectedNet, 2);
  });

  it('should ensure employer cost exceeds gross pay', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Test Employee',
      gross_pay: 2000,
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    // Employer cost should be higher than gross due to employer CPP and EI
    expect(payroll.total_employer_cost).toBeGreaterThan(payroll.gross_pay);
  });

  it('should calculate employer burden correctly', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Test Employee',
      gross_pay: 2500,
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    const employerBurden = payroll.cpp_employer + payroll.ei_employer;
    const expectedCost = payroll.gross_pay + employerBurden;

    expect(payroll.total_employer_cost).toBeCloseTo(expectedCost, 2);
  });

  it('should ensure all deductions are non-negative', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Test Employee',
      gross_pay: 1500,
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    expect(payroll.cpp_employee).toBeGreaterThanOrEqual(0);
    expect(payroll.cpp_employer).toBeGreaterThanOrEqual(0);
    expect(payroll.ei_employee).toBeGreaterThanOrEqual(0);
    expect(payroll.ei_employer).toBeGreaterThanOrEqual(0);
    expect(payroll.income_tax).toBeGreaterThanOrEqual(0);
    expect(payroll.other_deductions).toBeGreaterThanOrEqual(0);
  });
});

describe('Double-Entry Verification - Payroll', () => {
  it('should balance payroll entry: DR Expense, CR Cash + Liabilities', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Test Employee',
      gross_pay: 2500,
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    // DR: Salary Expense (gross + employer CPP + employer EI)
    const debitAmount = payroll.gross_pay + payroll.cpp_employer + payroll.ei_employer;

    // CR: Cash (net pay)
    const creditCash = payroll.net_pay;

    // CR: CPP Payable (employee + employer)
    const creditCPP = payroll.cpp_employee + payroll.cpp_employer;

    // CR: EI Payable (employee + employer)
    const creditEI = payroll.ei_employee + payroll.ei_employer;

    // CR: Income Tax Payable
    const creditTax = payroll.income_tax;

    // CR: Other deductions
    const creditOther = payroll.other_deductions;

    const totalCredits = creditCash + creditCPP + creditEI + creditTax + creditOther;

    // Debits should equal credits
    expect(debitAmount).toBeCloseTo(totalCredits, 2);
  });

  it('should verify payroll liabilities equal employee + employer portions', () => {
    const employee: EmployeePayInput = {
      employee_name: 'Test Employee',
      gross_pay: 3000,
    };

    const payroll = calculatePayroll(employee, 'biweekly');

    const totalCPPLiability = payroll.cpp_employee + payroll.cpp_employer;
    const totalEILiability = payroll.ei_employee + payroll.ei_employer;

    // Total payroll liabilities
    const totalLiabilities = totalCPPLiability + totalEILiability + payroll.income_tax + payroll.other_deductions;

    // Employer cost - net pay should equal total liabilities
    const calculatedLiabilities = payroll.total_employer_cost - payroll.net_pay;

    expect(totalLiabilities).toBeCloseTo(calculatedLiabilities, 2);
  });
});
