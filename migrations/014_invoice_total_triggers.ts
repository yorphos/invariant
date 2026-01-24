import type { Migration } from '../src/lib/services/database';

// Migration 014: Update invoice total triggers for tax inclusive pricing
export const migration014: Migration = {
  id: '014',
  name: 'invoice_total_triggers',
  up: `
    DROP TRIGGER IF EXISTS update_invoice_totals_insert;
    DROP TRIGGER IF EXISTS update_invoice_totals_update;
    DROP TRIGGER IF EXISTS update_invoice_totals_delete;

    CREATE TRIGGER IF NOT EXISTS update_invoice_totals_insert
    AFTER INSERT ON invoice_line
    BEGIN
      UPDATE invoice
      SET subtotal = (
        CASE
          WHEN EXISTS (
            SELECT 1 FROM invoice_line
            WHERE invoice_id = NEW.invoice_id AND is_tax_inclusive = 1
          ) THEN (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id
          ) / (1 + COALESCE((
            SELECT rate FROM tax_rate
            WHERE tax_code_id = invoice.tax_code_id
              AND effective_from <= invoice.issue_date
              AND (effective_to IS NULL OR effective_to >= invoice.issue_date)
            ORDER BY effective_from DESC
            LIMIT 1
          ), 0))
          ELSE (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id
          )
        END
      ),
      tax_amount = (
        CASE
          WHEN EXISTS (
            SELECT 1 FROM invoice_line
            WHERE invoice_id = NEW.invoice_id AND is_tax_inclusive = 1
          ) THEN (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id
          ) - (
            (SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id)
            / (1 + COALESCE((
              SELECT rate FROM tax_rate
              WHERE tax_code_id = invoice.tax_code_id
                AND effective_from <= invoice.issue_date
                AND (effective_to IS NULL OR effective_to >= invoice.issue_date)
              ORDER BY effective_from DESC
              LIMIT 1
            ), 0))
          )
          ELSE (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id
          ) * COALESCE((
            SELECT rate FROM tax_rate
            WHERE tax_code_id = invoice.tax_code_id
              AND effective_from <= invoice.issue_date
              AND (effective_to IS NULL OR effective_to >= invoice.issue_date)
            ORDER BY effective_from DESC
            LIMIT 1
          ), 0)
        END
      ),
      total_amount = (
        CASE
          WHEN EXISTS (
            SELECT 1 FROM invoice_line
            WHERE invoice_id = NEW.invoice_id AND is_tax_inclusive = 1
          ) THEN (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id
          )
          ELSE (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id
          ) + (
            (SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id)
            * COALESCE((
              SELECT rate FROM tax_rate
              WHERE tax_code_id = invoice.tax_code_id
                AND effective_from <= invoice.issue_date
                AND (effective_to IS NULL OR effective_to >= invoice.issue_date)
              ORDER BY effective_from DESC
              LIMIT 1
            ), 0)
          )
        END
      ),
      updated_at = datetime('now')
      WHERE id = NEW.invoice_id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_invoice_totals_update
    AFTER UPDATE ON invoice_line
    BEGIN
      UPDATE invoice
      SET subtotal = (
        CASE
          WHEN EXISTS (
            SELECT 1 FROM invoice_line
            WHERE invoice_id = NEW.invoice_id AND is_tax_inclusive = 1
          ) THEN (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id
          ) / (1 + COALESCE((
            SELECT rate FROM tax_rate
            WHERE tax_code_id = invoice.tax_code_id
              AND effective_from <= invoice.issue_date
              AND (effective_to IS NULL OR effective_to >= invoice.issue_date)
            ORDER BY effective_from DESC
            LIMIT 1
          ), 0))
          ELSE (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id
          )
        END
      ),
      tax_amount = (
        CASE
          WHEN EXISTS (
            SELECT 1 FROM invoice_line
            WHERE invoice_id = NEW.invoice_id AND is_tax_inclusive = 1
          ) THEN (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id
          ) - (
            (SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id)
            / (1 + COALESCE((
              SELECT rate FROM tax_rate
              WHERE tax_code_id = invoice.tax_code_id
                AND effective_from <= invoice.issue_date
                AND (effective_to IS NULL OR effective_to >= invoice.issue_date)
              ORDER BY effective_from DESC
              LIMIT 1
            ), 0))
          )
          ELSE (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id
          ) * COALESCE((
            SELECT rate FROM tax_rate
            WHERE tax_code_id = invoice.tax_code_id
              AND effective_from <= invoice.issue_date
              AND (effective_to IS NULL OR effective_to >= invoice.issue_date)
            ORDER BY effective_from DESC
            LIMIT 1
          ), 0)
        END
      ),
      total_amount = (
        CASE
          WHEN EXISTS (
            SELECT 1 FROM invoice_line
            WHERE invoice_id = NEW.invoice_id AND is_tax_inclusive = 1
          ) THEN (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id
          )
          ELSE (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id
          ) + (
            (SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = NEW.invoice_id)
            * COALESCE((
              SELECT rate FROM tax_rate
              WHERE tax_code_id = invoice.tax_code_id
                AND effective_from <= invoice.issue_date
                AND (effective_to IS NULL OR effective_to >= invoice.issue_date)
              ORDER BY effective_from DESC
              LIMIT 1
            ), 0)
          )
        END
      ),
      updated_at = datetime('now')
      WHERE id = NEW.invoice_id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_invoice_totals_delete
    AFTER DELETE ON invoice_line
    BEGIN
      UPDATE invoice
      SET subtotal = (
        CASE
          WHEN EXISTS (
            SELECT 1 FROM invoice_line
            WHERE invoice_id = OLD.invoice_id AND is_tax_inclusive = 1
          ) THEN (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = OLD.invoice_id
          ) / (1 + COALESCE((
            SELECT rate FROM tax_rate
            WHERE tax_code_id = invoice.tax_code_id
              AND effective_from <= invoice.issue_date
              AND (effective_to IS NULL OR effective_to >= invoice.issue_date)
            ORDER BY effective_from DESC
            LIMIT 1
          ), 0))
          ELSE (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = OLD.invoice_id
          )
        END
      ),
      tax_amount = (
        CASE
          WHEN EXISTS (
            SELECT 1 FROM invoice_line
            WHERE invoice_id = OLD.invoice_id AND is_tax_inclusive = 1
          ) THEN (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = OLD.invoice_id
          ) - (
            (SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = OLD.invoice_id)
            / (1 + COALESCE((
              SELECT rate FROM tax_rate
              WHERE tax_code_id = invoice.tax_code_id
                AND effective_from <= invoice.issue_date
                AND (effective_to IS NULL OR effective_to >= invoice.issue_date)
              ORDER BY effective_from DESC
              LIMIT 1
            ), 0))
          )
          ELSE (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = OLD.invoice_id
          ) * COALESCE((
            SELECT rate FROM tax_rate
            WHERE tax_code_id = invoice.tax_code_id
              AND effective_from <= invoice.issue_date
              AND (effective_to IS NULL OR effective_to >= invoice.issue_date)
            ORDER BY effective_from DESC
            LIMIT 1
          ), 0)
        END
      ),
      total_amount = (
        CASE
          WHEN EXISTS (
            SELECT 1 FROM invoice_line
            WHERE invoice_id = OLD.invoice_id AND is_tax_inclusive = 1
          ) THEN (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = OLD.invoice_id
          )
          ELSE (
            SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = OLD.invoice_id
          ) + (
            (SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = OLD.invoice_id)
            * COALESCE((
              SELECT rate FROM tax_rate
              WHERE tax_code_id = invoice.tax_code_id
                AND effective_from <= invoice.issue_date
                AND (effective_to IS NULL OR effective_to >= invoice.issue_date)
              ORDER BY effective_from DESC
              LIMIT 1
            ), 0)
          )
        END
      ),
      updated_at = datetime('now')
      WHERE id = OLD.invoice_id;
    END;
  `
};
