<script lang="ts">
  export let value: string | number = '';
  export let label = '';
  export let options: { value: string | number; label: string }[] = [];
  export let disabled = false;
  export let required = false;
  export let error = '';
  export let placeholder = 'Select...';
  export let onchange: ((e: Event & { currentTarget: HTMLSelectElement }) => void) | undefined = undefined;

  // Generate unique ID for label-select association
  const id = `select-${Math.random().toString(36).substr(2, 9)}`;
</script>

<div class="select-group">
  {#if label}
    <label for={id}>
      {label}
      {#if required}<span class="required">*</span>{/if}
    </label>
  {/if}
  <select
    {id}
    bind:value
    {disabled}
    {required}
    {onchange}
    class:error={error}
  >
    {#if placeholder}
      <option value="" disabled>{placeholder}</option>
    {/if}
    {#if options.length > 0}
      {#each options as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    {:else}
      <slot />
    {/if}
  </select>
  {#if error}
    <span class="error-message">{error}</span>
  {/if}
</div>

<style>
  .select-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
  }

  label {
    font-size: 14px;
    font-weight: 500;
    color: #2c3e50;
  }

  .required {
    color: #e74c3c;
  }

  select {
    padding: 10px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    font-family: inherit;
    background: white;
    cursor: pointer;
    transition: border-color 0.2s;
  }

  select:focus {
    outline: none;
    border-color: #3498db;
  }

  select:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }

  select.error {
    border-color: #e74c3c;
  }

  .error-message {
    font-size: 13px;
    color: #e74c3c;
  }
</style>
