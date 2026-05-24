<script lang="ts">
export let variant: 'primary' | 'secondary' | 'danger' | 'ghost' = 'primary';
export let size: 'sm' | 'md' | 'lg' = 'md';
export let disabled = false;
export let type: 'button' | 'submit' = 'button';
export let onclick: ((e: MouseEvent) => void) | undefined = undefined;
</script>

<button 
  class="btn {variant} {size}"
  {type}
  {disabled}
  {onclick}
>
  <slot />
</button>

<style>
  .btn {
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    font-family: inherit;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Variants */
  .primary {
    background: var(--color-accent, #3498db);
    color: white;
  }

  .primary:hover:not(:disabled) {
    background: var(--color-accent-hover, #2980b9);
  }

  .secondary {
    background: var(--color-surface-muted, #95a5a6);
    color: white;
  }

  .secondary:hover:not(:disabled) {
    background: var(--color-surface-muted-hover, #7f8c8d);
  }

  .danger {
    background: var(--color-danger, #e74c3c);
    color: white;
  }

  .danger:hover:not(:disabled) {
    background: var(--color-danger-hover, #c0392b);
  }

  .ghost {
    background: transparent;
    color: var(--color-accent, #3498db);
    border: 1px solid var(--color-accent, #3498db);
  }

  .ghost:hover:not(:disabled) {
    background: var(--color-border-light, #ecf0f1);
  }

  /* Sizes */
  .sm {
    padding: 6px 12px;
    font-size: 13px;
  }

  .md {
    padding: 10px 20px;
    font-size: 14px;
  }

  .lg {
    padding: 14px 28px;
    font-size: 16px;
  }
</style>
