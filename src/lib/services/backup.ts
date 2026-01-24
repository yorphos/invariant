/**
 * Database Backup Service
 * 
 * Provides functions to backup and restore the SQLite database
 */

import { save, open } from '@tauri-apps/plugin-dialog';
import { copyFile, readFile, remove } from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';
import { closeDatabase, getDatabase } from './database';

/**
 * Get the path to the database file
 */
async function getDatabasePath(): Promise<string> {
  const dataDir = await appDataDir();
  return `${dataDir}/invariant.db`;
}

/**
 * Backup the database to a user-selected location
 */
export async function backupDatabase(): Promise<boolean> {
  try {
    await closeDatabase();
    const dbPath = await getDatabasePath();
    
    // Get current date for default filename
    const date = new Date().toISOString().split('T')[0];
    const defaultFilename = `invariant-backup-${date}.db`;

    // Show save dialog
    const savePath = await save({
      title: 'Backup Database',
      defaultPath: defaultFilename,
      filters: [{
        name: 'SQLite Database',
        extensions: ['db']
      }]
    });

    if (!savePath) {
      return false; // User cancelled
    }

    // Copy database file to selected location
    await copyFile(dbPath, savePath);

    await getDatabase();

    return true;
  } catch (error) {
    console.error('Failed to backup database:', error);
    await getDatabase();
    throw new Error(`Backup failed: ${error}`);
  }
}

/**
 * Restore the database from a user-selected file
 * 
 * IMPORTANT: This will replace the current database!
 */
export async function restoreDatabase(): Promise<boolean> {
  try {
    await closeDatabase();
    // Show confirmation dialog
    const confirmed = confirm(
      'WARNING: Restoring from backup will replace your current database. ' +
      'Make sure you have backed up your current data first. ' +
      'Continue with restore?'
    );

    if (!confirmed) {
      await getDatabase();
      return false;
    }

    // Show open dialog
    const openPath = await open({
      title: 'Restore Database',
      multiple: false,
      filters: [{
        name: 'SQLite Database',
        extensions: ['db']
      }]
    });

    if (!openPath) {
      await getDatabase();
      return false; // User cancelled
    }

    const dbPath = await getDatabasePath();
    const backupPath = typeof openPath === 'string' ? openPath : openPath[0];

    // Verify the file is a valid SQLite database
    const header = await readFile(backupPath);
    const headerStr = new TextDecoder().decode(header.slice(0, 16));
    
    if (!headerStr.startsWith('SQLite format 3')) {
      throw new Error('Selected file is not a valid SQLite database');
    }

    // Copy backup file to database location
    await copyFile(backupPath, dbPath);

    await getDatabase();

    alert('Database restored successfully. Please restart the application.');
    
    return true;
  } catch (error) {
    console.error('Failed to restore database:', error);
    await getDatabase();
    throw new Error(`Restore failed: ${error}`);
  }
}

/**
 * Export database as SQL dump (for human-readable backup)
 */
export async function exportDatabaseSQL(): Promise<boolean> {
  try {
    const date = new Date().toISOString().split('T')[0];
    const defaultFilename = `invariant-export-${date}.sql`;

    // Show save dialog
    const savePath = await save({
      title: 'Export Database as SQL',
      defaultPath: defaultFilename,
      filters: [{
        name: 'SQL File',
        extensions: ['sql']
      }]
    });

    if (!savePath) {
      return false; // User cancelled
    }

    // This would require implementing a SQL dump function
    // For now, just copy the database file
    alert('SQL export not yet implemented. Please use binary backup instead.');
    
    return false;
  } catch (error) {
    console.error('Failed to export database:', error);
    throw new Error(`Export failed: ${error}`);
  }
}

/**
 * Required confirmation text for database reset
 */
export const RESET_CONFIRMATION_TEXT = 'RESET DATABASE';

/**
 * Validate the user's reset confirmation input
 */
export function isResetConfirmationValid(userInput: string): boolean {
  return userInput.trim() === RESET_CONFIRMATION_TEXT;
}

/**
 * Reset the database to factory state
 * 
 * CRITICAL: This completely deletes all data and recreates the database!
 * Requires explicit confirmation text to prevent accidental data loss.
 * 
 * @param confirmationText - User must type "RESET DATABASE" exactly
 * @returns true if reset successful
 * @throws Error if confirmation text is invalid or reset fails
 */
export async function resetDatabase(confirmationText: string): Promise<boolean> {
  // Validate confirmation text
  if (!isResetConfirmationValid(confirmationText)) {
    throw new Error(
      `Invalid confirmation. Please type "${RESET_CONFIRMATION_TEXT}" exactly to confirm.`
    );
  }

  try {
    // Close the database connection
    await closeDatabase();
    
    const dbPath = await getDatabasePath();
    
    // Delete the database file
    try {
      await remove(dbPath);
      console.log('Database file deleted successfully');
    } catch (e) {
      // File might not exist if this is a fresh install
      console.log('Database file not found or already deleted:', e);
    }
    
    // Also delete WAL and SHM files if they exist (SQLite journal files)
    try {
      await remove(`${dbPath}-wal`);
    } catch {
      // WAL file might not exist
    }
    try {
      await remove(`${dbPath}-shm`);
    } catch {
      // SHM file might not exist
    }
    
    // Re-initialize the database (this will create fresh schema and seed data)
    await getDatabase();
    
    console.log('Database reset to factory state successfully');
    return true;
  } catch (error) {
    console.error('Failed to reset database:', error);
    // Try to recover by getting the database again
    try {
      await getDatabase();
    } catch {
      // If we can't even get the database, we're in a bad state
    }
    throw new Error(`Database reset failed: ${error}`);
  }
}
