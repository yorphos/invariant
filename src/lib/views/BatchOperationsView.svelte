<script lang="ts">
  import { onMount } from 'svelte';
  import { persistenceService } from '../services/persistence';
  import { batchOperationsService } from '../services/batch-operations';
  import type { BatchOperationResult, PaymentImportRow } from '../services/batch-operations';
  import type { Contact, Invoice, InvoiceLine, PolicyMode } from '../domain/types';
  import Button from '../ui/Button.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Card from '../ui/Card.svelte';
  import Table from '../ui/Table.svelte';

  export let mode: PolicyMode;

  type OperationType = 'none' | 'batch-invoices' | 'import-payments' | 'bulk-status';

  let currentOperation: OperationType = 'none';
  let loading = false;
  let contacts: Contact[] = [];
  let invoices: Invoice[] = [];

  // Batch Invoice Creation state
  let selectedCustomers: number[] = [];
  let batchInvoiceStartDate = '';
  let batchInvoiceLineDescription = 'Monthly Service Fee';
  let batchInvoiceLineAmount = 0;
  let batchInvoiceStartNumber = 1000;

  // CSV Import state
  let csvText = '';
  let parsedPayments: PaymentImportRow[] = [];
  let csvParseError = '';

  // Bulk Status Change state
  let selectedInvoiceIds: number[] = [];
  let bulkStatusFilter: 'all' | 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' = 'all';
  let bulkNewStatus: 'draft' | 'sent' | 'void' = 'sent';

  // Operation Result state
  let operationResult: BatchOperationResult | null = null;
  let showResult = false;

  $: filteredInvoices = bulkStatusFilter === 'all'
    ? invoices
    : invoices.filter(inv => inv.status === bulkStatusFilter);

  onMount(async () => {
    await loadData();
    batchInvoiceStartDate = new Date().toISOString().split('T')[0];
  });

  async function loadData() {
    loading = true;
    try {
      [contacts, invoices] = await Promise.all([
        persistenceService.getContacts(),
        persistenceService.getInvoices()
      ]);
    } catch (e) {
      console.error('Failed to load data:', e);
      alert('Failed to load data: ' + e);
    }
    loading = false;
  }

  // Batch Invoice Creation
  async function handleBatchInvoices() {
    if (selectedCustomers.length === 0) {
      alert('Please select at least one customer');
      return;
    }

    if (!batchInvoiceLineDescription || batchInvoiceLineAmount <= 0) {
      alert('Please provide a valid line item description and amount');
      return;
    }

    loading = true;
    try {
      const batchInputs = selectedCustomers.map((contactId, index) => {
        const invoiceNumber = `INV-${String(batchInvoiceStartNumber + index).padStart(4, '0')}`;
        const contact = contacts.find(c => c.id === contactId)!;

        return {
          invoiceData: {
            invoice_number: invoiceNumber,
            contact_id: contactId,
            issue_date: batchInvoiceStartDate,
            due_date: batchInvoiceStartDate, // Could add due date offset
            notes: 'Batch generated invoice'
          },
          lines: [
            {
              line_number: 1,
              description: batchInvoiceLineDescription,
              quantity: 1,
              unit_price: batchInvoiceLineAmount,
              amount: batchInvoiceLineAmount,
              account_id: 0 // Will be determined by policy engine
            }
          ]
        };
      });

      operationResult = await batchOperationsService.batchCreateInvoices(batchInputs, { mode });
      showResult = true;
      
      if (operationResult.successCount > 0) {
        await loadData();
        selectedCustomers = [];
      }
    } catch (e) {
      alert('Batch operation failed: ' + e);
    }
    loading = false;
  }

  // CSV Payment Import
  function handleCSVParse() {
    try {
      parsedPayments = batchOperationsService.parsePaymentCSV(csvText);
      csvParseError = '';
    } catch (e) {
      csvParseError = e instanceof Error ? e.message : String(e);
      parsedPayments = [];
    }
  }

  async function handleImportPayments() {
    if (parsedPayments.length === 0) {
      alert('No payments to import. Please parse CSV first.');
      return;
    }

    loading = true;
    try {
      operationResult = await batchOperationsService.importPaymentsFromCSV(parsedPayments, mode);
      showResult = true;
      
      if (operationResult.successCount > 0) {
        await loadData();
        csvText = '';
        parsedPayments = [];
      }
    } catch (e) {
      alert('Import failed: ' + e);
    }
    loading = false;
  }

  // Bulk Status Changes
  function toggleInvoiceSelection(invoiceId: number) {
    if (selectedInvoiceIds.includes(invoiceId)) {
      selectedInvoiceIds = selectedInvoiceIds.filter(id => id !== invoiceId);
    } else {
      selectedInvoiceIds = [...selectedInvoiceIds, invoiceId];
    }
  }

  function selectAllInvoices() {
    selectedInvoiceIds = filteredInvoices.map(inv => inv.id!);
  }

  function clearSelection() {
    selectedInvoiceIds = [];
  }

  async function handleBulkStatusChange() {
    if (selectedInvoiceIds.length === 0) {
      alert('Please select at least one invoice');
      return;
    }

    const confirmMsg = bulkNewStatus === 'void'
      ? `Are you sure you want to VOID ${selectedInvoiceIds.length} invoices? This creates reversal entries.`
      : `Are you sure you want to change ${selectedInvoiceIds.length} invoices to "${bulkNewStatus}" status?`;

    if (!confirm(confirmMsg)) {
      return;
    }

    loading = true;
    try {
      operationResult = await batchOperationsService.bulkUpdateInvoiceStatus(
        selectedInvoiceIds,
        bulkNewStatus,
        mode
      );
      showResult = true;
      
      if (operationResult.successCount > 0) {
        await loadData();
        selectedInvoiceIds = [];
      }
    } catch (e) {
      alert('Bulk status change failed: ' + e);
    }
    loading = false;
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount);
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-CA');
  }

  function closeResultModal() {
    showResult = false;
    operationResult = null;
  }

  function downloadCSVTemplate() {
    const template = `Payment Number,Customer Name,Date,Amount,Method,Reference,Notes,Invoice Numbers
PAY-0001,Acme Corp,2026-01-24,1500.00,transfer,REF123,January payment,INV-0001
PAY-0002,Beta Inc,2026-01-24,2500.00,check,CHK456,Payment for invoices,INV-0002;INV-0003`;
    
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'payment-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
</script>

<div class="batch-operations-view">
  <div class="header">
    <h2>Batch Operations</h2>
  </div>

  {#if mode === 'beginner'}
    <Card>
      <p class="info-message">
        ℹ️ Batch operations are advanced features. Some operations may be restricted in beginner mode.
        Switch to Pro mode for full access.
      </p>
    </Card>
  {/if}

  <div class="operations-grid">
    <!-- Batch Invoice Creation -->
    <Card>
      <div class="operation-header">
        <h3>📄 Batch Invoice Creation</h3>
        <p class="operation-description">Create multiple invoices at once (e.g., monthly retainers)</p>
      </div>
      
      {#if currentOperation !== 'batch-invoices'}
        <Button on:click={() => currentOperation = 'batch-invoices'}>
          Start Batch Invoice Creation
        </Button>
      {:else}
        <div class="operation-form">
          <h4>Select Customers</h4>
          <div class="customer-list">
            {#each contacts.filter(c => c.type === 'customer' || c.type === 'both') as contact}
              <label class="checkbox-item">
                <input
                  type="checkbox"
                  checked={selectedCustomers.includes(contact.id!)}
                  on:change={() => {
                    if (selectedCustomers.includes(contact.id!)) {
                      selectedCustomers = selectedCustomers.filter(id => id !== contact.id!);
                    } else {
                      selectedCustomers = [...selectedCustomers, contact.id!];
                    }
                  }}
                />
                <span>{contact.name}</span>
              </label>
            {/each}
          </div>

          <h4>Invoice Details</h4>
          <Input
            type="date"
            label="Invoice Date"
            bind:value={batchInvoiceStartDate}
            required
          />
          
          <Input
            type="number"
            label="Starting Invoice Number"
            bind:value={batchInvoiceStartNumber}
            required
            min="1"
          />

          <h4>Line Item (Same for All)</h4>
          <Input
            label="Description"
            bind:value={batchInvoiceLineDescription}
            required
            placeholder="e.g., Monthly Service Fee"
          />
          
          <Input
            type="number"
            label="Amount"
            bind:value={batchInvoiceLineAmount}
            required
            min="0.01"
            step="0.01"
          />

          <div class="operation-summary">
            <p><strong>Summary:</strong> Create {selectedCustomers.length} invoices for {formatCurrency(batchInvoiceLineAmount)} each</p>
            <p><strong>Total:</strong> {formatCurrency(selectedCustomers.length * batchInvoiceLineAmount)}</p>
          </div>

          <div class="form-actions">
            <Button variant="ghost" on:click={() => { currentOperation = 'none'; selectedCustomers = []; }}>
              Cancel
            </Button>
            <Button on:click={handleBatchInvoices} disabled={loading || selectedCustomers.length === 0}>
              {loading ? 'Creating...' : `Create ${selectedCustomers.length} Invoices`}
            </Button>
          </div>
        </div>
      {/if}
    </Card>

    <!-- CSV Payment Import -->
    <Card>
      <div class="operation-header">
        <h3>💳 Import Payments from CSV</h3>
        <p class="operation-description">Import multiple payments from a CSV file (e.g., bank statement)</p>
      </div>
      
      {#if currentOperation !== 'import-payments'}
        <Button on:click={() => currentOperation = 'import-payments'}>
          Start Payment Import
        </Button>
      {:else}
        <div class="operation-form">
          <div class="csv-instructions">
            <p><strong>CSV Format:</strong> Payment Number, Customer Name, Date, Amount, Method, Reference, Notes, Invoice Numbers</p>
            <Button variant="secondary" size="sm" on:click={downloadCSVTemplate}>
              Download Template
            </Button>
          </div>

          <label>
            <strong>Paste CSV Data:</strong>
            <textarea
              bind:value={csvText}
              rows="10"
              placeholder="Payment Number,Customer Name,Date,Amount,Method,Reference,Notes,Invoice Numbers&#10;PAY-0001,Acme Corp,2026-01-24,1500.00,transfer,REF123,Payment,INV-0001"
              class="csv-textarea"
            ></textarea>
          </label>

          <div class="form-actions">
            <Button variant="secondary" on:click={handleCSVParse}>
              Parse CSV
            </Button>
          </div>

          {#if csvParseError}
            <div class="error-message">
              <strong>Parse Error:</strong> {csvParseError}
            </div>
          {/if}

          {#if parsedPayments.length > 0}
            <div class="parsed-preview">
              <h4>Parsed Payments ({parsedPayments.length})</h4>
              <div class="preview-table">
                <Table headers={['Payment #', 'Customer', 'Date', 'Amount', 'Method']}>
                  {#each parsedPayments.slice(0, 5) as payment}
                    <tr>
                      <td>{payment.paymentNumber}</td>
                      <td>{payment.customerName || '-'}</td>
                      <td>{formatDate(payment.paymentDate)}</td>
                      <td>{formatCurrency(payment.amount)}</td>
                      <td class="capitalize">{payment.paymentMethod}</td>
                    </tr>
                  {/each}
                </Table>
                {#if parsedPayments.length > 5}
                  <p class="preview-note">...and {parsedPayments.length - 5} more</p>
                {/if}
              </div>
            </div>
          {/if}

          <div class="form-actions">
            <Button variant="ghost" on:click={() => { currentOperation = 'none'; csvText = ''; parsedPayments = []; }}>
              Cancel
            </Button>
            <Button on:click={handleImportPayments} disabled={loading || parsedPayments.length === 0}>
              {loading ? 'Importing...' : `Import ${parsedPayments.length} Payments`}
            </Button>
          </div>
        </div>
      {/if}
    </Card>

    <!-- Bulk Status Changes -->
    <Card>
      <div class="operation-header">
        <h3>📋 Bulk Status Changes</h3>
        <p class="operation-description">Update status for multiple invoices at once</p>
      </div>
      
      {#if currentOperation !== 'bulk-status'}
        <Button on:click={() => currentOperation = 'bulk-status'}>
          Start Bulk Status Change
        </Button>
      {:else}
        <div class="operation-form">
          <div class="bulk-controls">
            <Select
              label="Filter Invoices"
              bind:value={bulkStatusFilter}
              options={[
                { value: 'all', label: 'All Invoices' },
                { value: 'draft', label: 'Draft Only' },
                { value: 'sent', label: 'Sent Only' },
                { value: 'paid', label: 'Paid Only' },
                { value: 'partial', label: 'Partially Paid' },
                { value: 'overdue', label: 'Overdue Only' }
              ]}
            />

            <Select
              label="New Status"
              bind:value={bulkNewStatus}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'sent', label: 'Sent' },
                { value: 'void', label: 'Void (creates reversal entries)' }
              ]}
            />
          </div>

          <div class="selection-actions">
            <Button variant="secondary" size="sm" on:click={selectAllInvoices}>
              Select All ({filteredInvoices.length})
            </Button>
            <Button variant="ghost" size="sm" on:click={clearSelection}>
              Clear Selection
            </Button>
            <span class="selection-count">{selectedInvoiceIds.length} selected</span>
          </div>

          <div class="invoice-selection-list">
            {#each filteredInvoices.slice(0, 10) as invoice}
              <label class="checkbox-item">
                <input
                  type="checkbox"
                  checked={selectedInvoiceIds.includes(invoice.id!)}
                  on:change={() => toggleInvoiceSelection(invoice.id!)}
                />
                <div class="invoice-info-compact">
                  <span class="invoice-number">{invoice.invoice_number}</span>
                  <span class="invoice-customer">{contacts.find(c => c.id === invoice.contact_id)?.name || '-'}</span>
                  <span class="invoice-amount">{formatCurrency(invoice.total_amount)}</span>
                  <span class="badge {invoice.status}">{invoice.status}</span>
                </div>
              </label>
            {/each}
            {#if filteredInvoices.length > 10}
              <p class="preview-note">...and {filteredInvoices.length - 10} more (select all to include)</p>
            {/if}
          </div>

          <div class="form-actions">
            <Button variant="ghost" on:click={() => { currentOperation = 'none'; selectedInvoiceIds = []; }}>
              Cancel
            </Button>
            <Button on:click={handleBulkStatusChange} disabled={loading || selectedInvoiceIds.length === 0} variant={bulkNewStatus === 'void' ? 'danger' : 'primary'}>
              {loading ? 'Processing...' : `Update ${selectedInvoiceIds.length} Invoices to "${bulkNewStatus}"`}
            </Button>
          </div>
        </div>
      {/if}
    </Card>
  </div>
</div>

<!-- Operation Result Modal -->
{#if showResult && operationResult}
  <div class="modal-overlay" on:click={closeResultModal} on:keydown={(e) => e.key === 'Escape' && closeResultModal()} role="button" tabindex="-1">
    <div class="modal-content" on:click|stopPropagation on:keydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <div class="modal-header">
        <h3>Batch Operation Results</h3>
        <button class="close-button" on:click={closeResultModal}>✕</button>
      </div>

      <div class="result-summary" class:has-failures={operationResult.failureCount > 0}>
        <div class="summary-stat success">
          <span class="stat-label">Successful:</span>
          <span class="stat-value">{operationResult.successCount}</span>
        </div>
        <div class="summary-stat total">
          <span class="stat-label">Total:</span>
          <span class="stat-value">{operationResult.totalItems}</span>
        </div>
        {#if operationResult.failureCount > 0}
          <div class="summary-stat failure">
            <span class="stat-label">Failed:</span>
            <span class="stat-value">{operationResult.failureCount}</span>
          </div>
        {/if}
      </div>

      <div class="result-details">
        <h4>Details</h4>
        <div class="result-list">
          {#each operationResult.results as result}
            <div class="result-item" class:success={result.success} class:failure={!result.success}>
              <div class="result-icon">{result.success ? '✓' : '✗'}</div>
              <div class="result-info">
                <strong>{result.itemDescription}</strong>
                {#if result.error}
                  <p class="result-error">{result.error}</p>
                {/if}
                {#if result.warnings && result.warnings.length > 0}
                  {#each result.warnings as warning}
                    <p class="result-warning">{warning}</p>
                  {/each}
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <div class="modal-actions">
        <Button on:click={closeResultModal}>Close</Button>
      </div>
    </div>
  </div>
{/if}

<style>
  .batch-operations-view {
    max-width: 1400px;
  }

  .header {
    margin-bottom: 24px;
  }

  .header h2 {
    margin: 0;
    color: #2c3e50;
    font-size: 28px;
  }

  .info-message {
    color: #2980b9;
    margin: 0;
  }

  .operations-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
    gap: 24px;
  }

  .operation-header {
    margin-bottom: 16px;
  }

  .operation-header h3 {
    margin: 0 0 8px 0;
    color: #2c3e50;
    font-size: 20px;
  }

  .operation-description {
    color: #7f8c8d;
    font-size: 14px;
    margin: 0;
  }

  .operation-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .customer-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 200px;
    overflow-y: auto;
    border: 1px solid #ddd;
    padding: 12px;
    border-radius: 6px;
    background: #f8f9fa;
  }

  .checkbox-item {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 8px;
    border-radius: 4px;
  }

  .checkbox-item:hover {
    background: #e8f4f8;
  }

  .checkbox-item input[type="checkbox"] {
    width: 18px;
    height: 18px;
    cursor: pointer;
  }

  .operation-summary {
    background: #e8f4f8;
    padding: 16px;
    border-radius: 6px;
    border-left: 4px solid #3498db;
  }

  .operation-summary p {
    margin: 4px 0;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 8px;
  }

  .csv-instructions {
    background: #fef5e7;
    border: 1px solid #f39c12;
    padding: 12px;
    border-radius: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
  }

  .csv-instructions p {
    margin: 0;
    font-size: 13px;
    flex: 1;
  }

  .csv-textarea {
    width: 100%;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    padding: 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    resize: vertical;
  }

  .error-message {
    background: #fadbd8;
    color: #e74c3c;
    padding: 12px;
    border-radius: 6px;
    border-left: 4px solid #e74c3c;
  }

  .parsed-preview {
    border: 1px solid #ddd;
    padding: 16px;
    border-radius: 6px;
    background: #f8f9fa;
  }

  .parsed-preview h4 {
    margin-top: 0;
    margin-bottom: 12px;
  }

  .preview-note {
    text-align: center;
    color: #7f8c8d;
    font-size: 14px;
    margin-top: 8px;
  }

  .bulk-controls {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .selection-actions {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .selection-count {
    color: #7f8c8d;
    font-size: 14px;
    font-weight: 500;
  }

  .invoice-selection-list {
    border: 1px solid #ddd;
    padding: 12px;
    border-radius: 6px;
    background: #f8f9fa;
    max-height: 300px;
    overflow-y: auto;
  }

  .invoice-info-compact {
    display: flex;
    gap: 12px;
    align-items: center;
    flex: 1;
  }

  .invoice-number {
    font-weight: 600;
    min-width: 100px;
  }

  .invoice-customer {
    flex: 1;
    color: #7f8c8d;
  }

  .invoice-amount {
    font-weight: 500;
    min-width: 100px;
    text-align: right;
  }

  .capitalize {
    text-transform: capitalize;
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

  .badge.partial {
    background: #fef5e7;
    color: #f39c12;
  }

  .badge.overdue {
    background: #fadbd8;
    color: #e74c3c;
  }

  .badge.void {
    background: #ecf0f1;
    color: #95a5a6;
    text-decoration: line-through;
  }

  /* Modal Styles */
  .modal-overlay {
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
    padding: 24px;
  }

  .modal-content {
    background: white;
    border-radius: 8px;
    max-width: 800px;
    width: 100%;
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 24px;
    border-bottom: 1px solid #ecf0f1;
  }

  .modal-header h3 {
    margin: 0;
    color: #2c3e50;
  }

  .close-button {
    background: none;
    border: none;
    font-size: 24px;
    color: #7f8c8d;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
  }

  .close-button:hover {
    background: #ecf0f1;
  }

  .result-summary {
    display: flex;
    gap: 24px;
    padding: 24px;
    background: #d5f4e6;
    border-bottom: 1px solid #ecf0f1;
  }

  .result-summary.has-failures {
    background: #fef5e7;
  }

  .summary-stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .stat-label {
    font-size: 14px;
    color: #7f8c8d;
    font-weight: 500;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 700;
  }

  .summary-stat.success .stat-value {
    color: #27ae60;
  }

  .summary-stat.failure .stat-value {
    color: #e74c3c;
  }

  .summary-stat.total .stat-value {
    color: #2c3e50;
  }

  .result-details {
    padding: 24px;
  }

  .result-details h4 {
    margin-top: 0;
    margin-bottom: 16px;
    color: #2c3e50;
  }

  .result-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .result-item {
    display: flex;
    gap: 12px;
    padding: 12px;
    border-radius: 6px;
    border-left: 4px solid #ddd;
  }

  .result-item.success {
    background: #d5f4e6;
    border-left-color: #27ae60;
  }

  .result-item.failure {
    background: #fadbd8;
    border-left-color: #e74c3c;
  }

  .result-icon {
    font-size: 20px;
    font-weight: bold;
  }

  .result-item.success .result-icon {
    color: #27ae60;
  }

  .result-item.failure .result-icon {
    color: #e74c3c;
  }

  .result-info {
    flex: 1;
  }

  .result-info strong {
    display: block;
    margin-bottom: 4px;
  }

  .result-error {
    color: #e74c3c;
    font-size: 14px;
    margin: 4px 0;
  }

  .result-warning {
    color: #f39c12;
    font-size: 14px;
    margin: 4px 0;
  }

  .modal-actions {
    padding: 24px;
    border-top: 1px solid #ecf0f1;
    display: flex;
    justify-content: flex-end;
  }
</style>
