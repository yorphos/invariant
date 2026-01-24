<script lang="ts">
  export let title = '';
  export let padding = true;
</script>

<div class="card" class:no-padding={!padding}>
  {#if title}
    <div class="card-header">
      <h3>{title}</h3>
    </div>
  {/if}
  <div class="card-content">
    <slot />
  </div>
</div>

<style>
  .card {
    background: white;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    margin-bottom: 24px;
  }

  .card-header {
    padding: 20px 24px;
    border-bottom: 1px solid #ecf0f1;
  }

  .card-header h3 {
    margin: 0;
    color: #2c3e50;
    font-size: 18px;
    font-weight: 600;
  }

  .card-content {
    padding: 24px;
  }

  .no-padding .card-content {
    padding: 0;
  }
</style>
