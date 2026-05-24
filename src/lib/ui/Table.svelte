<script lang="ts">
  type TableItem = Record<string, unknown>;

  export let headers: string[] = [];
  export let items: TableItem[] = [];
  export let striped = true;
  export let hoverable = true;
  export let sortable = true;
  export let filterText = '';
  export let filterKeys: string[] = [];
  export let sortKeys: Array<string | null> = [];
  export let pageSize = 0;
  export let currentPage = 1;

  let sortColumn: string | null = null;
  let sortDirection: 'asc' | 'desc' = 'asc';

  function getColumnKey(index: number): string | null {
    const configuredKey = sortKeys[index];

    if (configuredKey === null) {
      return null;
    }

    if (configuredKey) {
      return configuredKey;
    }

    const fallbackHeader = headers[index];
    if (items.length > 0 && fallbackHeader in items[0]) {
      return fallbackHeader;
    }

    return null;
  }

  function isSortableColumn(index: number): boolean {
    return sortable && getColumnKey(index) !== null;
  }

  function handleSort(columnIndex: number) {
    const columnKey = getColumnKey(columnIndex);

    if (!columnKey) {
      return;
    }

    if (sortColumn === columnKey) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
      return;
    }

    sortColumn = columnKey;
    sortDirection = 'asc';
  }

  function getComparableValue(value: unknown): number | string {
    if (value instanceof Date) {
      return value.getTime();
    }

    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }

    if (typeof value === 'string') {
      const parsedDate = Date.parse(value);
      if (!Number.isNaN(parsedDate) && /^\d{4}-\d{2}-\d{2}/.test(value)) {
        return parsedDate;
      }

      return value.toLowerCase();
    }

    if (value === null || value === undefined) {
      return '';
    }

    return String(value).toLowerCase();
  }

  function compareValues(a: unknown, b: unknown): number {
    const aValue = getComparableValue(a);
    const bValue = getComparableValue(b);

    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return aValue - bValue;
    }

    return String(aValue).localeCompare(String(bValue), undefined, {
      numeric: true,
      sensitivity: 'base'
    });
  }

  function getSortIndicator(index: number): 'asc' | 'desc' | null {
    const columnKey = getColumnKey(index);
    return columnKey && sortColumn === columnKey ? sortDirection : null;
  }

  function changePage(nextPage: number) {
    currentPage = Math.min(Math.max(nextPage, 1), totalPages);
  }

  $: normalizedFilterText = filterText.trim().toLowerCase();

  $: processedItems = items;

  $: if (normalizedFilterText && filterKeys.length > 0) {
    processedItems = items.filter((item) =>
      filterKeys.some((key) => String(item[key] ?? '').toLowerCase().includes(normalizedFilterText))
    );
  }

  $: if (sortColumn) {
    processedItems = [...processedItems].sort((a, b) => {
      const direction = sortDirection === 'asc' ? 1 : -1;
      return compareValues(a[sortColumn], b[sortColumn]) * direction;
    });
  }

  $: totalPages = pageSize > 0 ? Math.max(1, Math.ceil(processedItems.length / pageSize)) : 1;

  $: if (currentPage < 1) {
    currentPage = 1;
  }

  $: if (currentPage > totalPages) {
    currentPage = totalPages;
  }

  $: displayedItems = pageSize > 0
    ? processedItems.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : processedItems;
</script>

<div class="table-wrapper">
  <table class:striped class:hoverable>
    <thead>
      <tr>
        {#each headers as header, index}
          <th class:sortable-column={isSortableColumn(index)}>
            {#if isSortableColumn(index)}
              <button type="button" class="header-button" onclick={() => handleSort(index)}>
                <span>{header}</span>
                <span class="sort-indicator" aria-hidden="true">
                  {#if getSortIndicator(index) === 'asc'}
                    ↑
                  {:else if getSortIndicator(index) === 'desc'}
                    ↓
                  {:else}
                    ↕
                  {/if}
                </span>
              </button>
            {:else}
              <span class="header-label">{header}</span>
            {/if}
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      <slot
        displayedItems={displayedItems}
        processedItems={processedItems}
        totalItems={items.length}
        currentPage={currentPage}
        totalPages={totalPages}
      />
    </tbody>
  </table>
</div>

{#if pageSize > 0 && totalPages > 1}
  <div class="pagination">
    <button type="button" class="page-button" onclick={() => changePage(currentPage - 1)} disabled={currentPage === 1}>
      Previous
    </button>
    <span class="page-status">Page {currentPage} of {totalPages}</span>
    <button type="button" class="page-button" onclick={() => changePage(currentPage + 1)} disabled={currentPage === totalPages}>
      Next
    </button>
  </div>
{/if}

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
    white-space: nowrap;
  }

  .sortable-column {
    padding: 0;
  }

  .header-button,
  .header-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 12px 16px;
    font: inherit;
    color: inherit;
  }

  .header-button {
    border: none;
    background: none;
    cursor: pointer;
    text-align: left;
  }

  .header-button:hover {
    color: #3498db;
  }

  .sort-indicator {
    color: #95a5a6;
    font-size: 12px;
    line-height: 1;
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

  .pagination {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 12px;
    padding: 16px 0 0;
  }

  .page-button {
    padding: 8px 12px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: white;
    color: #2c3e50;
    cursor: pointer;
    font: inherit;
    transition: border-color 0.2s, color 0.2s, background 0.2s;
  }

  .page-button:hover:not(:disabled) {
    border-color: #3498db;
    color: #3498db;
    background: #f8f9fa;
  }

  .page-button:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .page-status {
    font-size: 14px;
    color: #555;
  }
</style>
