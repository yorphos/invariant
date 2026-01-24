import type { Migration } from '../src/lib/services/database';

// Migration 004: Database triggers for integrity enforcement
export const migration004: Migration = {
  id: '004',
  name: 'create_integrity_triggers',
  up: `
    -- Trigger to enforce balanced journal entries on posting
    CREATE TRIGGER IF NOT EXISTS enforce_balanced_journal_on_post
    BEFORE UPDATE OF status ON journal_entry
    WHEN NEW.status = 'posted' AND OLD.status = 'draft'
    BEGIN
      SELECT CASE
        WHEN (
          SELECT ABS(SUM(debit_amount) - SUM(credit_amount))
          FROM journal_line
          WHERE journal_entry_id = NEW.id
        ) > 0.01
        THEN RAISE(ABORT, 'Cannot post unbalanced journal entry')
      END;
    END;

    -- Trigger to prevent modifications to posted journal entries
    CREATE TRIGGER IF NOT EXISTS prevent_modify_posted_journal
    BEFORE UPDATE ON journal_entry
    WHEN OLD.status = 'posted' AND NEW.status = 'posted'
    BEGIN
      SELECT RAISE(ABORT, 'Cannot modify posted journal entry. Use reversal instead.');
    END;

    -- Trigger to prevent deletion of posted journal entries
    CREATE TRIGGER IF NOT EXISTS prevent_delete_posted_journal
    BEFORE DELETE ON journal_entry
    WHEN OLD.status = 'posted'
    BEGIN
      SELECT RAISE(ABORT, 'Cannot delete posted journal entry. Use void instead.');
    END;

    -- Trigger to prevent adding/modifying lines on posted entries
    CREATE TRIGGER IF NOT EXISTS prevent_modify_posted_lines_insert
    BEFORE INSERT ON journal_line
    BEGIN
      SELECT CASE
        WHEN (
          SELECT status FROM journal_entry WHERE id = NEW.journal_entry_id
        ) = 'posted'
        THEN RAISE(ABORT, 'Cannot add lines to posted journal entry')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_modify_posted_lines_update
    BEFORE UPDATE ON journal_line
    BEGIN
      SELECT CASE
        WHEN (
          SELECT status FROM journal_entry WHERE id = NEW.journal_entry_id
        ) = 'posted'
        THEN RAISE(ABORT, 'Cannot modify lines in posted journal entry')
      END;
    END;

    CREATE TRIGGER IF NOT EXISTS prevent_modify_posted_lines_delete
    BEFORE DELETE ON journal_line
    BEGIN
      SELECT CASE
        WHEN (
          SELECT status FROM journal_entry WHERE id = OLD.journal_entry_id
        ) = 'posted'
        THEN RAISE(ABORT, 'Cannot delete lines from posted journal entry')
      END;
    END;

    -- Trigger to update invoice totals
    CREATE TRIGGER IF NOT EXISTS update_invoice_totals_insert
    AFTER INSERT ON invoice_line
    BEGIN
      UPDATE invoice
      SET subtotal = (
        SELECT SUM(amount) FROM invoice_line WHERE invoice_id = NEW.invoice_id
      ),
      updated_at = datetime('now')
      WHERE id = NEW.invoice_id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_invoice_totals_update
    AFTER UPDATE ON invoice_line
    BEGIN
      UPDATE invoice
      SET subtotal = (
        SELECT SUM(amount) FROM invoice_line WHERE invoice_id = NEW.invoice_id
      ),
      updated_at = datetime('now')
      WHERE id = NEW.invoice_id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_invoice_totals_delete
    AFTER DELETE ON invoice_line
    BEGIN
      UPDATE invoice
      SET subtotal = (
        SELECT COALESCE(SUM(amount), 0) FROM invoice_line WHERE invoice_id = OLD.invoice_id
      ),
      updated_at = datetime('now')
      WHERE id = OLD.invoice_id;
    END;

    -- Trigger to update payment allocated amounts
    CREATE TRIGGER IF NOT EXISTS update_payment_allocated_insert
    AFTER INSERT ON allocation
    BEGIN
      UPDATE payment
      SET allocated_amount = (
        SELECT COALESCE(SUM(amount), 0) FROM allocation WHERE payment_id = NEW.payment_id
      ),
      status = CASE
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM allocation WHERE payment_id = NEW.payment_id) >= amount THEN 'allocated'
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM allocation WHERE payment_id = NEW.payment_id) > 0 THEN 'partial'
        ELSE 'pending'
      END,
      updated_at = datetime('now')
      WHERE id = NEW.payment_id;

      UPDATE invoice
      SET paid_amount = (
        SELECT COALESCE(SUM(amount), 0) FROM allocation WHERE invoice_id = NEW.invoice_id
      ),
      status = CASE
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM allocation WHERE invoice_id = NEW.invoice_id) >= total_amount THEN 'paid'
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM allocation WHERE invoice_id = NEW.invoice_id) > 0 THEN 'partial'
        ELSE status
      END,
      updated_at = datetime('now')
      WHERE id = NEW.invoice_id;
    END;

    CREATE TRIGGER IF NOT EXISTS update_payment_allocated_delete
    AFTER DELETE ON allocation
    BEGIN
      UPDATE payment
      SET allocated_amount = (
        SELECT COALESCE(SUM(amount), 0) FROM allocation WHERE payment_id = OLD.payment_id
      ),
      status = CASE
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM allocation WHERE payment_id = OLD.payment_id) >= amount THEN 'allocated'
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM allocation WHERE payment_id = OLD.payment_id) > 0 THEN 'partial'
        ELSE 'pending'
      END,
      updated_at = datetime('now')
      WHERE id = OLD.payment_id;

      UPDATE invoice
      SET paid_amount = (
        SELECT COALESCE(SUM(amount), 0) FROM allocation WHERE invoice_id = OLD.invoice_id
      ),
      status = CASE
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM allocation WHERE invoice_id = OLD.invoice_id) >= total_amount THEN 'paid'
        WHEN (SELECT COALESCE(SUM(amount), 0) FROM allocation WHERE invoice_id = OLD.invoice_id) > 0 THEN 'partial'
        ELSE 'sent'
      END,
      updated_at = datetime('now')
      WHERE id = OLD.invoice_id;
    END;

    -- Trigger to create audit log entries
    CREATE TRIGGER IF NOT EXISTS audit_journal_entry_insert
    AFTER INSERT ON journal_entry
    BEGIN
      INSERT INTO audit_log (entity_type, entity_id, action, changes)
      VALUES ('journal_entry', NEW.id, 'create', json_object('status', NEW.status));
    END;

    CREATE TRIGGER IF NOT EXISTS audit_journal_entry_update
    AFTER UPDATE ON journal_entry
    BEGIN
      INSERT INTO audit_log (entity_type, entity_id, action, changes)
      VALUES ('journal_entry', NEW.id, 
        CASE 
          WHEN NEW.status = 'posted' AND OLD.status != 'posted' THEN 'post'
          WHEN NEW.status = 'void' THEN 'void'
          ELSE 'update'
        END,
        json_object('old_status', OLD.status, 'new_status', NEW.status)
      );
    END;
  `
};
