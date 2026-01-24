<script lang="ts">
  import { batchOperationsService, type BatchOperationResult, type PaymentImportRow } from '../services/batch-operations';
  import { persistenceService } from '../services/persistence';
  import type { PolicyMode, Invoice } from '../domain/types';
  import Button from '../ui/Button.svelte';
  import Card from '../ui/Card.svelte';
  import Table from '../ui/Table.svelte';

  export let mode: PolicyMode;

  let activeTab: 'payments' | 'invoices' = 'payments';
  let csvText = '';
  let parsedRows: PaymentImportRow[] = [];
  let parseError = '';
  let importResult: BatchOperationResult | null = null;
  let importing = false;

  // Bulk invoice operations
  let invoices: Invoice[] = [];
  let selectedInvoiceIds: number[] = [];
  let bulkOperation: 'void' | 'draft' | 'sent' | null = null;
  let bulkResult: BatchOperationResult | null = null;
  let loading = false;

  $: if (activeTab === 'invoices' && invoices.length === 0) {
    loadInvoices();
  }

  async function loadInvoices() {
    loading = true;
    try {
      invoices = await persistenceService.getInvoices();
    } catch (e) {
      console.error('Failed to load invoices:', e);
    }
    loading = false;
  }

  function parseCSV() {
    parseError = '';
    parsedRows = [];
    importResult = null;

    try {
      parsedRows = batchOperationsService.parsePaymentCSV(csvText);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }
  }

  async function importPayments() {
    if (parsedRows.length === 0) {
      return;
    }

    importing = true;
    importResult = null;

    try {
      importResult = await batchOperationsService.importPaymentsFromCSV(parsedRows, mode);
    } catch (error) {
      parseError = error instanceof Error ? error.message : String(error);
    }

    importing = false;
  }

  function toggleInvoiceSelection(invoiceId: number) {
    if (selectedInvoiceIds.includes(invoiceId)) {
      selectedInvoiceIds = selectedInvoiceIds.filter(id => id !== invoiceId);
    } else {
      selectedInvoiceIds = [...selectedInvoiceIds, invoiceId];
    }
  }

  async function executeBulkOperation() {
    if (!bulkOperation || selectedInvoiceIds.length === 0) {
      return;
    }

    loading = true;
    bulkResult = null;

    try {
      bulkResult = await batchOperationsService.bulkUpdateInvoiceStatus(
        selectedInvoiceIds,
        bulkOperation,
        mode
      );

      // Reload invoices to show updated status
      await loadInvoices();
      selectedInvoiceIds = [];
    } catch (error) {
      alert('Bulk operation failed: ' + error);
    }

    loading = false;
  }

  function clearImport() {
    csvText = '';
    parsedRows = [];
    parseError = '';
    importResult = null;
  }
</script>

