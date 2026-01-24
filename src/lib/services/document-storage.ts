/**
 * Document Storage Service
 * 
 * Handles receipt and document attachments for transactions.
 * Stores files locally with content-hash deduplication.
 */

import { getDatabase } from './database';
import type {
  Document,
  DocumentAttachment,
  DocumentWithAttachment,
  DocumentType,
  EntityType,
  AttachmentType
} from '../domain/types';

// Use Tauri's filesystem API for file operations
import { BaseDirectory, writeFile, readFile, exists, mkdir } from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';

const DOCUMENTS_DIR = 'documents';

/**
 * Initialize document storage directory
 */
async function ensureDocumentDir(): Promise<string> {
  try {
    const appDir = await appDataDir();
    const docsPath = `${appDir}/${DOCUMENTS_DIR}`;
    
    // Check if directory exists, create if not
    const dirExists = await exists(DOCUMENTS_DIR, { baseDir: BaseDirectory.AppData });
    
    if (!dirExists) {
      await mkdir(DOCUMENTS_DIR, { baseDir: BaseDirectory.AppData, recursive: true });
    }
    
    return docsPath;
  } catch (error) {
    throw new Error(`Failed to initialize document directory: ${error}`);
  }
}

/**
 * Calculate SHA-256 hash of file content
 */
