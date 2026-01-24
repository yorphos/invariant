import type { Migration } from '../src/lib/services/database';
import { migration001 } from './001_core_ledger';
import { migration002 } from './002_contacts_ar_ap';
import { migration003 } from './003_inventory_payroll_tax';
import { migration004 } from './004_integrity_triggers';
import { migration005 } from './005_allocation_constraints';
import { migration006 } from './006_tax_code_integration';
import { migration007 } from './007_system_accounts_config';
import { migration008 } from './008_fiscal_periods';
import { migration009 } from './009_bank_reconciliation';
import { migration010 } from './010_vendor_bills';
import { migration011 } from './011_multi_currency';
import { migration012 } from './012_closed_period_enforcement';
import { migration013 } from './013_system_account_fixes';
import { migration014 } from './014_invoice_line_tax_inclusive';
import { migration015 } from './015_invoice_total_triggers';

export const allMigrations: Migration[] = [
  migration001,
  migration002,
  migration003,
  migration004,
  migration005,
  migration006,
  migration007,
  migration008,
  migration009,
  migration010,
  migration011,
  migration012,
  migration013,
  migration014,
  migration015,
];
