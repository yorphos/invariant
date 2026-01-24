import type { Migration } from '../src/lib/services/database';

// Migration 005: Add database triggers to prevent payment/invoice over-allocation
export const migration005: Migration = {
  id: '005',
  name: 'create_allocation_constraint_triggers',
  up: `
    -- Trigger to prevent payment over-allocation
    CREATE TRIGGER IF NOT EXISTS prevent_payment_overallocation
    BEFORE INSERT ON allocation
    BEGIN
      SELECT CASE
        WHEN (
          SELECT COALESCE(SUM(amount), 0) + NEW.amount
          FROM allocation
          WHERE payment_id = NEW.payment_id
        ) > (SELECT amount FROM payment WHERE id = NEW.payment_id) + 0.01
        THEN RAISE(ABORT, 'Allocation would exceed payment amount')
      END;
    END;

    -- Trigger to prevent invoice over-allocation
    CREATE TRIGGER IF NOT EXISTS prevent_invoice_overallocation
    BEFORE INSERT ON allocation
    BEGIN
      SELECT CASE
        WHEN (
          SELECT COALESCE(SUM(amount), 0) + NEW.amount
          FROM allocation
          WHERE invoice_id = NEW.invoice_id
        ) > (SELECT total_amount FROM invoice WHERE id = NEW.invoice_id) + 0.01
        THEN RAISE(ABORT, 'Allocation would exceed invoice total')
      END;
    END;

    -- Trigger to update allocation on payment update (if amount changes)
    CREATE TRIGGER IF NOT EXISTS check_payment_update_allocations
    BEFORE UPDATE OF amount ON payment
    WHEN NEW.amount < OLD.amount
    BEGIN
      SELECT CASE
        WHEN (
          SELECT COALESCE(SUM(amount), 0)
          FROM allocation
          WHERE payment_id = NEW.id
        ) > NEW.amount + 0.01
        THEN RAISE(ABORT, 'Cannot reduce payment amount below allocated amount')
      END;
    END;

    -- Trigger to validate invoice amount updates don't go below allocated
    CREATE TRIGGER IF NOT EXISTS check_invoice_update_allocations
    BEFORE UPDATE OF total_amount ON invoice
    WHEN NEW.total_amount < OLD.total_amount
    BEGIN
      SELECT CASE
        WHEN (
          SELECT COALESCE(SUM(amount), 0)
          FROM allocation
          WHERE invoice_id = NEW.id
        ) > NEW.total_amount + 0.01
        THEN RAISE(ABORT, 'Cannot reduce invoice total below allocated amount')
      END;
    END;
  `
};
