import type { Migration } from '../src/lib/services/database';

// Migration 006: Tax Code Integration & Seed Rates
export const migration006: Migration = {
  id: '006',
  name: 'tax_code_integration',
  up: `
    -- Add tax_code_id to invoice table
    ALTER TABLE invoice ADD COLUMN tax_code_id INTEGER REFERENCES tax_code(id);
    
    -- Seed Ontario HST tax rate (effective 2026-01-01)
    INSERT INTO tax_rate (tax_code_id, jurisdiction_id, rate, effective_from, account_id)
    SELECT 
      (SELECT id FROM tax_code WHERE code = 'HST-ON'),
      (SELECT id FROM tax_jurisdiction WHERE code = 'CA-ON'),
      0.13,
      '2026-01-01',
      (SELECT id FROM account WHERE code = '2220')
    WHERE NOT EXISTS (
      SELECT 1 FROM tax_rate 
      WHERE tax_code_id = (SELECT id FROM tax_code WHERE code = 'HST-ON')
      AND effective_from = '2026-01-01'
    );
    
    -- Seed Federal GST rate (effective 2026-01-01)
    INSERT INTO tax_rate (tax_code_id, jurisdiction_id, rate, effective_from, account_id)
    SELECT 
      (SELECT id FROM tax_code WHERE code = 'GST'),
      (SELECT id FROM tax_jurisdiction WHERE code = 'CA'),
      0.05,
      '2026-01-01',
      (SELECT id FROM account WHERE code = '2220')
    WHERE NOT EXISTS (
      SELECT 1 FROM tax_rate 
      WHERE tax_code_id = (SELECT id FROM tax_code WHERE code = 'GST')
      AND effective_from = '2026-01-01'
    );
    
    -- Seed BC HST rate (effective 2026-01-01)
    INSERT INTO tax_rate (tax_code_id, jurisdiction_id, rate, effective_from, account_id)
    SELECT 
      (SELECT id FROM tax_code WHERE code = 'HST-BC'),
      (SELECT id FROM tax_jurisdiction WHERE code = 'CA-BC'),
      0.12,
      '2026-01-01',
      (SELECT id FROM account WHERE code = '2220')
    WHERE NOT EXISTS (
      SELECT 1 FROM tax_rate 
      WHERE tax_code_id = (SELECT id FROM tax_code WHERE code = 'HST-BC')
      AND effective_from = '2026-01-01'
    );
    
    -- Seed BC PST rate (effective 2026-01-01)
    INSERT INTO tax_rate (tax_code_id, jurisdiction_id, rate, effective_from, account_id)
    SELECT 
      (SELECT id FROM tax_code WHERE code = 'PST-BC'),
      (SELECT id FROM tax_jurisdiction WHERE code = 'CA-BC'),
      0.07,
      '2026-01-01',
      (SELECT id FROM account WHERE code = '2220')
    WHERE NOT EXISTS (
      SELECT 1 FROM tax_rate 
      WHERE tax_code_id = (SELECT id FROM tax_code WHERE code = 'PST-BC')
      AND effective_from = '2026-01-01'
    );
    
    -- Seed No Tax rate (effective 2026-01-01)
    INSERT INTO tax_rate (tax_code_id, jurisdiction_id, rate, effective_from, account_id)
    SELECT 
      (SELECT id FROM tax_code WHERE code = 'NO_TAX'),
      (SELECT id FROM tax_jurisdiction WHERE code = 'CA'),
      0.00,
      '2026-01-01',
      NULL
    WHERE NOT EXISTS (
      SELECT 1 FROM tax_rate 
      WHERE tax_code_id = (SELECT id FROM tax_code WHERE code = 'NO_TAX')
      AND effective_from = '2026-01-01'
    );
    
    -- Set default tax_code_id for existing invoices to HST-ON
    UPDATE invoice 
    SET tax_code_id = (SELECT id FROM tax_code WHERE code = 'HST-ON')
    WHERE tax_code_id IS NULL;
  `
};
