import type { Migration } from '../src/lib/services/database';

// Migration 008: Fiscal Year and Period Management
export const migration008: Migration = {
  id: '008',
  name: 'fiscal_periods',
  up: `
    -- Fiscal year table
    -- Tracks accounting years and their open/closed status
    CREATE TABLE IF NOT EXISTS fiscal_year (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL UNIQUE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      closed_at TEXT,
      closed_by TEXT,
      closing_journal_entry_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (closing_journal_entry_id) REFERENCES journal_entry(id)
    );

    CREATE INDEX idx_fiscal_year_year ON fiscal_year(year);
    CREATE INDEX idx_fiscal_year_status ON fiscal_year(status);
    CREATE INDEX idx_fiscal_year_dates ON fiscal_year(start_date, end_date);

    -- Fiscal period table (for monthly/quarterly tracking - future enhancement)
    CREATE TABLE IF NOT EXISTS fiscal_period (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fiscal_year_id INTEGER NOT NULL,
      period_number INTEGER NOT NULL,
      period_name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      closed_at TEXT,
      closed_by TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (fiscal_year_id) REFERENCES fiscal_year(id),
      UNIQUE (fiscal_year_id, period_number)
    );

    CREATE INDEX idx_fiscal_period_year ON fiscal_period(fiscal_year_id);
    CREATE INDEX idx_fiscal_period_status ON fiscal_period(status);
    CREATE INDEX idx_fiscal_period_dates ON fiscal_period(start_date, end_date);

    -- Seed current fiscal year (2026)
    INSERT INTO fiscal_year (year, start_date, end_date, status)
    VALUES (2026, '2026-01-01', '2026-12-31', 'open');

    -- Seed 12 monthly periods for 2026
    INSERT INTO fiscal_period (fiscal_year_id, period_number, period_name, start_date, end_date)
    SELECT 
      fy.id,
      1,
      'January 2026',
      '2026-01-01',
      '2026-01-31'
    FROM fiscal_year fy WHERE fy.year = 2026;

    INSERT INTO fiscal_period (fiscal_year_id, period_number, period_name, start_date, end_date)
    SELECT fy.id, 2, 'February 2026', '2026-02-01', '2026-02-28'
    FROM fiscal_year fy WHERE fy.year = 2026;

    INSERT INTO fiscal_period (fiscal_year_id, period_number, period_name, start_date, end_date)
    SELECT fy.id, 3, 'March 2026', '2026-03-01', '2026-03-31'
    FROM fiscal_year fy WHERE fy.year = 2026;

    INSERT INTO fiscal_period (fiscal_year_id, period_number, period_name, start_date, end_date)
    SELECT fy.id, 4, 'April 2026', '2026-04-01', '2026-04-30'
    FROM fiscal_year fy WHERE fy.year = 2026;

    INSERT INTO fiscal_period (fiscal_year_id, period_number, period_name, start_date, end_date)
    SELECT fy.id, 5, 'May 2026', '2026-05-01', '2026-05-31'
    FROM fiscal_year fy WHERE fy.year = 2026;

    INSERT INTO fiscal_period (fiscal_year_id, period_number, period_name, start_date, end_date)
    SELECT fy.id, 6, 'June 2026', '2026-06-01', '2026-06-30'
    FROM fiscal_year fy WHERE fy.year = 2026;

    INSERT INTO fiscal_period (fiscal_year_id, period_number, period_name, start_date, end_date)
    SELECT fy.id, 7, 'July 2026', '2026-07-01', '2026-07-31'
    FROM fiscal_year fy WHERE fy.year = 2026;

    INSERT INTO fiscal_period (fiscal_year_id, period_number, period_name, start_date, end_date)
    SELECT fy.id, 8, 'August 2026', '2026-08-01', '2026-08-31'
    FROM fiscal_year fy WHERE fy.year = 2026;

    INSERT INTO fiscal_period (fiscal_year_id, period_number, period_name, start_date, end_date)
    SELECT fy.id, 9, 'September 2026', '2026-09-01', '2026-09-30'
    FROM fiscal_year fy WHERE fy.year = 2026;

    INSERT INTO fiscal_period (fiscal_year_id, period_number, period_name, start_date, end_date)
    SELECT fy.id, 10, 'October 2026', '2026-10-01', '2026-10-31'
    FROM fiscal_year fy WHERE fy.year = 2026;

    INSERT INTO fiscal_period (fiscal_year_id, period_number, period_name, start_date, end_date)
    SELECT fy.id, 11, 'November 2026', '2026-11-01', '2026-11-30'
    FROM fiscal_year fy WHERE fy.year = 2026;

    INSERT INTO fiscal_period (fiscal_year_id, period_number, period_name, start_date, end_date)
    SELECT fy.id, 12, 'December 2026', '2026-12-01', '2026-12-31'
    FROM fiscal_year fy WHERE fy.year = 2026;
  `
};
