import { invoke } from '@tauri-apps/api/core';
import { appDataDir } from '@tauri-apps/api/path';

export interface TransactionStep {
  sql: string;
  params: any[];
}

export interface TransactionResult {
  success: boolean;
  error?: string;
}

/**
 * Execute multiple SQL statements in an atomic transaction
 * All statements succeed or all fail (rollback)
 */
export async function executeTransaction(
  steps: TransactionStep[]
): Promise<TransactionResult> {
  try {
    const appDataPath = await appDataDir();
    const dbUrl = `sqlite:${appDataPath}/invariant.db`;
    
    const result = await invoke<TransactionResult>('execute_transaction', {
      dbUrl,
      steps,
    });
    
    return result;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
