import type { Migration } from '../src/lib/services/database';
import { migration001 } from './001_core_ledger';
import { migration002 } from './002_contacts_ar_ap';
import { migration003 } from './003_inventory_payroll_tax';
import { migration004 } from './004_integrity_triggers';

export const allMigrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
];