<div class="batch-operations-view">
  <h2>Batch Operations</h2>

  <div class="tabs">
    <button
      class="tab"
      class:active={activeTab === 'payments'}
      on:click={() => activeTab = 'payments'}
    >
      Import Payments from CSV
    </button>
    <button
      class="tab"
      class:active={activeTab === 'invoices'}
      on:click={() => activeTab = 'invoices'}
    >
      Bulk Invoice Operations
    </button>
  </div>

  {#if activeTab === 'payments'}
    <Card title="Import Payments from CSV">
      <p class="hint">
        Upload a CSV file with columns: Payment Number, Customer, Date, Amount, Method (optional), Reference (optional), Notes (optional), Invoice Numbers (optional, comma-separated)
      </p>

      <div class="csv-input">
        <textarea
          bind:value={csvText}
          placeholder="Paste CSV content here..."
          rows="10"
        ></textarea>

        <div class="actions">
          <Button on:click={parseCSV} disabled={!csvText.trim()}>
            Parse CSV
          </Button>
          {#if parsedRows.length > 0}
            <Button on:click={clearImport} variant="ghost">
              Clear
            </Button>
          {/if}
        </div>
      </div>

      {#if parseError}
        <div class="error-message">
          <strong>Parse Error:</strong> {parseError}
        </div>
      {/if}

      {#if parsedRows.length > 0}
        <div class="parsed-preview">
          <h4>Parsed {parsedRows.length} payment(s)</h4>
          <Table headers={['#', 'Payment Number', 'Customer', 'Date', 'Amount', 'Method']}>
            {#each parsedRows as row, i}
              <tr>
                <td>{i + 1}</td>
                <td>{row.paymentNumber}</td>
                <td>{row.customerName || '-'}</td>
                <td>{row.paymentDate}</td>
                <td>${row.amount.toFixed(2)}</td>
                <td class="capitalize">{row.paymentMethod}</td>
              </tr>
            {/each}
          </Table>

          <div class="import-actions">
            <Button on:click={importPayments} disabled={importing}>
              {importing ? 'Importing...' : `Import ${parsedRows.length} Payment(s)`}
            </Button>
          </div>
        </div>
      {/if}

      {#if importResult}
        <div class="result-summary" class:has-failures={importResult.failureCount > 0}>
          <h4>Import Results</h4>
          <div class="result-stats">
            <div class="stat success">
              <strong>{importResult.successCount}</strong> succeeded
            </div>
            <div class="stat failure">
              <strong>{importResult.failureCount}</strong> failed
            </div>
          </div>

          {#if importResult.failureCount > 0}
            <div class="failures">
              <h5>Failures:</h5>
              {#each importResult.results.filter(r => !r.success) as result}
                <div class="failure-item">
                  <strong>Row {result.itemIndex + 2}:</strong> {result.itemDescription} - {result.error}
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
    </Card>
  {:else}
    <Card title="Bulk Invoice Operations">
      <p class="hint">
        Select multiple invoices and apply bulk operations (void, change status, etc.)
      </p>

      {#if loading}
        <p>Loading invoices...</p>
      {:else if invoices.length === 0}
        <p>No invoices found.</p>
      {:else}
        <div class="bulk-controls">
          <div class="selection-info">
            <strong>{selectedInvoiceIds.length}</strong> invoice(s) selected
          </div>

          {#if selectedInvoiceIds.length > 0}
            <div class="bulk-actions">
              <Button
                variant="secondary"
                on:click={() => bulkOperation = 'void'}
                disabled={loading}
              >
                Void Selected
              </Button>
              <Button
                variant="secondary"
                on:click={() => bulkOperation = 'sent'}
                disabled={loading || mode === 'beginner'}
              >
                Mark as Sent
              </Button>
              <Button
                variant="secondary"
                on:click={() => bulkOperation = 'draft'}
                disabled={loading || mode === 'beginner'}
              >
                Mark as Draft
              </Button>
            </div>
          {/if}
        </div>

        {#if bulkOperation}
          <div class="confirmation">
            <p>
              Are you sure you want to <strong>{bulkOperation}</strong> {selectedInvoiceIds.length} invoice(s)?
            </p>
            <div class="confirmation-actions">
              <Button on:click={executeBulkOperation} disabled={loading}>
                Confirm
              </Button>
              <Button variant="ghost" on:click={() => bulkOperation = null}>
                Cancel
              </Button>
            </div>
          </div>
        {/if}

        <Card padding={false}>
          <Table headers={['Select', 'Invoice #', 'Customer', 'Date', 'Amount', 'Status']}>
            {#each invoices as invoice}
              {@const contact = invoice.contact_id}
              <tr class:selected={selectedInvoiceIds.includes(invoice.id!)}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedInvoiceIds.includes(invoice.id!)}
                    on:change={() => toggleInvoiceSelection(invoice.id!)}
                  />
                </td>
                <td><strong>{invoice.invoice_number}</strong></td>
                <td>Customer #{contact}</td>
                <td>{new Date(invoice.issue_date).toLocaleDateString('en-CA')}</td>
                <td>${invoice.total_amount.toFixed(2)}</td>
                <td>
                  <span class="badge {invoice.status}">{invoice.status}</span>
                </td>
              </tr>
            {/each}
          </Table>
        </Card>

        {#if bulkResult}
          <div class="result-summary" class:has-failures={bulkResult.failureCount > 0}>
            <h4>Bulk Operation Results</h4>
            <div class="result-stats">
              <div class="stat success">
                <strong>{bulkResult.successCount}</strong> succeeded
              </div>
              <div class="stat failure">
                <strong>{bulkResult.failureCount}</strong> failed
              </div>
            </div>

            {#if bulkResult.failureCount > 0}
              <div class="failures">
                <h5>Failures:</h5>
                {#each bulkResult.results.filter(r => !r.success) as result}
                  <div class="failure-item">
                    <strong>{result.itemDescription}:</strong> {result.error}
                  </div>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/if}
    </Card>
  {/if}
</div>

<style>
  .batch-operations-view {
    max-width: 1200px;
  }

  h2 {
    margin-bottom: 24px;
    color: #2c3e50;
    font-size: 28px;
  }

  .tabs {
    display: flex;
    gap: 8px;
    margin-bottom: 24px;
    border-bottom: 2px solid #ecf0f1;
  }

  .tab {
    padding: 12px 24px;
    background: none;
    border: none;
    border-bottom: 3px solid transparent;
    cursor: pointer;
    font-size: 16px;
    font-weight: 500;
    color: #7f8c8d;
    transition: all 0.2s;
  }

  .tab:hover {
    color: #2c3e50;
  }

  .tab.active {
    color: #3498db;
    border-bottom-color: #3498db;
  }

  .hint {
    color: #7f8c8d;
    font-size: 14px;
    margin-bottom: 16px;
  }

  .csv-input textarea {
    width: 100%;
    padding: 12px;
    border: 2px solid #ecf0f1;
    border-radius: 6px;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    resize: vertical;
  }

  .actions,
  .import-actions {
    display: flex;
    gap: 12px;
    margin-top: 16px;
  }

  .error-message {
    background: #fadbd8;
    border-left: 4px solid #e74c3c;
    padding: 16px;
    border-radius: 6px;
    margin-top: 16px;
    color: #c0392b;
  }

  .parsed-preview {
    margin-top: 24px;
  }

  .parsed-preview h4 {
    margin-bottom: 16px;
    color: #2c3e50;
  }

  .capitalize {
    text-transform: capitalize;
  }

  .result-summary {
    background: #d5f4e6;
    border-left: 4px solid #27ae60;
    padding: 16px;
    border-radius: 6px;
    margin-top: 24px;
  }

  .result-summary.has-failures {
    background: #fef5e7;
    border-left-color: #f39c12;
  }

  .result-summary h4 {
    margin-top: 0;
    margin-bottom: 16px;
    color: #2c3e50;
  }

  .result-stats {
    display: flex;
    gap: 24px;
    margin-bottom: 16px;
  }

  .stat {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .stat.success strong {
    color: #27ae60;
  }

  .stat.failure strong {
    color: #e74c3c;
  }

  .failures {
    margin-top: 16px;
  }

  .failures h5 {
    margin-bottom: 12px;
    color: #e74c3c;
  }

  .failure-item {
    background: white;
    padding: 8px 12px;
    border-radius: 4px;
    margin-bottom: 8px;
    font-size: 14px;
  }

  .bulk-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
    background: #f8f9fa;
    border-radius: 6px;
    margin-bottom: 16px;
  }

  .selection-info {
    font-size: 16px;
    color: #2c3e50;
  }

  .bulk-actions {
    display: flex;
    gap: 12px;
  }

  .confirmation {
    background: #fef5e7;
    border: 2px solid #f39c12;
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .confirmation p {
    margin-bottom: 16px;
    color: #2c3e50;
  }

  .confirmation-actions {
    display: flex;
    gap: 12px;
  }

  .badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    text-transform: capitalize;
  }

  .badge.draft {
    background: #ecf0f1;
    color: #7f8c8d;
  }

  .badge.sent {
    background: #e8f4f8;
    color: #3498db;
  }

  .badge.paid {
    background: #d5f4e6;
    color: #27ae60;
  }

  .badge.void {
    background: #fadbd8;
    color: #e74c3c;
  }

  tr.selected {
    background: #e8f4f8;
  }

  input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }
</style>
