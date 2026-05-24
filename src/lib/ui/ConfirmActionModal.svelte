<script lang="ts">
import Modal from './Modal.svelte';
import Button from './Button.svelte';

export let title: string;
export let message: string;
export let onConfirm: () => void;
export let onCancel: () => void;

function handleClose() {
  onCancel();
}
</script>

<Modal open={true} {title} onclose={handleClose} size="small">
  <div class="confirm-content">
    <p>{message}</p>
    <div class="confirm-actions">
      <Button variant="secondary" onclick={onCancel}>Cancel</Button>
      <Button variant="danger" onclick={onConfirm}>Confirm</Button>
    </div>
  </div>
</Modal>

<style>
  .confirm-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .confirm-content p {
    margin: 0;
    white-space: pre-wrap;
    line-height: 1.5;
    color: var(--color-text-primary, #2c3e50);
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
  }
</style>
