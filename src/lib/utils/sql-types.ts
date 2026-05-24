/**
 * Shared SQL types for database operations
 *
 * Provides type-safe SQL parameter and value types
 * to replace `any` usages across service files.
 */

/**
 * Represents a value that can be bound to a SQL parameter.
 * Covers all primitive types that SQLite accepts.
 */
export type SqlValue = string | number | boolean | null;

/**
 * Array of SQL parameter values for prepared statements.
 */
export type SqlParams = SqlValue[];
