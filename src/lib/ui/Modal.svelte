<script lang="ts">
  export let open = false;
  export let title = '';
  export let size: 'small' | 'medium' | 'large' | 'xlarge' = 'medium';
  export let onclose: () => void = () => {};

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      onclose();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onclose();
    }
  }
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
    <div class="modal {size}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-header">
        <h2 id="modal-title">{title}</h2>
        <button class="close-btn" onclick={onclose} aria-label="Close">
          &times;
        </button>
      </div>
      <div class="modal-body">
        <slot />
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal {
    background: white;
    border-radius: 8px;
    width: 90%;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
  }

  .modal.small {
    max-width: 400px;
  }

  .modal.medium {
    max-width: 600px;
  }

  .modal.large {
    max-width: 900px;
  }

  .modal.xlarge {
    max-width: 1200px;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #ecf0f1;
  }

  .modal-header h2 {
    margin: 0;
    font-size: 20px;
    color: #2c3e50;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 28px;
    color: #95a5a6;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .close-btn:hover {
    background: #ecf0f1;
    color: #2c3e50;
  }

  .modal-body {
    padding: 24px;
    overflow-y: auto;
  }
</style>
