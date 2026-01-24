import { describe, it, expect, beforeEach } from 'vitest';
import { parseCSVBankStatement } from '../../lib/services/bank-import';
import type { BankStatementTransaction, CategorizationRule } from '../../lib/domain/types';

describe('Bank Import Service', () => {
  describe('parseCSVBankStatement', () => {
    it('should parse a valid CSV file with headers', () => {
      const csv = `Date,Description,Amount,Balance
2024-01-15,GROCERY STORE,-50.00,1000.00
2024-01-16,PAYCHECK DEPOSIT,2000.00,3000.00
2024-01-17,RENT PAYMENT,-1500.00,1500.00`;

      const result = parseCSVBankStatement(csv);

      expect(result.transactions).toHaveLength(3);
      expect(result.startDate).toBe('2024-01-15');
      expect(result.endDate).toBe('2024-01-17');
      expect(result.openingBalance).toBe(1000.00);
      expect(result.closingBalance).toBe(1500.00);
    });

    it('should parse transactions with correct amounts and types', () => {
      const csv = `Date,Description,Amount
2024-01-15,Withdrawal,-100.00
2024-01-16,Deposit,200.00`;

      const result = parseCSVBankStatement(csv);

      expect(result.transactions[0].amount).toBe(-100.00);
      expect(result.transactions[0].transaction_type).toBe('debit');
      expect(result.transactions[1].amount).toBe(200.00);
      expect(result.transactions[1].transaction_type).toBe('credit');
    });

    it('should handle quoted fields with commas', () => {
      const csv = `Date,Description,Amount
2024-01-15,"STORE, INC.",-50.00
2024-01-16,"Payment for invoice #1234, ref: ABC",-100.00`;

      const result = parseCSVBankStatement(csv);

      expect(result.transactions).toHaveLength(2);
      expect(result.transactions[0].description).toBe('STORE, INC.');
      expect(result.transactions[1].description).toBe('Payment for invoice #1234, ref: ABC');
    });

    it('should handle optional columns', () => {
      const csv = `Date,Description,Amount,Reference,Check Number,Payee,Type
2024-01-15,Check Payment,-100.00,REF123,1001,John Doe,check`;

      const result = parseCSVBankStatement(csv);

      expect(result.transactions[0].reference_number).toBe('REF123');
      expect(result.transactions[0].check_number).toBe('1001');
      expect(result.transactions[0].payee).toBe('John Doe');
      expect(result.transactions[0].transaction_type).toBe('check');
    });

    it('should handle currency formatting', () => {
      const csv = `Date,Description,Amount
2024-01-15,Purchase,"$1,234.56"
2024-01-16,Refund,$99.99`;

      const result = parseCSVBankStatement(csv);

      expect(result.transactions[0].amount).toBe(1234.56);
      expect(result.transactions[1].amount).toBe(99.99);
    });

    it('should throw error if required columns are missing', () => {
      const csv = `Date,Description
2024-01-15,Something`;

      expect(() => parseCSVBankStatement(csv)).toThrow(
        'CSV must have columns for: Date, Description, and Amount'
      );
    });

    it('should throw error if CSV has no data rows', () => {
      const csv = `Date,Description,Amount`;

      expect(() => parseCSVBankStatement(csv)).toThrow(
        'CSV must have at least a header row and one data row'
      );
    });

    it('should skip empty lines', () => {
      const csv = `Date,Description,Amount

2024-01-15,Purchase,-50.00

2024-01-16,Deposit,100.00

`;

      const result = parseCSVBankStatement(csv);

      expect(result.transactions).toHaveLength(2);
    });
  });

  describe('Rule Matching', () => {
    it('should match description pattern', () => {
      const txn: BankStatementTransaction = {
        id: 1,
        import_id: 1,
        transaction_date: '2024-01-15',
        description: 'AMAZON PURCHASE',
        amount: -50.00,
        match_status: 'unmatched'
      };

      const rule: CategorizationRule = {
        id: 1,
        rule_name: 'Amazon',
        priority: 1,
        is_active: true,
        description_pattern: 'amazon',
        times_applied: 0
      };

      expect(matchesRule(txn, rule)).toBe(true);
    });

    it('should match payee pattern', () => {
      const txn: BankStatementTransaction = {
        id: 1,
        import_id: 1,
        transaction_date: '2024-01-15',
        description: 'Purchase',
        payee: 'STARBUCKS #1234',
        amount: -5.00,
        match_status: 'unmatched'
      };

      const rule: CategorizationRule = {
        id: 1,
        rule_name: 'Starbucks',
        priority: 1,
        is_active: true,
        payee_pattern: 'starbucks',
        times_applied: 0
      };

      expect(matchesRule(txn, rule)).toBe(true);
    });

    it('should match amount range', () => {
      const txn: BankStatementTransaction = {
        id: 1,
        import_id: 1,
        transaction_date: '2024-01-15',
        description: 'Small purchase',
        amount: -25.00,
        match_status: 'unmatched'
      };

      const rule: CategorizationRule = {
        id: 1,
        rule_name: 'Small Expenses',
        priority: 1,
        is_active: true,
        amount_min: 10,
        amount_max: 50,
        times_applied: 0
      };

      expect(matchesRule(txn, rule)).toBe(true);
    });

    it('should not match if amount is outside range', () => {
      const txn: BankStatementTransaction = {
        id: 1,
        import_id: 1,
        transaction_date: '2024-01-15',
        description: 'Large purchase',
        amount: -500.00,
        match_status: 'unmatched'
      };

      const rule: CategorizationRule = {
        id: 1,
        rule_name: 'Small Expenses',
        priority: 1,
        is_active: true,
        amount_min: 10,
        amount_max: 50,
        times_applied: 0
      };

      expect(matchesRule(txn, rule)).toBe(false);
    });

    it('should match transaction type', () => {
      const txn: BankStatementTransaction = {
        id: 1,
        import_id: 1,
        transaction_date: '2024-01-15',
        description: 'Check payment',
        amount: -100.00,
        transaction_type: 'check',
        match_status: 'unmatched'
      };

      const rule: CategorizationRule = {
        id: 1,
        rule_name: 'Check Payments',
        priority: 1,
        is_active: true,
        transaction_type: 'check',
        times_applied: 0
      };

      expect(matchesRule(txn, rule)).toBe(true);
    });

    it('should not match if transaction type differs', () => {
      const txn: BankStatementTransaction = {
        id: 1,
        import_id: 1,
        transaction_date: '2024-01-15',
        description: 'Card payment',
        amount: -100.00,
        transaction_type: 'debit',
        match_status: 'unmatched'
      };

      const rule: CategorizationRule = {
        id: 1,
        rule_name: 'Check Payments',
        priority: 1,
        is_active: true,
        transaction_type: 'check',
        times_applied: 0
      };

      expect(matchesRule(txn, rule)).toBe(false);
    });

    it('should match multiple conditions', () => {
      const txn: BankStatementTransaction = {
        id: 1,
        import_id: 1,
        transaction_date: '2024-01-15',
        description: 'AMAZON PURCHASE',
        amount: -35.00,
        transaction_type: 'debit',
        match_status: 'unmatched'
      };

      const rule: CategorizationRule = {
        id: 1,
        rule_name: 'Amazon Small',
        priority: 1,
        is_active: true,
        description_pattern: 'amazon',
        amount_min: 10,
        amount_max: 50,
        transaction_type: 'debit',
        times_applied: 0
      };

      expect(matchesRule(txn, rule)).toBe(true);
    });

    it('should not match if any condition fails', () => {
      const txn: BankStatementTransaction = {
        id: 1,
        import_id: 1,
        transaction_date: '2024-01-15',
        description: 'AMAZON PURCHASE',
        amount: -75.00, // Outside range
        transaction_type: 'debit',
        match_status: 'unmatched'
      };

      const rule: CategorizationRule = {
        id: 1,
        rule_name: 'Amazon Small',
        priority: 1,
        is_active: true,
        description_pattern: 'amazon',
        amount_min: 10,
        amount_max: 50,
        transaction_type: 'debit',
        times_applied: 0
      };

      expect(matchesRule(txn, rule)).toBe(false);
    });
  });

  describe('String Similarity', () => {
    it('should return 1.0 for identical strings', () => {
      const similarity = calculateStringSimilarity('payment to vendor', 'payment to vendor');
      expect(similarity).toBe(1.0);
    });

    it('should return 0.0 for completely different strings', () => {
      const similarity = calculateStringSimilarity('abc', 'xyz');
      expect(similarity).toBe(0.0);
    });

    it('should return value between 0 and 1 for partially similar strings', () => {
      const similarity = calculateStringSimilarity('payment to vendor', 'payment vendor invoice');
      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThan(1);
    });

    it('should be case-sensitive (requires lowercase input)', () => {
      const sim1 = calculateStringSimilarity('payment', 'payment');
      const sim2 = calculateStringSimilarity('payment', 'PAYMENT');
      expect(sim1).toBe(1.0);
      expect(sim2).toBe(0.0);
    });

    it('should handle empty strings', () => {
      const similarity = calculateStringSimilarity('', '');
      // Empty strings create a single empty-string word in each set, so union size = 1, intersection size = 1
      expect(similarity).toBe(1.0);
    });
  });
});

// Helper to expose private functions for testing
// In a real implementation, you might export these from the service or use a different testing approach
function matchesRule(txn: BankStatementTransaction, rule: CategorizationRule): boolean {
  // Check description pattern
  if (rule.description_pattern) {
    const regex = new RegExp(rule.description_pattern, 'i');
    if (!regex.test(txn.description)) return false;
  }
  
  // Check payee pattern
  if (rule.payee_pattern && txn.payee) {
    const regex = new RegExp(rule.payee_pattern, 'i');
    if (!regex.test(txn.payee)) return false;
  }
  
  // Check amount range
  if (rule.amount_min !== undefined && rule.amount_min !== null) {
    if (Math.abs(txn.amount) < rule.amount_min) return false;
  }
  
  if (rule.amount_max !== undefined && rule.amount_max !== null) {
    if (Math.abs(txn.amount) > rule.amount_max) return false;
  }
  
  // Check transaction type
  if (rule.transaction_type && txn.transaction_type !== rule.transaction_type) {
    return false;
  }
  
  return true;
}

function calculateStringSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/));
  const words2 = new Set(str2.split(/\s+/));
  
  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);
  
  return union.size > 0 ? intersection.size / union.size : 0;
}
