import { getDatabase } from './database';

export interface FiscalPeriod {
  id: number;
  fiscal_year_id: number;
  period_number: number;
  period_name: string;
  start_date: string;
  end_date: string;
  status: 'open' | 'closed';
}

/**
 * Check if a date falls in a closed fiscal period.
 * Throws an error if the period is closed.
 */
export async function assertPeriodOpen(entryDate: string): Promise<void> {
  const db = await getDatabase();

  const periods = await db.select<FiscalPeriod[]>(
    `SELECT fp.* FROM fiscal_period fp
     WHERE fp.start_date <= ? AND fp.end_date >= ?
     AND fp.status = 'closed'
     LIMIT 1`,
    [entryDate, entryDate]
  );

  if (periods.length > 0) {
    throw new Error(`Cannot post to ${periods[0].period_name}: fiscal period is closed`);
  }
}

export const checkFiscalPeriodOpen = assertPeriodOpen;
