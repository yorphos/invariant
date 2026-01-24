import { describe, it, expect } from 'vitest';
import {
  convertToHomeCurrency,
  convertToForeignCurrency,
  calculateRealizedFXGainLoss,
  calculateUnrealizedFXGainLoss,
  validateExchangeRate,
} from '../../lib/domain/currency-operations';

/**
 * Multi-Currency Operations Tests
 * 
 * Tests for currency conversion, exchange rate management, and FX gain/loss calculations
 */

describe('Currency Conversion', () => {
  it('should convert foreign amount to home currency correctly', () => {
    const foreignAmount = 1000; // USD
    const exchangeRate = 1.35; // 1 USD = 1.35 CAD
    
    const homeAmount = convertToHomeCurrency(foreignAmount, exchangeRate);
    
    // $1,000 USD × 1.35 = $1,350 CAD
    expect(homeAmount).toBe(1350.00);
  });

  it('should convert home amount to foreign currency correctly', () => {
    const homeAmount = 1350; // CAD
    const exchangeRate = 1.35; // 1 USD = 1.35 CAD
    
    const foreignAmount = convertToForeignCurrency(homeAmount, exchangeRate);
    
    // $1,350 CAD ÷ 1.35 = $1,000 USD
    expect(foreignAmount).toBe(1000.00);
  });

  it('should round conversion results to 2 decimal places', () => {
    const foreignAmount = 999.99;
    const exchangeRate = 1.337; // Odd rate
    
    const homeAmount = convertToHomeCurrency(foreignAmount, exchangeRate);
    
    // Should round to 2 decimal places
    expect(homeAmount).toBe(1336.99);
    expect(homeAmount.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
  });

  it('should handle exchange rate of 1.0 correctly', () => {
    const amount = 1000;
    const rate = 1.0;
    
    const homeAmount = convertToHomeCurrency(amount, rate);
    const foreignAmount = convertToForeignCurrency(amount, rate);
    
    expect(homeAmount).toBe(amount);
    expect(foreignAmount).toBe(amount);
  });

  it('should throw error when converting with zero exchange rate', () => {
    const amount = 1000;
    const zeroRate = 0;
    
    expect(() => convertToForeignCurrency(amount, zeroRate)).toThrow('Exchange rate cannot be zero');
  });

  it('should handle very small amounts correctly', () => {
    const foreignAmount = 0.01;
    const exchangeRate = 1.35;
    
    const homeAmount = convertToHomeCurrency(foreignAmount, exchangeRate);
    
    expect(homeAmount).toBe(0.01); // Rounds to nearest cent
  });

  it('should handle large amounts correctly', () => {
    const foreignAmount = 1000000;
    const exchangeRate = 1.35;
    
    const homeAmount = convertToHomeCurrency(foreignAmount, exchangeRate);
    
    expect(homeAmount).toBe(1350000.00);
  });
});

describe('Realized FX Gain/Loss', () => {
  it('should calculate realized FX gain correctly', () => {
    // Bought at 1.30, sold at 1.35 → Gain
    const foreignAmount = 1000; // USD
    const originalRate = 1.30;
    const settledRate = 1.35;
    
    const gainLoss = calculateRealizedFXGainLoss(foreignAmount, originalRate, settledRate);
    
    // ($1,000 × 1.35) - ($1,000 × 1.30) = $1,350 - $1,300 = $50 gain
    expect(gainLoss).toBe(50.00);
    expect(gainLoss).toBeGreaterThan(0); // Positive = Gain
  });

  it('should calculate realized FX loss correctly', () => {
    // Bought at 1.35, sold at 1.30 → Loss
    const foreignAmount = 1000; // USD
    const originalRate = 1.35;
    const settledRate = 1.30;
    
    const gainLoss = calculateRealizedFXGainLoss(foreignAmount, originalRate, settledRate);
    
    // ($1,000 × 1.30) - ($1,000 × 1.35) = $1,300 - $1,350 = -$50 loss
    expect(gainLoss).toBe(-50.00);
    expect(gainLoss).toBeLessThan(0); // Negative = Loss
  });

  it('should return zero when rates are the same', () => {
    const foreignAmount = 1000;
    const rate = 1.35;
    
    const gainLoss = calculateRealizedFXGainLoss(foreignAmount, rate, rate);
    
    expect(gainLoss).toBe(0.00);
  });

  it('should handle negative foreign amounts (AP scenario)', () => {
    // Accounts Payable: negative balance
    const foreignAmount = -1000; // Owe $1,000 USD
    const originalRate = 1.30; // Booked at 1.30
    const settledRate = 1.35; // Settled at 1.35
    
    const gainLoss = calculateRealizedFXGainLoss(foreignAmount, originalRate, settledRate);
    
    // Paying more CAD than originally booked = Loss
    // (-$1,000 × 1.35) - (-$1,000 × 1.30) = -$1,350 - (-$1,300) = -$50 loss
    expect(gainLoss).toBe(-50.00);
    expect(gainLoss).toBeLessThan(0);
  });

  it('should calculate gain on AP when rate decreases', () => {
    // Owe USD, rate goes down = Pay less CAD = Gain
    const foreignAmount = -1000; // Owe $1,000 USD
    const originalRate = 1.35; // Booked at 1.35
    const settledRate = 1.30; // Settled at 1.30
    
    const gainLoss = calculateRealizedFXGainLoss(foreignAmount, originalRate, settledRate);
    
    // (-$1,000 × 1.30) - (-$1,000 × 1.35) = -$1,300 - (-$1,350) = $50 gain
    expect(gainLoss).toBe(50.00);
    expect(gainLoss).toBeGreaterThan(0);
  });

  it('should round gain/loss to 2 decimal places', () => {
    const foreignAmount = 999.99;
    const originalRate = 1.33333;
    const settledRate = 1.44444;
    
    const gainLoss = calculateRealizedFXGainLoss(foreignAmount, originalRate, settledRate);
    
    // Should round to 2 decimal places
    expect(gainLoss.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
  });
});

describe('Unrealized FX Gain/Loss', () => {
  it('should calculate unrealized FX gain correctly', () => {
    // Foreign currency balance appreciated
    const foreignBalance = 1000; // USD
    const originalRate = 1.30;
    const currentRate = 1.35;
    
    const gainLoss = calculateUnrealizedFXGainLoss(foreignBalance, originalRate, currentRate);
    
    // ($1,000 × 1.35) - ($1,000 × 1.30) = $1,350 - $1,300 = $50 unrealized gain
    expect(gainLoss).toBe(50.00);
    expect(gainLoss).toBeGreaterThan(0);
  });

  it('should calculate unrealized FX loss correctly', () => {
    // Foreign currency balance depreciated
    const foreignBalance = 1000; // USD
    const originalRate = 1.35;
    const currentRate = 1.30;
    
    const gainLoss = calculateUnrealizedFXGainLoss(foreignBalance, originalRate, currentRate);
    
    // ($1,000 × 1.30) - ($1,000 × 1.35) = $1,300 - $1,350 = -$50 unrealized loss
    expect(gainLoss).toBe(-50.00);
    expect(gainLoss).toBeLessThan(0);
  });

  it('should return zero when rates are the same', () => {
    const foreignBalance = 1000;
    const rate = 1.35;
    
    const gainLoss = calculateUnrealizedFXGainLoss(foreignBalance, rate, rate);
    
    expect(gainLoss).toBe(0.00);
  });

  it('should handle zero foreign balance', () => {
    const foreignBalance = 0;
    const originalRate = 1.30;
    const currentRate = 1.35;
    
    const gainLoss = calculateUnrealizedFXGainLoss(foreignBalance, originalRate, currentRate);
    
    expect(gainLoss).toBe(0.00);
  });
});

describe('Exchange Rate Validation', () => {
  it('should accept valid CAD-USD rate', () => {
    const result = validateExchangeRate('CAD', 'USD', 0.74);
    
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('should accept valid USD-CAD rate', () => {
    const result = validateExchangeRate('USD', 'CAD', 1.35);
    
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('should reject negative rates', () => {
    const result = validateExchangeRate('USD', 'CAD', -1.35);
    
    expect(result.valid).toBe(false);
    expect(result.warning).toContain('positive');
  });

  it('should reject zero rate', () => {
    const result = validateExchangeRate('USD', 'CAD', 0);
    
    expect(result.valid).toBe(false);
    expect(result.warning).toContain('positive');
  });

  it('should warn on unrealistically high rates', () => {
    const result = validateExchangeRate('USD', 'CAD', 10000);
    
    expect(result.valid).toBe(false);
    expect(result.warning).toContain('unrealistic');
  });

  it('should warn on unrealistically low rates', () => {
    const result = validateExchangeRate('USD', 'CAD', 0.0001);
    
    expect(result.valid).toBe(false);
    expect(result.warning).toContain('unrealistic');
  });

  it('should warn when CAD-USD rate is outside typical range', () => {
    // CAD-USD should be ~0.60-0.85
    const result = validateExchangeRate('CAD', 'USD', 1.50); // Inverted
    
    expect(result.valid).toBe(true);
    expect(result.warning).toContain('outside typical range');
  });

  it('should warn when USD-CAD rate is outside typical range', () => {
    // USD-CAD should be ~1.15-1.65
    const result = validateExchangeRate('USD', 'CAD', 0.50); // Inverted
    
    expect(result.valid).toBe(true);
    expect(result.warning).toContain('outside typical range');
  });

  it('should accept rates within typical range for CAD-EUR', () => {
    const result = validateExchangeRate('CAD', 'EUR', 0.65);
    
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();
  });

  it('should accept rates for unknown currency pairs', () => {
    // No validation rules for this pair
    const result = validateExchangeRate('AUD', 'NZD', 1.10);
    
    expect(result.valid).toBe(true);
    expect(result.warning).toBeUndefined();
  });
});

describe('Multi-Currency Accounting Principles', () => {
  it('should maintain double-entry when FX gain occurs', () => {
    // Realized FX Gain scenario
    // DR Cash $1,350 (settlement)
    // CR AR $1,300 (original)
    // CR FX Gain $50 (balancing entry)
    
    const foreignAmount = 1000;
    const originalRate = 1.30;
    const settledRate = 1.35;
    
    const originalHome = convertToHomeCurrency(foreignAmount, originalRate);
    const settledHome = convertToHomeCurrency(foreignAmount, settledRate);
    const gainLoss = calculateRealizedFXGainLoss(foreignAmount, originalRate, settledRate);
    
    // Double-entry must balance
    const debit = settledHome; // Cash received
    const credit = originalHome + gainLoss; // AR + FX Gain
    
    expect(debit).toBe(credit);
    expect(Math.abs(debit - credit)).toBeLessThan(0.01); // Tolerance
  });

  it('should maintain double-entry when FX loss occurs', () => {
    // Realized FX Loss scenario
    // DR Cash $1,300 (settlement)
    // DR FX Loss $50 (balancing entry)
    // CR AR $1,350 (original)
    
    const foreignAmount = 1000;
    const originalRate = 1.35;
    const settledRate = 1.30;
    
    const originalHome = convertToHomeCurrency(foreignAmount, originalRate);
    const settledHome = convertToHomeCurrency(foreignAmount, settledRate);
    const gainLoss = calculateRealizedFXGainLoss(foreignAmount, originalRate, settledRate);
    
    // Double-entry must balance
    const debit = settledHome + Math.abs(gainLoss); // Cash + FX Loss
    const credit = originalHome; // AR
    
    expect(debit).toBe(credit);
    expect(Math.abs(debit - credit)).toBeLessThan(0.01); // Tolerance
  });

  it('should handle reciprocal exchange rates correctly', () => {
    // CAD → USD and USD → CAD should be reciprocals
    const cadToUsdRate = 0.74;
    const usdToCadRate = 1 / cadToUsdRate; // ~1.35
    
    const cadAmount = 1000;
    const usdAmount = convertToForeignCurrency(cadAmount, usdToCadRate);
    const backToCad = convertToHomeCurrency(usdAmount, usdToCadRate);
    
    // Round-trip conversion should return to original amount (within rounding)
    expect(Math.abs(cadAmount - backToCad)).toBeLessThan(0.01);
  });

  it('should ensure FX gain increases equity', () => {
    // FX Gain is a credit to income (increases equity)
    const gain = calculateRealizedFXGainLoss(1000, 1.30, 1.35);
    
    expect(gain).toBeGreaterThan(0); // Positive = Credit to FX Gain (income)
  });

  it('should ensure FX loss decreases equity', () => {
    // FX Loss is a debit to expense (decreases equity)
    const loss = calculateRealizedFXGainLoss(1000, 1.35, 1.30);
    
    expect(loss).toBeLessThan(0); // Negative = Debit to FX Loss (expense)
  });
});

describe('Edge Cases', () => {
  it('should handle very small FX gain/loss amounts', () => {
    const foreignAmount = 0.01;
    const originalRate = 1.30;
    const settledRate = 1.31;
    
    const gainLoss = calculateRealizedFXGainLoss(foreignAmount, originalRate, settledRate);
    
    // ($0.01 × 1.31) - ($0.01 × 1.30) = $0.0131 - $0.0130 = $0.0001 → rounds to $0.00
    expect(Math.abs(gainLoss)).toBeLessThan(0.01);
  });

  it('should handle very large foreign amounts', () => {
    const foreignAmount = 10000000; // $10 million USD
    const originalRate = 1.30;
    const settledRate = 1.35;
    
    const gainLoss = calculateRealizedFXGainLoss(foreignAmount, originalRate, settledRate);
    
    // ($10M × 1.35) - ($10M × 1.30) = $13.5M - $13M = $500K gain
    expect(gainLoss).toBe(500000.00);
  });

  it('should handle fractional exchange rates', () => {
    const foreignAmount = 1000;
    const exchangeRate = 1.333333; // Repeating decimal
    
    const homeAmount = convertToHomeCurrency(foreignAmount, exchangeRate);
    
    expect(homeAmount).toBe(1333.33); // Rounded to 2 decimals
  });

  it('should handle exchange rates less than 1.0', () => {
    // CAD → USD (CAD is worth less than USD)
    const cadAmount = 1000;
    const cadToUsdRate = 0.74;
    
    const usdAmount = convertToHomeCurrency(cadAmount, cadToUsdRate);
    
    expect(usdAmount).toBe(740.00);
    expect(usdAmount).toBeLessThan(cadAmount);
  });
});
