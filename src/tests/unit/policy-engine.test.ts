import { describe, it, expect } from 'vitest';
import { PolicyEngine } from '../../lib/domain/policy';
import type { PolicyMode, PostingResult, ValidationWarning } from '../../lib/domain/types';

/**
 * Policy Engine Tests
 * 
 * Tests for beginner vs pro mode policy enforcement
 */

const policyEngine = new PolicyEngine();

describe('Policy Engine - Context Creation', () => {
  it('should create context with beginner mode', () => {
    const context = policyEngine.createContext('beginner');
    
    expect(context.mode).toBe('beginner');
  });

  it('should create context with pro mode', () => {
    const context = policyEngine.createContext('pro');
    
    expect(context.mode).toBe('pro');
  });

  it('should include user in context when provided', () => {
    const context = policyEngine.createContext('beginner', 'user@example.com');
    
    expect(context.user).toBe('user@example.com');
  });
});

describe('Policy Engine - Blocking Rules', () => {
  it('should block errors in beginner mode', () => {
    const result: PostingResult = {
      ok: false,
      warnings: [
        { level: 'error', message: 'Invalid amount', requiresOverride: false }
      ]
    };
    
    const context = policyEngine.createContext('beginner');
    const shouldBlock = policyEngine.shouldBlock(result, context);
    
    expect(shouldBlock).toBe(true);
  });

  it('should block errors in pro mode', () => {
    const result: PostingResult = {
      ok: false,
      warnings: [
        { level: 'error', message: 'Invalid amount', requiresOverride: false }
      ]
    };
    
    const context = policyEngine.createContext('pro');
    const shouldBlock = policyEngine.shouldBlock(result, context);
    
    expect(shouldBlock).toBe(true);
  });

  it('should block warnings requiring override in beginner mode', () => {
    const result: PostingResult = {
      ok: true,
      warnings: [
        { level: 'warning', message: 'Unusual transaction', requiresOverride: true }
      ]
    };
    
    const context = policyEngine.createContext('beginner');
    const shouldBlock = policyEngine.shouldBlock(result, context);
    
    expect(shouldBlock).toBe(true);
  });

  it('should NOT block warnings requiring override in pro mode', () => {
    const result: PostingResult = {
      ok: true,
      warnings: [
        { level: 'warning', message: 'Unusual transaction', requiresOverride: true }
      ]
    };
    
    const context = policyEngine.createContext('pro');
    const shouldBlock = policyEngine.shouldBlock(result, context);
    
    expect(shouldBlock).toBe(false);
  });

  it('should NOT block warnings not requiring override in pro mode', () => {
    const result: PostingResult = {
      ok: true,
      warnings: [
        { level: 'warning', message: 'Transaction recorded', requiresOverride: false }
      ]
    };
    
    const beginnerContext = policyEngine.createContext('beginner');
    const proContext = policyEngine.createContext('pro');
    
    expect(policyEngine.shouldBlock(result, beginnerContext)).toBe(false);
    expect(policyEngine.shouldBlock(result, proContext)).toBe(false);
  });
});

describe('Policy Engine - Action Permissions', () => {
  it('should block editing posted entries in beginner mode', () => {
    const context = policyEngine.createContext('beginner');
    const result = policyEngine.canPerformAction('edit_posted_entry', context);
    
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Pro mode');
  });

  it('should allow editing posted entries in pro mode', () => {
    const context = policyEngine.createContext('pro');
    const result = policyEngine.canPerformAction('edit_posted_entry', context);
    
    expect(result.allowed).toBe(true);
  });

  it('should block manual journal entries in beginner mode', () => {
    const context = policyEngine.createContext('beginner');
    const result = policyEngine.canPerformAction('manual_journal_entry', context);
    
    expect(result.allowed).toBe(false);
  });

  it('should allow manual journal entries in pro mode', () => {
    const context = policyEngine.createContext('pro');
    const result = policyEngine.canPerformAction('manual_journal_entry', context);
    
    expect(result.allowed).toBe(true);
  });

  it('should block bulk operations in beginner mode', () => {
    const context = policyEngine.createContext('beginner');
    const result = policyEngine.canPerformAction('bulk_operations', context);
    
    expect(result.allowed).toBe(false);
  });

  it('should allow bulk operations in pro mode', () => {
    const context = policyEngine.createContext('pro');
    const result = policyEngine.canPerformAction('bulk_operations', context);
    
    expect(result.allowed).toBe(true);
  });
});

describe('Policy Engine - Recommended Workflows', () => {
  it('should provide revenue workflow for beginners', () => {
    const context = policyEngine.createContext('beginner');
    const workflow = policyEngine.getRecommendedWorkflow('revenue', context);
    
    expect(workflow.length).toBeGreaterThan(0);
    expect(workflow).toContain('Create invoice');
    expect(workflow).toContain('Record payment received');
  });

  it('should provide expense workflow for beginners', () => {
    const context = policyEngine.createContext('beginner');
    const workflow = policyEngine.getRecommendedWorkflow('expense', context);
    
    expect(workflow.length).toBeGreaterThan(0);
    expect(workflow).toContain('Record expense');
    expect(workflow).toContain('Select expense category');
  });

  it('should provide purchase workflow for beginners', () => {
    const context = policyEngine.createContext('beginner');
    const workflow = policyEngine.getRecommendedWorkflow('purchase', context);
    
    expect(workflow.length).toBeGreaterThan(0);
    expect(workflow).toContain('Receive bill');
    expect(workflow).toContain('Record payment made');
  });

  it('should provide empty workflow for pro users', () => {
    const context = policyEngine.createContext('pro');
    const workflow = policyEngine.getRecommendedWorkflow('revenue', context);
    
    expect(workflow.length).toBe(0);
  });

  it('should return empty array for unknown transaction types', () => {
    const context = policyEngine.createContext('beginner');
    const workflow = policyEngine.getRecommendedWorkflow('unknown_type', context);
    
    expect(workflow.length).toBe(0);
  });
});

describe('Policy Engine - Policy Messages', () => {
  it('should provide helpful message for beginner override warnings', () => {
    const result: PostingResult = {
      ok: true,
      warnings: [
        { level: 'warning', message: 'Large transaction amount', requiresOverride: true }
      ]
    };
    
    const context = policyEngine.createContext('beginner');
    const message = policyEngine.getPolicyMessage(result, context);
    
    expect(message).toContain('Pro mode');
    expect(message).toContain('Large transaction amount');
  });

  it('should provide error message for errors', () => {
    const result: PostingResult = {
      ok: false,
      warnings: [
        { level: 'error', message: 'Invalid amount', requiresOverride: false }
      ]
    };
    
    const context = policyEngine.createContext('beginner');
    const message = policyEngine.getPolicyMessage(result, context);
    
    expect(message).toContain('Invalid amount');
  });

  it('should combine multiple error messages', () => {
    const result: PostingResult = {
      ok: false,
      warnings: [
        { level: 'error', message: 'Invalid amount', requiresOverride: false },
        { level: 'error', message: 'Missing description', requiresOverride: false }
      ]
    };
    
    const context = policyEngine.createContext('beginner');
    const message = policyEngine.getPolicyMessage(result, context);
    
    expect(message).toContain('Invalid amount');
    expect(message).toContain('Missing description');
  });

  it('should return empty string for successful results with no warnings', () => {
    const result: PostingResult = {
      ok: true,
      warnings: []
    };
    
    const context = policyEngine.createContext('beginner');
    const message = policyEngine.getPolicyMessage(result, context);
    
    expect(message).toBe('');
  });
});
