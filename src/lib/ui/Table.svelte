<script lang="ts">
  export let headers: string[] = [];
  export let striped = true;
  export let hoverable = true;
</script>

<div class="table-wrapper">
  <table class:striped class:hoverable>
    <thead>
      <tr>
        {#each headers as header}
          <th>{header}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      <slot />
    </tbody>
  </table>
</div>

<style>
  .table-wrapper {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    background: white;
  }

  thead {
    background: #f8f9fa;
    border-bottom: 2px solid #dee2e6;
  }

  th {
    padding: 12px 16px;
    text-align: left;
    font-weight: 600;
    font-size: 14px;
    color: #2c3e50;
  }

  :global(tbody td) {
    padding: 12px 16px;
    font-size: 14px;
    color: #555;
    border-bottom: 1px solid #ecf0f1;
  }

  .striped :global(tbody tr:nth-child(even)) {
    background: #f8f9fa;
  }

  .hoverable :global(tbody tr:hover) {
    background: #e8f4f8;
  }
</style>
