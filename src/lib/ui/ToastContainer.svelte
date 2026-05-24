<script lang="ts">
import { toasts, type Toast } from '../stores/toast';

function getTypeClass(type: Toast['type']): string {
  return `toast-${type}`;
}

function getIcon(type: Toast['type']): string {
  switch (type) {
    case 'success':
      return '✓';
    case 'error':
      return '✕';
    case 'warning':
      return '⚠';
    case 'info':
      return 'ℹ';
    default:
      return '';
  }
}
</script>

<div class="toast-container">
  {#each $toasts as toast (toast.id)}
    <div class="toast {getTypeClass(toast.type)}" role="alert">
      <span class="toast-icon">{getIcon(toast.type)}</span>
      <span class="toast-message">{toast.message}</span>
      {#if toast.dismissible}
        <button 
          class="toast-dismiss" 
          onclick={() => toasts.dismiss(toast.id)}
          aria-label="Dismiss"
        >
          ×
        </button>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 400px;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    font-size: 14px;
    line-height: 1.4;
    pointer-events: auto;
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  .toast-success {
    background: var(--color-toast-success-bg, #d4edda);
    border: 1px solid var(--color-toast-success-border, #c3e6cb);
    color: var(--color-toast-success-text, #155724);
  }

  .toast-error {
    background: var(--color-toast-error-bg, #f8d7da);
    border: 1px solid var(--color-toast-error-border, #f5c6cb);
    color: var(--color-toast-error-text, #721c24);
  }

  .toast-warning {
    background: var(--color-toast-warning-bg, #fff3cd);
    border: 1px solid var(--color-toast-warning-border, #ffc107);
    color: var(--color-toast-warning-text, #856404);
  }

  .toast-info {
    background: var(--color-toast-info-bg, #d1ecf1);
    border: 1px solid var(--color-toast-info-border, #bee5eb);
    color: var(--color-toast-info-text, #0c5460);
  }

  .toast-icon {
    flex-shrink: 0;
    font-size: 16px;
    font-weight: bold;
  }

  .toast-message {
    flex: 1;
    word-break: break-word;
    white-space: pre-line;
  }

  .toast-dismiss {
    flex-shrink: 0;
    background: none;
    border: none;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    opacity: 0.6;
    padding: 0;
    margin-left: 8px;
    color: inherit;
  }

  .toast-dismiss:hover {
    opacity: 1;
  }

  @media (max-width: 480px) {
    .toast-container {
      left: 20px;
      right: 20px;
      max-width: none;
    }
  }
</style>
