import type { Migration } from '../src/lib/services/database';

// Migration 017: Document Attachments
// Adds support for attaching receipts and documents to transactions
export const migration017: Migration = {
  id: '017',
  name: 'document_attachments',
  up: `
    -- Document storage table
    -- Stores receipts, invoices, contracts, and other documents
    CREATE TABLE IF NOT EXISTS document (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      original_file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      file_path TEXT NOT NULL,
      document_type TEXT CHECK (document_type IN ('receipt', 'invoice', 'bill', 'contract', 'statement', 'other')),
      description TEXT,
      tags TEXT,
      uploaded_by TEXT,
      uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(content_hash)
    );

    CREATE INDEX idx_document_hash ON document(content_hash);
    CREATE INDEX idx_document_type ON document(document_type);
    CREATE INDEX idx_document_upload_date ON document(uploaded_at);

    -- Document attachments (junction table)
    -- Links documents to various entities (invoices, expenses, bills, etc.)
    CREATE TABLE IF NOT EXISTS document_attachment (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      entity_type TEXT NOT NULL CHECK (entity_type IN ('invoice', 'payment', 'expense', 'bill', 'vendor_payment', 'journal_entry', 'contact', 'other')),
      entity_id INTEGER NOT NULL,
      attachment_type TEXT DEFAULT 'supporting' CHECK (attachment_type IN ('primary', 'supporting', 'related')),
      notes TEXT,
      attached_by TEXT,
      attached_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (document_id) REFERENCES document(id) ON DELETE CASCADE,
      UNIQUE(document_id, entity_type, entity_id)
    );

    CREATE INDEX idx_attachment_document ON document_attachment(document_id);
    CREATE INDEX idx_attachment_entity ON document_attachment(entity_type, entity_id);

    -- Add metadata column to track document counts (optional, for performance)
    ALTER TABLE invoice ADD COLUMN attachment_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE payment ADD COLUMN attachment_count INTEGER NOT NULL DEFAULT 0;

    -- Trigger to update attachment counts
    CREATE TRIGGER update_invoice_attachment_count_insert
    AFTER INSERT ON document_attachment
    WHEN NEW.entity_type = 'invoice'
    BEGIN
      UPDATE invoice 
      SET attachment_count = (
        SELECT COUNT(*) 
        FROM document_attachment 
        WHERE entity_type = 'invoice' AND entity_id = NEW.entity_id
      )
      WHERE id = NEW.entity_id;
    END;

    CREATE TRIGGER update_invoice_attachment_count_delete
    AFTER DELETE ON document_attachment
    WHEN OLD.entity_type = 'invoice'
    BEGIN
      UPDATE invoice 
      SET attachment_count = (
        SELECT COUNT(*) 
        FROM document_attachment 
        WHERE entity_type = 'invoice' AND entity_id = OLD.entity_id
      )
      WHERE id = OLD.entity_id;
    END;

    CREATE TRIGGER update_payment_attachment_count_insert
    AFTER INSERT ON document_attachment
    WHEN NEW.entity_type = 'payment'
    BEGIN
      UPDATE payment 
      SET attachment_count = (
        SELECT COUNT(*) 
        FROM document_attachment 
        WHERE entity_type = 'payment' AND entity_id = NEW.entity_id
      )
      WHERE id = NEW.entity_id;
    END;

    CREATE TRIGGER update_payment_attachment_count_delete
    AFTER DELETE ON document_attachment
    WHEN OLD.entity_type = 'payment'
    BEGIN
      UPDATE payment 
      SET attachment_count = (
        SELECT COUNT(*) 
        FROM document_attachment 
        WHERE entity_type = 'payment' AND entity_id = OLD.entity_id
      )
      WHERE id = OLD.entity_id;
    END;
  `
};
