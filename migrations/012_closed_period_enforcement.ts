import type { Migration } from '../src/lib/services/database';

// Migration 012: Prevent posting to closed fiscal years
export const migration012: Migration = {
  id: '012',
  name: 'closed_period_enforcement',
  up: `
    -- Prevent inserting journal entries into closed fiscal years
    CREATE TRIGGER IF NOT EXISTS prevent_posting_to_closed_period_insert
    BEFORE INSERT ON journal_entry
    BEGIN
      SELECT CASE
        WHEN EXISTS (
          SELECT 1 FROM fiscal_year
          WHERE status = 'closed'
            AND date(NEW.entry_date) BETWEEN date(start_date) AND date(end_date)
        )
        THEN RAISE(ABORT, 'Cannot post entry in closed fiscal period')
      END;
    END;

    -- Prevent updating journal entry dates into closed fiscal years
    CREATE TRIGGER IF NOT EXISTS prevent_posting_to_closed_period_update
    BEFORE UPDATE OF entry_date ON journal_entry
    BEGIN
      SELECT CASE
        WHEN EXISTS (
          SELECT 1 FROM fiscal_year
          WHERE status = 'closed'
            AND date(NEW.entry_date) BETWEEN date(start_date) AND date(end_date)
        )
        THEN RAISE(ABORT, 'Cannot move entry into closed fiscal period')
      END;
    END;
  `
};