async function calculateHash(content: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest('SHA-256', content.buffer as ArrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Store a document file
 * Returns document record ID
 */
export async function storeDocument(
  fileContent: Uint8Array,
  originalFileName: string,
  mimeType: string,
  documentType?: DocumentType,
  description?: string,
  tags?: string,
  uploadedBy?: string
): Promise<number> {
  const db = await getDatabase();
  
  // Calculate content hash for deduplication
  const contentHash = await calculateHash(fileContent);
  
  // Check if document with this hash already exists
  const existing = await db.select<Document[]>(
    'SELECT * FROM document WHERE content_hash = ? LIMIT 1',
    [contentHash]
  );
  
  if (existing[0]) {
    // Document already exists, return existing ID
    return existing[0].id!;
  }
  
  // Ensure document directory exists
  await ensureDocumentDir();
  
  // Generate unique file name (hash + original extension)
  const ext = originalFileName.split('.').pop() || 'bin';
  const storedFileName = `${contentHash}.${ext}`;
  const filePath = `${DOCUMENTS_DIR}/${storedFileName}`;
  
  // Write file to disk
  try {
    await writeFile(filePath, fileContent, { baseDir: BaseDirectory.AppData });
  } catch (error) {
    throw new Error(`Failed to write document file: ${error}`);
  }
  
  // Create document record
  const result = await db.execute(
    `INSERT INTO document 
     (file_name, original_file_name, file_size, mime_type, content_hash, file_path, 
      document_type, description, tags, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      storedFileName,
      originalFileName,
      fileContent.length,
      mimeType,
      contentHash,
      filePath,
      documentType || null,
      description || null,
      tags || null,
      uploadedBy || null
    ]
  );
  
  if (!result.lastInsertId) {
    throw new Error('Failed to create document record');
  }
  
  return result.lastInsertId;
}

/**
 * Attach a document to an entity (invoice, payment, expense, etc.)
 */
export async function attachDocument(
  documentId: number,
  entityType: EntityType,
  entityId: number,
  attachmentType: AttachmentType = 'supporting',
  notes?: string,
  attachedBy?: string
): Promise<number> {
  const db = await getDatabase();
  
  // Verify document exists
  const doc = await getDocument(documentId);
  if (!doc) {
    throw new Error(`Document ID ${documentId} does not exist`);
  }
  
  // Create attachment
  const result = await db.execute(
    `INSERT INTO document_attachment 
     (document_id, entity_type, entity_id, attachment_type, notes, attached_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [documentId, entityType, entityId, attachmentType, notes || null, attachedBy || null]
  );
  
  if (!result.lastInsertId) {
    throw new Error('Failed to create document attachment');
  }
  
  return result.lastInsertId;
}

/**
 * Detach a document from an entity
 */
export async function detachDocument(
  documentId: number,
  entityType: EntityType,
  entityId: number
): Promise<void> {
  const db = await getDatabase();
  
  await db.execute(
    `DELETE FROM document_attachment 
     WHERE document_id = ? AND entity_type = ? AND entity_id = ?`,
    [documentId, entityType, entityId]
  );
}

/**
 * Get a document by ID
 */
export async function getDocument(documentId: number): Promise<Document | null> {
  const db = await getDatabase();
  
  const results = await db.select<Document[]>(
    'SELECT * FROM document WHERE id = ? LIMIT 1',
    [documentId]
  );
  
  return results[0] || null;
}

/**
 * Get document file content
 */
export async function getDocumentContent(documentId: number): Promise<Uint8Array> {
  const doc = await getDocument(documentId);
  
  if (!doc) {
    throw new Error(`Document ID ${documentId} does not exist`);
  }
  
  try {
    const content = await readFile(doc.file_path, { baseDir: BaseDirectory.AppData });
    return content;
  } catch (error) {
    throw new Error(`Failed to read document file: ${error}`);
  }
}

/**
 * Get all documents attached to an entity
 */
export async function getEntityDocuments(
  entityType: EntityType,
  entityId: number
): Promise<DocumentWithAttachment[]> {
  const db = await getDatabase();
  
  const results = await db.select<Array<Document & {
    attachment_id: number;
    attachment_type: AttachmentType;
    attachment_notes: string;
    attached_by: string;
    attached_at: string;
  }>>(
    `SELECT 
       d.*,
       da.id as attachment_id,
       da.attachment_type,
       da.notes as attachment_notes,
       da.attached_by,
       da.attached_at
     FROM document d
     JOIN document_attachment da ON d.id = da.document_id
     WHERE da.entity_type = ? AND da.entity_id = ?
     ORDER BY da.attached_at DESC`,
    [entityType, entityId]
  );
  
  return results.map(r => ({
    ...r,
    entity_type: entityType,
    entity_id: entityId
  }));
}

/**
 * Get all documents of a specific type
 */
export async function getDocumentsByType(documentType: DocumentType): Promise<Document[]> {
  const db = await getDatabase();
  
  const results = await db.select<Document[]>(
    `SELECT * FROM document 
     WHERE document_type = ?
     ORDER BY uploaded_at DESC`,
    [documentType]
  );
  
  return results;
}

/**
 * Search documents by tags or description
 */
export async function searchDocuments(query: string): Promise<Document[]> {
  const db = await getDatabase();
  
  const results = await db.select<Document[]>(
    `SELECT * FROM document 
     WHERE original_file_name LIKE ? 
        OR description LIKE ?
        OR tags LIKE ?
     ORDER BY uploaded_at DESC`,
    [`%${query}%`, `%${query}%`, `%${query}%`]
  );
  
  return results;
}

/**
 * Delete a document (removes file and all attachments)
 */
export async function deleteDocument(documentId: number): Promise<void> {
  const db = await getDatabase();
  
  // Get document to find file path
  const doc = await getDocument(documentId);
  
  if (!doc) {
    throw new Error(`Document ID ${documentId} does not exist`);
  }
  
  // Note: Attachments will be deleted via CASCADE
  // Delete document record
  await db.execute(
    'DELETE FROM document WHERE id = ?',
    [documentId]
  );
  
  // TODO: Delete file from disk
  // This requires Tauri's fs plugin to support file deletion
  // For now, we'll leave orphaned files (they're deduplicated by hash anyway)
}

/**
 * Get attachment count for an entity
 */
export async function getEntityAttachmentCount(
  entityType: EntityType,
  entityId: number
): Promise<number> {
  const db = await getDatabase();
  
  const results = await db.select<Array<{ count: number }>>(
    `SELECT COUNT(*) as count
     FROM document_attachment
     WHERE entity_type = ? AND entity_id = ?`,
    [entityType, entityId]
  );
  
  return results[0]?.count || 0;
}

/**
 * Get all attachments for an entity (just attachment records, not full documents)
 */
export async function getEntityAttachments(
  entityType: EntityType,
  entityId: number
): Promise<DocumentAttachment[]> {
  const db = await getDatabase();
  
  const results = await db.select<DocumentAttachment[]>(
    `SELECT * FROM document_attachment
     WHERE entity_type = ? AND entity_id = ?
     ORDER BY attached_at DESC`,
    [entityType, entityId]
  );
  
  return results;
}

/**
 * Update document metadata
 */
export async function updateDocument(
  documentId: number,
  updates: {
    document_type?: DocumentType;
    description?: string;
    tags?: string;
  }
): Promise<void> {
  const db = await getDatabase();
  
  const fields: string[] = [];
  const values: any[] = [];
  
  if (updates.document_type !== undefined) {
    fields.push('document_type = ?');
    values.push(updates.document_type || null);
  }
  
  if (updates.description !== undefined) {
    fields.push('description = ?');
    values.push(updates.description || null);
  }
  
  if (updates.tags !== undefined) {
    fields.push('tags = ?');
    values.push(updates.tags || null);
  }
  
  if (fields.length === 0) {
    return; // Nothing to update
  }
  
  values.push(documentId);
  
  await db.execute(
    `UPDATE document SET ${fields.join(', ')} WHERE id = ?`,
    values
  );
}

/**
 * Bulk attach a document to multiple entities
 */
export async function bulkAttachDocument(
  documentId: number,
  attachments: Array<{
    entityType: EntityType;
    entityId: number;
    attachmentType?: AttachmentType;
    notes?: string;
  }>,
  attachedBy?: string
): Promise<number[]> {
  const attachmentIds: number[] = [];
  
  for (const att of attachments) {
    const id = await attachDocument(
      documentId,
      att.entityType,
      att.entityId,
      att.attachmentType || 'supporting',
      att.notes,
      attachedBy
    );
    attachmentIds.push(id);
  }
  
  return attachmentIds;
}
