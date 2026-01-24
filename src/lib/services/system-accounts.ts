/**
 * System Accounts Service
 * 
 * Provides access to configured system accounts to avoid hardcoded account IDs
 */

import { getDatabase } from './database';
import type { Account } from '../domain/types';

export type SystemAccountRole = 
  | 'accounts_receivable'
  | 'accounts_payable'
  | 'sales_tax_payable'
  | 'retained_earnings'
  | 'current_year_earnings';

interface SystemAccountMapping {
  id: number;
  role: SystemAccountRole;
  account_id: number;
  description?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Get the account ID for a system account role
 */
export async function getSystemAccountId(role: SystemAccountRole): Promise<number> {
  const db = await getDatabase();
  
  const results = await db.select<SystemAccountMapping[]>(
    'SELECT * FROM system_account WHERE role = ? LIMIT 1',
    [role]
  );
  
  if (!results[0]) {
    throw new Error(
      `System account not configured: ${role}. ` +
      `Please configure this account in Settings or re-run database migrations.`
    );
  }
  
  return results[0].account_id;
}

/**
 * Get the full account object for a system account role
 */
export async function getSystemAccount(role: SystemAccountRole): Promise<Account> {
  const db = await getDatabase();
  
  const results = await db.select<Account[]>(
    `SELECT a.* FROM account a
     JOIN system_account sa ON a.id = sa.account_id
     WHERE sa.role = ?
     LIMIT 1`,
    [role]
  );
  
  if (!results[0]) {
    throw new Error(
      `System account not configured: ${role}. ` +
      `Please configure this account in Settings or re-run database migrations.`
    );
  }
  
  return results[0];
}

/**
 * Get all system account mappings
 */
export async function getAllSystemAccounts(): Promise<Map<SystemAccountRole, Account>> {
  const db = await getDatabase();
  
  const results = await db.select<Array<SystemAccountMapping & Account>>(
    `SELECT sa.role, a.*
     FROM system_account sa
     JOIN account a ON sa.account_id = a.id
     ORDER BY sa.role`
  );
  
  const map = new Map<SystemAccountRole, Account>();
  
  for (const row of results) {
    map.set(row.role as SystemAccountRole, {
      id: row.id,
      code: row.code,
      name: row.name,
      type: row.type,
      parent_id: row.parent_id,
      is_active: row.is_active,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }
  
  return map;
}

/**
 * Update system account mapping
 * (Pro mode only - for when users renumber their chart of accounts)
 */
export async function updateSystemAccount(
  role: SystemAccountRole,
  newAccountId: number
): Promise<void> {
  const db = await getDatabase();
  
  // Verify the new account exists
  const account = await db.select<Account[]>(
    'SELECT * FROM account WHERE id = ? LIMIT 1',
    [newAccountId]
  );
  
  if (!account[0]) {
    throw new Error(`Account ID ${newAccountId} does not exist`);
  }
  
  // Verify account type is appropriate for the role
  const expectedTypes: Record<SystemAccountRole, string[]> = {
    accounts_receivable: ['asset'],
    accounts_payable: ['liability'],
    sales_tax_payable: ['liability'],
    retained_earnings: ['equity'],
    current_year_earnings: ['equity'],
  };
  
  if (!expectedTypes[role].includes(account[0].type)) {
    throw new Error(
      `Account "${account[0].name}" (type: ${account[0].type}) ` +
      `is not valid for system role "${role}". ` +
      `Expected type: ${expectedTypes[role].join(' or ')}`
    );
  }
  
  // Update the mapping
  await db.execute(
    `UPDATE system_account 
     SET account_id = ?, updated_at = datetime('now')
     WHERE role = ?`,
    [newAccountId, role]
  );
}
