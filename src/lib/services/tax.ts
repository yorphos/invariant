/**
 * Tax Service
 * 
 * Handles tax code and tax rate lookups
 */

import { getDatabase } from './database';
import type { TaxCode, TaxRate } from '../domain/types';

/**
 * Get all active tax codes
 */
export async function getTaxCodes(): Promise<TaxCode[]> {
  const db = await getDatabase();
  return db.select<TaxCode[]>(
    'SELECT * FROM tax_code WHERE is_active = 1 ORDER BY code'
  );
}

/**
 * Get a specific tax code by ID
 */
export async function getTaxCodeById(id: number): Promise<TaxCode | null> {
  const db = await getDatabase();
  const results = await db.select<TaxCode[]>(
    'SELECT * FROM tax_code WHERE id = ?',
    [id]
  );
  return results[0] || null;
}

/**
 * Get the effective tax rate for a tax code on a specific date
 */
export async function getTaxRate(taxCodeId: number, effectiveDate: string): Promise<TaxRate | null> {
  const db = await getDatabase();
  
  const results = await db.select<TaxRate[]>(
    `SELECT * FROM tax_rate 
     WHERE tax_code_id = ? 
     AND effective_from <= ?
     AND (effective_to IS NULL OR effective_to >= ?)
     ORDER BY effective_from DESC
     LIMIT 1`,
    [taxCodeId, effectiveDate, effectiveDate]
  );
  
  return results[0] || null;
}

/**
 * Calculate tax amount for a subtotal using a tax code
 */
export async function calculateTax(
  subtotal: number,
  taxCodeId: number,
  effectiveDate: string
): Promise<{ taxAmount: number; taxRate: number; accountId: number | null }> {
  const taxRate = await getTaxRate(taxCodeId, effectiveDate);
  
  if (!taxRate) {
    throw new Error(`No tax rate found for tax code ${taxCodeId} on date ${effectiveDate}`);
  }
  
  const taxAmount = subtotal * taxRate.rate;
  
  return {
    taxAmount,
    taxRate: taxRate.rate,
    accountId: taxRate.account_id || null,
  };
}

/**
 * Get default tax code (HST-ON for backwards compatibility)
 */
export async function getDefaultTaxCode(): Promise<TaxCode> {
  const db = await getDatabase();
  const results = await db.select<TaxCode[]>(
    'SELECT * FROM tax_code WHERE code = ? LIMIT 1',
    ['HST-ON']
  );
  
  if (!results[0]) {
    throw new Error('Default tax code (HST-ON) not found. Database may need re-seeding.');
  }
  
  return results[0];
}
