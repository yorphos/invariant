/**
 * Database Backup Service
 * 
 * Provides functions to backup and restore the SQLite database
 */

import { save, open } from '@tauri-apps/plugin-dialog';
import { copyFile, readFile, writeFile } from '@tauri-apps/plugin-fs';
import { appDataDir } from '@tauri-apps/api/path';

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

    return true;
  } catch (error) {
    console.error('Failed to backup database:', error);
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
    // Show confirmation dialog
    const confirmed = confirm(
      'WARNING: Restoring from backup will replace your current database. ' +
      'Make sure you have backed up your current data first. ' +
      'Continue with restore?'
    );

    if (!confirmed) {
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

    alert('Database restored successfully. Please restart the application.');
    
    return true;
  } catch (error) {
    console.error('Failed to restore database:', error);
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
