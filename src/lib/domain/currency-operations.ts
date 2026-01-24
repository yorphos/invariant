/**
 * Currency Operations
 * 
 * Business logic for multi-currency accounting:
 * - Currency management
 * - Exchange rate management
 * - Foreign exchange gain/loss calculations
 * - Multi-currency transaction processing
 * 
 * Accounting Principles:
 * - All amounts stored in home currency (CAD) in the general ledger
 * - Foreign amounts tracked separately for reference and reconciliation
 * - Realized gains/losses: When foreign currency is settled (DR/CR FX Gain/Loss)
 * - Unrealized gains/losses: Period-end revaluation of open balances
 * - Exchange rates locked at transaction time
 * 
 * Formula:
 * Home Amount = Foreign Amount × Exchange Rate
 * FX Gain/Loss = (Settled Rate - Original Rate) × Foreign Amount
 */

import { getDatabase } from '../services/database';
import type { Currency, ExchangeRate, FXGainLoss, MultiCurrencyTransaction } from './types';

export interface CurrencyInput {
  code: string;
  name: string;
  symbol: string;
  decimal_places?: number;
  is_active?: boolean;
}

export interface ExchangeRateInput {
  from_currency_code: string;
  to_currency_code: string;
  rate_date: string;
  rate: number;
  source?: string;
}

export interface FXCalculationResult {
  home_amount: number;
  foreign_amount: number;
  exchange_rate: number;
  gain_loss_amount?: number; // Only for realized transactions
}

/**
 * Get all active currencies
 */
export async function getActiveCurrencies(): Promise<Currency[]> {
  const db = await getDatabase();
  const currencies = await db.select<Currency[]>(
    `SELECT * FROM currency WHERE is_active = 1 ORDER BY code`
  );
  return currencies;
}

/**
 * Get currency by code
 */
export async function getCurrencyByCode(code: string): Promise<Currency | undefined> {
  const db = await getDatabase();
  const currencies = await db.select<Currency[]>(
    `SELECT * FROM currency WHERE code = ?`,
    [code]
  );
  return currencies[0];
}

/**
 * Get home currency (CAD)
 */
export async function getHomeCurrency(): Promise<Currency> {
  const currency = await getCurrencyByCode('CAD');
  if (!currency) {
    throw new Error('Home currency (CAD) not found in database');
  }
  return currency;
}

/**
 * Add a new currency
 */
export async function addCurrency(input: CurrencyInput): Promise<number> {
  const db = await getDatabase();
  
  // Validation
  if (!input.code || input.code.length !== 3) {
    throw new Error('Currency code must be 3 characters (ISO 4217)');
  }
  if (!input.name) {
    throw new Error('Currency name is required');
  }
  if (!input.symbol) {
    throw new Error('Currency symbol is required');
  }

  // Check for duplicate
  const existing = await getCurrencyByCode(input.code);
  if (existing) {
    throw new Error(`Currency ${input.code} already exists`);
  }

  const result = await db.execute(
    `INSERT INTO currency (code, name, symbol, decimal_places, is_active)
     VALUES (?, ?, ?, ?, ?)`,
    [
      input.code.toUpperCase(),
      input.name,
      input.symbol,
      input.decimal_places ?? 2,
      input.is_active ?? true ? 1 : 0,
    ]
  );

  return result.lastInsertId ?? 0;
}

/**
 * Get exchange rate for a date
 * Returns the most recent rate on or before the specified date
 */
export async function getExchangeRate(
  fromCurrencyCode: string,
  toCurrencyCode: string,
  date: string
): Promise<number | undefined> {
  const db = await getDatabase();

  // If same currency, rate is 1.0
  if (fromCurrencyCode === toCurrencyCode) {
    return 1.0;
  }

  const fromCurrency = await getCurrencyByCode(fromCurrencyCode);
  const toCurrency = await getCurrencyByCode(toCurrencyCode);

  if (!fromCurrency || !toCurrency) {
    throw new Error(`Currency not found: ${fromCurrencyCode} or ${toCurrencyCode}`);
  }

  const rates = await db.select<ExchangeRate[]>(
    `SELECT * FROM exchange_rate
     WHERE from_currency_id = ? AND to_currency_id = ?
       AND rate_date <= ?
     ORDER BY rate_date DESC
     LIMIT 1`,
    [fromCurrency.id, toCurrency.id, date]
  );

  return rates[0]?.rate;
}

/**
 * Add exchange rate
 */
export async function addExchangeRate(input: ExchangeRateInput): Promise<number> {
  const db = await getDatabase();

  // Validation
  if (input.rate <= 0) {
    throw new Error('Exchange rate must be positive');
  }
  if (!input.rate_date) {
    throw new Error('Rate date is required');
  }

  const fromCurrency = await getCurrencyByCode(input.from_currency_code);
  const toCurrency = await getCurrencyByCode(input.to_currency_code);

  if (!fromCurrency) {
    throw new Error(`From currency not found: ${input.from_currency_code}`);
  }
  if (!toCurrency) {
    throw new Error(`To currency not found: ${input.to_currency_code}`);
  }

  // Check if rate already exists for this date (update if exists)
  const existing = await db.select<ExchangeRate[]>(
    `SELECT * FROM exchange_rate
     WHERE from_currency_id = ? AND to_currency_id = ? AND rate_date = ?`,
    [fromCurrency.id, toCurrency.id, input.rate_date]
  );

  if (existing.length > 0) {
    // Update existing rate
    await db.execute(
      `UPDATE exchange_rate SET rate = ?, source = ? WHERE id = ?`,
      [input.rate, input.source, existing[0].id]
    );
    return existing[0].id!;
  }

  // Insert new rate
  const result = await db.execute(
    `INSERT INTO exchange_rate (from_currency_id, to_currency_id, rate_date, rate, source)
     VALUES (?, ?, ?, ?, ?)`,
    [fromCurrency.id, toCurrency.id, input.rate_date, input.rate, input.source]
  );

  return result.lastInsertId ?? 0;
}

