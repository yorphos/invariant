import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Document } from '../../lib/domain/types';

// Mock variables must use vi.hoisted() because vi.mock is hoisted above imports
const { mockDbExecute, mockDbSelect } = vi.hoisted(() => ({
  mockDbExecute: vi.fn(),
  mockDbSelect: vi.fn(),
}));

const { mockRemove, mockReadDir, mockExists, mockMkdir } = vi.hoisted(() => ({
  mockRemove: vi.fn(),
  mockReadDir: vi.fn(),
  mockExists: vi.fn(),
  mockMkdir: vi.fn(),
}));

vi.mock('../../lib/services/database', () => ({
  getDatabase: vi.fn(() => ({
    execute: mockDbExecute,
    select: mockDbSelect,
  })),
}));

vi.mock('@tauri-apps/plugin-fs', () => ({
  BaseDirectory: { AppData: 0 },
  writeFile: vi.fn(),
  readFile: vi.fn(),
  exists: (...args: unknown[]) => mockExists(...args),
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  remove: (...args: unknown[]) => mockRemove(...args),
  readDir: (...args: unknown[]) => mockReadDir(...args),
}));

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn(() => Promise.resolve('/mock/app/data')),
}));

const { deleteDocument, garbageCollectDocuments } = await import('../../lib/services/document-storage');

describe('deleteDocument', () => {
  const mockDocument: Document = {
    id: 1,
    file_name: 'abc123.pdf',
    original_file_name: 'receipt.pdf',
    file_size: 1024,
    mime_type: 'application/pdf',
    content_hash: 'abc123hash',
    file_path: 'documents/abc123.pdf',
    uploaded_at: '2026-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should delete file from disk when no other document references same path', async () => {
    mockDbSelect
      .mockResolvedValueOnce([mockDocument])
      .mockResolvedValueOnce([{ count: 0 }]);
    mockDbExecute.mockResolvedValue({ lastInsertId: undefined, rowsAffected: 1 });
    mockRemove.mockResolvedValue(undefined);

    await deleteDocument(1);

    expect(mockDbExecute).toHaveBeenCalledWith(
      'DELETE FROM document WHERE id = ?',
      [1]
    );
    expect(mockDbSelect).toHaveBeenCalledWith(
      'SELECT COUNT(*) as count FROM document WHERE file_path = ? AND id != ?',
      ['documents/abc123.pdf', 1]
    );
    expect(mockRemove).toHaveBeenCalledWith(
      'documents/abc123.pdf',
      { baseDir: 0 }
    );
  });

  it('should NOT delete file when another doc references same path (dedup)', async () => {
    mockDbSelect
      .mockResolvedValueOnce([mockDocument])
      .mockResolvedValueOnce([{ count: 1 }]);
    mockDbExecute.mockResolvedValue({ lastInsertId: undefined, rowsAffected: 1 });

    await deleteDocument(1);

    expect(mockDbExecute).toHaveBeenCalledWith(
      'DELETE FROM document WHERE id = ?',
      [1]
    );
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('should throw error when document does not exist', async () => {
    mockDbSelect.mockResolvedValueOnce([]);

    await expect(deleteDocument(999)).rejects.toThrow('Document ID 999 does not exist');
    expect(mockDbExecute).not.toHaveBeenCalled();
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('should handle file deletion failure gracefully', async () => {
    mockDbSelect
      .mockResolvedValueOnce([mockDocument])
      .mockResolvedValueOnce([{ count: 0 }]);
    mockDbExecute.mockResolvedValue({ lastInsertId: undefined, rowsAffected: 1 });
    mockRemove.mockRejectedValue(new Error('Permission denied'));

    await expect(deleteDocument(1)).resolves.toBeUndefined();

    expect(mockDbExecute).toHaveBeenCalledWith(
      'DELETE FROM document WHERE id = ?',
      [1]
    );
    expect(mockRemove).toHaveBeenCalled();
  });
});

describe('garbageCollectDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExists.mockResolvedValue(true);
  });

  it('should remove orphaned files with no matching DB record', async () => {
    mockReadDir.mockResolvedValue([
      { name: 'orphan1.pdf', isFile: true },
      { name: 'orphan2.pdf', isFile: true },
    ]);
    mockDbSelect
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }]);
    mockRemove.mockResolvedValue(undefined);

    const result = await garbageCollectDocuments();

    expect(result.filesScanned).toBe(2);
    expect(result.filesRemoved).toBe(2);
    expect(mockRemove).toHaveBeenCalledTimes(2);
    expect(mockRemove).toHaveBeenCalledWith('documents/orphan1.pdf', { baseDir: 0 });
    expect(mockRemove).toHaveBeenCalledWith('documents/orphan2.pdf', { baseDir: 0 });
  });

  it('should NOT remove files that have matching DB records', async () => {
    mockReadDir.mockResolvedValue([
      { name: 'active.pdf', isFile: true },
    ]);
    mockDbSelect.mockResolvedValueOnce([{ count: 1 }]);

    const result = await garbageCollectDocuments();

    expect(result.filesScanned).toBe(1);
    expect(result.filesRemoved).toBe(0);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('should skip directories', async () => {
    mockReadDir.mockResolvedValue([
      { name: 'subdir', isFile: false },
      { name: 'actual-file.pdf', isFile: true },
    ]);
    mockDbSelect.mockResolvedValueOnce([{ count: 0 }]);
    mockRemove.mockResolvedValue(undefined);

    const result = await garbageCollectDocuments();

    expect(result.filesScanned).toBe(1);
    expect(result.filesRemoved).toBe(1);
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });

  it('should handle empty directory', async () => {
    mockReadDir.mockResolvedValue([]);

    const result = await garbageCollectDocuments();

    expect(result.filesScanned).toBe(0);
    expect(result.filesRemoved).toBe(0);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('should handle readDir errors gracefully', async () => {
    mockReadDir.mockRejectedValue(new Error('Directory not found'));

    const result = await garbageCollectDocuments();

    expect(result.filesScanned).toBe(0);
    expect(result.filesRemoved).toBe(0);
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
