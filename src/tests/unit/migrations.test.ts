/**
 * Database Migration Unit Tests
 * Tests for migration integrity, schema consistency, and completeness
 */

import { describe, it, expect } from 'vitest';
import { allMigrations } from '../../../migrations';

describe('Database Migrations', () => {
  it('should have all migrations registered', () => {
    expect(allMigrations.length).toBeGreaterThan(0);
    expect(allMigrations[0].id).toBe('001');
  });

  it('should have consecutive migration IDs', () => {
    const ids = allMigrations.map(m => parseInt(m.id));
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBe(ids[i - 1] + 1);
    }
  });

  it('should have valid migration structure', () => {
    for (const migration of allMigrations) {
      expect(migration).toHaveProperty('id');
      expect(migration).toHaveProperty('name');
      expect(migration).toHaveProperty('up');
      expect(typeof migration.up).toBe('string');
      expect(migration.up.length).toBeGreaterThan(0);
    }
  });

  it('should have unique migration IDs', () => {
    const ids = allMigrations.map(m => m.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('should create all required tables in migration 001', () => {
    const firstMigration = allMigrations[0];
    expect(firstMigration.id).toBe('001');

    const sql = firstMigration.up.toUpperCase();

    const expectedTables = [
      'SETTINGS',
      'ACCOUNT',
      'AUDIT_LOG',
      'TRANSACTION_EVENT',
      'JOURNAL_ENTRY',
      'JOURNAL_LINE'
    ];

    for (const table of expectedTables) {
      expect(sql).toContain(`CREATE TABLE IF NOT EXISTS ${table}`);
    }
  });

  it('should have description column in settings table', () => {
    const firstMigration = allMigrations[0];
    const sql = firstMigration.up.toUpperCase();
    
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS SETTINGS');
    expect(sql).toContain('DESCRIPTION');
  });

  it('should not reference non-existent columns', () => {
    for (const migration of allMigrations) {
      const sql = migration.up;
      
      if (sql.includes('INSERT INTO settings')) {
        const settingsTableDef = allMigrations[0].up.toUpperCase();
        const hasDescriptionColumn = settingsTableDef.includes('DESCRIPTION');
        
        if (sql.includes('description')) {
          expect(hasDescriptionColumn).toBe(true);
        }
      }
    }
  });

  it('should have foreign key constraints where needed', () => {
    const firstMigration = allMigrations[0];
    const sql = firstMigration.up.toUpperCase();

    expect(sql).toContain('FOREIGN KEY (PARENT_ID) REFERENCES ACCOUNT(ID)');
    expect(sql).toContain('FOREIGN KEY (EVENT_ID) REFERENCES TRANSACTION_EVENT(ID)');
    expect(sql).toContain('FOREIGN KEY (JOURNAL_ENTRY_ID) REFERENCES JOURNAL_ENTRY(ID)');
    expect(sql).toContain('FOREIGN KEY (ACCOUNT_ID) REFERENCES ACCOUNT(ID)');
  });

  it('should enable foreign keys', () => {
    for (const migration of allMigrations) {
      if (migration.up.includes('PRAGMA foreign_keys')) {
        expect(migration.up).toContain('PRAGMA foreign_keys = ON');
        return;
      }
    }
  });

  it('should not have duplicate CREATE TABLE statements', () => {
    const tableDefinitions = new Map<string, string>();

    for (const migration of allMigrations) {
      const createTableRegex = /CREATE TABLE IF NOT EXISTS (\w+)/gi;
      let match;
      
      while ((match = createTableRegex.exec(migration.up)) !== null) {
        const tableName = match[1].toUpperCase();
        
        if (tableDefinitions.has(tableName)) {
          throw new Error(`Duplicate CREATE TABLE for ${tableName} in migration ${migration.id}`);
        }
        
        tableDefinitions.set(tableName, migration.id);
      }
    }
  });

  it('should have proper indexes on foreign keys', () => {
    const firstMigration = allMigrations[0];
    const sql = firstMigration.up.toUpperCase();

    expect(sql).toContain('CREATE INDEX IDX_ACCOUNT_PARENT');
    expect(sql).toContain('CREATE INDEX IDX_JOURNAL_LINE_ENTRY');
    expect(sql).toContain('CREATE INDEX IDX_JOURNAL_LINE_ACCOUNT');
  });

  it('should have check constraints for data integrity', () => {
    const firstMigration = allMigrations[0];
    const sql = firstMigration.up.toUpperCase();

    expect(sql).toContain('CHECK (TYPE IN');
    expect(sql).toContain("CHECK (STATUS IN ('DRAFT', 'POSTED', 'VOID'))");
    expect(sql).toContain('CHECK ((DEBIT_AMOUNT > 0 AND CREDIT_AMOUNT = 0) OR (CREDIT_AMOUNT > 0 AND DEBIT_AMOUNT = 0))');
  });
});
