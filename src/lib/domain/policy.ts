import type {
  PolicyContext,
  PolicyMode,
  ValidationWarning,
  PostingResult
} from './types';

/**
 * Policy engine - enforces beginner vs pro mode rules
 */
export class PolicyEngine {
  createContext(mode: PolicyMode, user?: string): PolicyContext {
    return { mode, user };
  }

  /**
   * Check if warnings require blocking in current mode
   */
  shouldBlock(result: PostingResult, context: PolicyContext): boolean {
    if (context.mode === 'pro') {
      // Pro mode only blocks hard errors
      return result.warnings.some(w => w.level === 'error' && !w.requiresOverride);
    }

    // Beginner mode blocks all errors and warnings that require override
    return result.warnings.some(w => 
      w.level === 'error' || (w.level === 'warning' && w.requiresOverride)
    );
  }

  /**
   * Get user-friendly message for policy enforcement
   */
  getPolicyMessage(result: PostingResult, context: PolicyContext): string {
    if (context.mode === 'beginner') {
      const overrideWarnings = result.warnings.filter(w => w.requiresOverride);
      if (overrideWarnings.length > 0) {
        return `This action requires review. ${overrideWarnings[0].message} Switch to Pro mode to override this check.`;
      }
    }

    const errors = result.warnings.filter(w => w.level === 'error');
    if (errors.length > 0) {
      return errors.map(e => e.message).join('. ');
    }

    return '';
  }

  /**
   * Validate if user can perform an action in current mode
   */
  canPerformAction(action: string, context: PolicyContext): {
    allowed: boolean;
    reason?: string;
  } {
    const beginnerBlockedActions = [
      'edit_posted_entry',
      'delete_posted_entry',
      'manual_journal_entry', // Without going through wizards
      'bulk_operations'
    ];

    if (context.mode === 'beginner' && beginnerBlockedActions.includes(action)) {
      return {
        allowed: false,
        reason: 'This action is only available in Pro mode. Switch modes in Settings.'
      };
    }

    return { allowed: true };
  }

  /**
   * Get recommended workflow for a transaction type
   */
  getRecommendedWorkflow(transactionType: string, context: PolicyContext): string[] {
    if (context.mode === 'pro') {
      return []; // Pro users can do whatever they want
    }

    const workflows: Record<string, string[]> = {
      revenue: [
        'Create customer contact',
        'Create invoice',
        'Send invoice to customer',
        'Record payment received',
        'Allocate payment to invoice',
        'Reconcile bank deposit'
      ],
      expense: [
        'Create vendor contact (if needed)',
        'Record expense',
        'Select expense category',
        'Attach receipt',
        'Record payment method'
      ],
      purchase: [
        'Create vendor contact',
        'Receive bill',
        'Review and approve',
        'Schedule payment',
        'Record payment made'
      ]
    };

    return workflows[transactionType] || [];
  }
}

export const policyEngine = new PolicyEngine();
