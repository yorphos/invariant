<script lang="ts">
  export let value: string | number = '';
  export let type: 'text' | 'number' | 'email' | 'date' | 'tel' = 'text';
  export let label = '';
  export let placeholder = '';
  export let disabled = false;
  export let required = false;
  export let error = '';
  export let step: string | undefined = undefined;
  export let min: string | number | undefined = undefined;
  export let max: string | number | undefined = undefined;

  // Generate unique ID for label-input association
  const id = `input-${Math.random().toString(36).substr(2, 9)}`;
</script>

<div class="input-group">
  {#if label}
    <label for={id}>
      {label}
      {#if required}<span class="required">*</span>{/if}
    </label>
  {/if}
  <input
    {id}
    {type}
    {placeholder}
    {disabled}
    {required}
    {step}
    {min}
    {max}
    bind:value
    on:input
    on:change
    on:blur
    class:error={error}
  />
  {#if error}
    <span class="error-message">{error}</span>
  {/if}
</div>

<style>
  .input-group {
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

  input {
    padding: 10px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    font-size: 14px;
    font-family: inherit;
    transition: border-color 0.2s;
  }

  input:focus {
    outline: none;
    border-color: #3498db;
  }

  input:disabled {
    background: #f5f5f5;
    cursor: not-allowed;
  }

  input.error {
    border-color: #e74c3c;
  }

  .error-message {
    font-size: 13px;
    color: #e74c3c;
  }
</style>