/**
 * Convert foreign amount to home currency
 */
export function convertToHomeCurrency(
  foreignAmount: number,
  exchangeRate: number
): number {
  return Math.round(foreignAmount * exchangeRate * 100) / 100;
}

/**
 * Convert home amount to foreign currency
 */
export function convertToForeignCurrency(
  homeAmount: number,
  exchangeRate: number
): number {
  if (exchangeRate === 0) {
    throw new Error('Exchange rate cannot be zero');
  }
  return Math.round((homeAmount / exchangeRate) * 100) / 100;
}

/**
 * Calculate realized FX gain/loss
 * Occurs when a foreign currency transaction is settled
 * 
 * Gain/Loss = (Settled Rate - Original Rate) × Foreign Amount
 * Positive = Gain (CR FX Gain), Negative = Loss (DR FX Loss)
 */
export function calculateRealizedFXGainLoss(
  foreignAmount: number,
  originalRate: number,
  settledRate: number
): number {
  const originalHome = foreignAmount * originalRate;
  const settledHome = foreignAmount * settledRate;
  const gainLoss = settledHome - originalHome;
  return Math.round(gainLoss * 100) / 100;
}

/**
 * Calculate unrealized FX gain/loss
 * Period-end revaluation of open foreign currency balances
 * 
 * Unrealized Gain/Loss = (Current Rate - Original Rate) × Foreign Balance
 */
export function calculateUnrealizedFXGainLoss(
  foreignBalance: number,
  originalRate: number,
  currentRate: number
): number {
  const originalHome = foreignBalance * originalRate;
  const currentHome = foreignBalance * currentRate;
  const gainLoss = currentHome - originalHome;
  return Math.round(gainLoss * 100) / 100;
}

/**
 * Record realized FX gain/loss
 */
export async function recordRealizedFXGainLoss(
  accountId: number,
  currencyId: number,
  foreignAmount: number,
  originalRate: number,
  settledRate: number,
  transactionDate: string,
  journalEntryId?: number,
  reference?: string,
  notes?: string
): Promise<number> {
  const db = await getDatabase();

  const gainLossAmount = calculateRealizedFXGainLoss(foreignAmount, originalRate, settledRate);

  if (Math.abs(gainLossAmount) < 0.01) {
    // No significant gain/loss to record
    return 0;
  }

  const homeAmount = convertToHomeCurrency(foreignAmount, settledRate);

  const result = await db.execute(
    `INSERT INTO fx_gain_loss (
      transaction_date, account_id, currency_id,
      foreign_amount, home_amount, exchange_rate, settled_rate,
      gain_loss_amount, gain_loss_type, journal_entry_id, reference, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'realized', ?, ?, ?)`,
    [
      transactionDate,
      accountId,
      currencyId,
      foreignAmount,
      homeAmount,
      originalRate,
      settledRate,
      gainLossAmount,
      journalEntryId,
      reference,
      notes,
    ]
  );

  return result.lastInsertId ?? 0;
}

/**
 * Get FX gain/loss history for an account
 */
export async function getFXGainLossHistory(
  accountId?: number,
  currencyId?: number,
  type?: 'realized' | 'unrealized'
): Promise<FXGainLoss[]> {
  const db = await getDatabase();

  let sql = `SELECT * FROM fx_gain_loss WHERE 1=1`;
  const params: any[] = [];

  if (accountId) {
    sql += ` AND account_id = ?`;
    params.push(accountId);
  }

  if (currencyId) {
    sql += ` AND currency_id = ?`;
    params.push(currencyId);
  }

  if (type) {
    sql += ` AND gain_loss_type = ?`;
    params.push(type);
  }

  sql += ` ORDER BY transaction_date DESC, id DESC`;

  const history = await db.select<FXGainLoss[]>(sql, params);
  return history;
}

/**
 * Validate exchange rate reasonableness
 * Helps catch data entry errors (e.g., inverted rates, decimal point errors)
 */
export function validateExchangeRate(
  fromCurrency: string,
  toCurrency: string,
  rate: number
): { valid: boolean; warning?: string } {
  // Basic validation
  if (rate <= 0) {
    return { valid: false, warning: 'Exchange rate must be positive' };
  }

  // Check for obviously wrong rates (too high or too low)
  if (rate > 1000 || rate < 0.001) {
    return {
      valid: false,
      warning: 'Exchange rate seems unrealistic (too high or too low)',
    };
  }

  // Currency-specific checks (approximate ranges as of 2026)
  const commonRates: { [key: string]: { min: number; max: number } } = {
    'CAD-USD': { min: 0.60, max: 0.85 },
    'USD-CAD': { min: 1.15, max: 1.65 },
    'CAD-EUR': { min: 0.55, max: 0.75 },
    'EUR-CAD': { min: 1.30, max: 1.80 },
    'CAD-GBP': { min: 0.45, max: 0.65 },
    'GBP-CAD': { min: 1.50, max: 2.20 },
  };

  const pair = `${fromCurrency}-${toCurrency}`;
  if (commonRates[pair]) {
    const { min, max } = commonRates[pair];
    if (rate < min || rate > max) {
      return {
        valid: true,
        warning: `Exchange rate ${rate} is outside typical range (${min}-${max}) for ${pair}`,
      };
    }
  }

  return { valid: true };
}
