import type { Migration } from '../src/lib/services/database';

// Migration 013: Fix system account mappings to match default chart
export const migration013: Migration = {
  id: '013',
  name: 'system_account_fixes',
  up: `
    -- Accounts Payable should map to 2000 (Accounts Payable)
    UPDATE system_account
    SET account_id = (
      SELECT id FROM account WHERE code = '2000' LIMIT 1
    ),
    updated_at = datetime('now')
    WHERE role = 'accounts_payable'
      AND EXISTS (SELECT 1 FROM account WHERE code = '2000');

    -- Retained Earnings should map to 3100
    UPDATE system_account
    SET account_id = (
      SELECT id FROM account WHERE code = '3100' LIMIT 1
    ),
    updated_at = datetime('now')
    WHERE role = 'retained_earnings'
      AND EXISTS (SELECT 1 FROM account WHERE code = '3100');

    -- Current Year Earnings should map to 3900
    UPDATE system_account
    SET account_id = (
      SELECT id FROM account WHERE code = '3900' LIMIT 1
    ),
    updated_at = datetime('now')
    WHERE role = 'current_year_earnings'
      AND EXISTS (SELECT 1 FROM account WHERE code = '3900');
  `
};
