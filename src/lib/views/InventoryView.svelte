<script lang="ts">
  import { onMount } from 'svelte';
  import { getDatabase } from '../services/database';
  import { 
    createItem, 
    recordPurchase, 
    recordSale, 
    recordAdjustment,
    getInventoryBalance 
  } from '../domain/inventory-operations';
  import type { Item, Account, PolicyMode, InventoryMovement } from '../domain/types';
  import Button from '../ui/Button.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Card from '../ui/Card.svelte';
  import Table from '../ui/Table.svelte';

  export let mode: PolicyMode;

  let items: Item[] = [];
  let accounts: Account[] = [];
  let loading = true;
  let view: 'list' | 'create-item' | 'record-purchase' | 'record-sale' | 'record-adjustment' = 'list';
  let selectedItem: Item | null = null;
  let showDetailModal = false;
  let movements: InventoryMovement[] = [];
  
  // Item form fields
  let formSku = '';
  let formName = '';
  let formDescription = '';
  let formType: 'product' | 'service' | 'bundle' = 'product';
  let formUnitOfMeasure = 'ea';
  let formDefaultPrice: number | '' = '';
  let formCost: number | '' = '';
  let formInventoryAccountId: number | '' = '';
  let formRevenueAccountId: number | '' = '';
  let formCogsAccountId: number | '' = '';

  // Purchase form fields
  let purchaseItemId: number | '' = '';
  let purchaseQuantity: number | '' = '';
  let purchaseUnitCost: number | '' = '';
  let purchaseDate = '';
  let purchaseReference = '';
  let purchaseNotes = '';
  let purchaseCashAccountId: number | '' = '';

  // Sale form fields
  let saleItemId: number | '' = '';
  let saleQuantity: number | '' = '';
  let saleDate = '';
  let saleReference = '';
  let saleNotes = '';

  // Adjustment form fields
  let adjustmentItemId: number | '' = '';
  let adjustmentQuantity: number | '' = '';
  let adjustmentUnitCost: number | '' = '';
  let adjustmentDate = '';
  let adjustmentReference = '';
  let adjustmentNotes = '';
  let adjustmentAccountId: number | '' = '';

  // Inventory balances cache
  let itemBalances = new Map<number, { quantity: number; value: number }>();

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      const db = await getDatabase();
      
      // Load items
      items = await db.select<Item[]>(
        'SELECT * FROM item WHERE is_active = 1 ORDER BY sku'
      );

      // Load accounts
      accounts = await db.select<Account[]>(
        'SELECT * FROM account WHERE is_active = 1 ORDER BY code'
      );

      // Set default dates
      purchaseDate = new Date().toISOString().split('T')[0];
      saleDate = new Date().toISOString().split('T')[0];
      adjustmentDate = new Date().toISOString().split('T')[0];

      // Load balances for all items
      await loadItemBalances();

    } catch (e) {
      console.error('Failed to load data:', e);
      alert(`Error loading data: ${e instanceof Error ? e.message : String(e)}`);
    }
    loading = false;
  }

  async function loadItemBalances() {
    const today = new Date().toISOString().split('T')[0];
    itemBalances = new Map();
    
    for (const item of items) {
      if (!item.id) continue;
      try {
        const balance = await getInventoryBalance(item.id, today);
        itemBalances.set(item.id, {
          quantity: balance.quantity_on_hand,
          value: balance.total_cost
        });
      } catch (e) {
        console.error(`Failed to load balance for item ${item.id}:`, e);
      }
    }
    
    // Trigger reactivity
    itemBalances = itemBalances;
  }

  async function handleCreateItem() {
    try {
      if (!formSku || !formName) {
        alert('SKU and Name are required');
        return;
      }

      await createItem({
        sku: formSku,
        name: formName,
        description: formDescription || undefined,
        type: formType,
        unit_of_measure: formUnitOfMeasure || undefined,
        default_price: typeof formDefaultPrice === 'number' ? formDefaultPrice : undefined,
        cost: typeof formCost === 'number' ? formCost : undefined,
        inventory_account_id: typeof formInventoryAccountId === 'number' ? formInventoryAccountId : undefined,
        revenue_account_id: typeof formRevenueAccountId === 'number' ? formRevenueAccountId : undefined,
        cogs_account_id: typeof formCogsAccountId === 'number' ? formCogsAccountId : undefined
      });

      alert('Item created successfully');
      
      // Reset form
      formSku = '';
      formName = '';
      formDescription = '';
      formType = 'product';
      formUnitOfMeasure = 'ea';
      formDefaultPrice = '';
      formCost = '';
      formInventoryAccountId = '';
      formRevenueAccountId = '';
      formCogsAccountId = '';

      view = 'list';
      await loadData();

    } catch (e) {
      console.error('Failed to create item:', e);
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleRecordPurchase() {
    try {
      if (typeof purchaseItemId !== 'number' || typeof purchaseQuantity !== 'number' || 
          typeof purchaseUnitCost !== 'number' || typeof purchaseCashAccountId !== 'number') {
        alert('Please fill in all required fields');
        return;
      }

      const result = await recordPurchase({
        item_id: purchaseItemId,
        quantity: purchaseQuantity,
        unit_cost: purchaseUnitCost,
        purchase_date: purchaseDate,
        reference: purchaseReference || undefined,
        notes: purchaseNotes || undefined,
        cash_account_id: purchaseCashAccountId
      }, { mode });

      if (result.ok) {
        alert(`Purchase recorded successfully. Journal Entry #${result.journal_entry_id}`);
        
        // Reset form
        purchaseItemId = '';
        purchaseQuantity = '';
        purchaseUnitCost = '';
        purchaseReference = '';
        purchaseNotes = '';
        purchaseDate = new Date().toISOString().split('T')[0];

        view = 'list';
        await loadData();
      }

    } catch (e) {
      console.error('Failed to record purchase:', e);
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleRecordSale() {
    try {
      if (typeof saleItemId !== 'number' || typeof saleQuantity !== 'number') {
        alert('Please fill in all required fields');
        return;
      }

      const result = await recordSale({
        item_id: saleItemId,
        quantity: saleQuantity,
        sale_date: saleDate,
        reference: saleReference || undefined,
        notes: saleNotes || undefined
      }, { mode });

      if (result.ok) {
        const warningMsg = result.warnings.length > 0 
          ? '\n\nWarnings:\n' + result.warnings.map(w => `- ${w.message}`).join('\n')
          : '';
        alert(`Sale recorded successfully. COGS: $${result.cogs_amount?.toFixed(2)}\nJournal Entry #${result.journal_entry_id}${warningMsg}`);
        
        // Reset form
        saleItemId = '';
        saleQuantity = '';
        saleReference = '';
        saleNotes = '';
        saleDate = new Date().toISOString().split('T')[0];

        view = 'list';
        await loadData();
      }

    } catch (e) {
      console.error('Failed to record sale:', e);
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleRecordAdjustment() {
    try {
      if (typeof adjustmentItemId !== 'number' || typeof adjustmentQuantity !== 'number' ||
          typeof adjustmentAccountId !== 'number') {
        alert('Please fill in all required fields');
        return;
      }

      const result = await recordAdjustment({
        item_id: adjustmentItemId,
        quantity: adjustmentQuantity,
        adjustment_date: adjustmentDate,
        unit_cost: typeof adjustmentUnitCost === 'number' ? adjustmentUnitCost : undefined,
        reference: adjustmentReference || undefined,
        notes: adjustmentNotes || undefined,
        adjustment_account_id: adjustmentAccountId
      }, { mode });

      if (result.ok) {
        alert(`Adjustment recorded successfully. Journal Entry #${result.journal_entry_id}`);
        
        // Reset form
        adjustmentItemId = '';
        adjustmentQuantity = '';
        adjustmentUnitCost = '';
        adjustmentReference = '';
        adjustmentNotes = '';
        adjustmentDate = new Date().toISOString().split('T')[0];

        view = 'list';
        await loadData();
      }

    } catch (e) {
      console.error('Failed to record adjustment:', e);
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function viewItemDetail(item: Item) {
    selectedItem = item;
    showDetailModal = true;

    // Load movements for this item
    try {
      const db = await getDatabase();
      movements = await db.select<InventoryMovement[]>(
        `SELECT * FROM inventory_movement 
         WHERE item_id = ? 
         ORDER BY movement_date DESC, id DESC 
         LIMIT 100`,
        [item.id]
      );
    } catch (e) {
      console.error('Failed to load movements:', e);
    }
  }

  function closeDetailModal() {
    showDetailModal = false;
    selectedItem = null;
    movements = [];
  }

  function getAccountName(accountId: number | null | undefined): string {
    if (!accountId) return 'N/A';
    const account = accounts.find(a => a.id === accountId);
    return account ? `${account.code} - ${account.name}` : `Account #${accountId}`;
  }

  function getItemBalance(itemId: number | undefined): { quantity: number; value: number } {
    if (!itemId) return { quantity: 0, value: 0 };
    return itemBalances.get(itemId) || { quantity: 0, value: 0 };
  }
</script>

<div class="inventory-view">
  {#if loading}
    <p>Loading inventory...</p>
  {:else}
    <!-- Navigation buttons -->
    <div class="toolbar">
      <Button onclick={() => view = 'list'} variant={view === 'list' ? 'primary' : 'secondary'}>
        Inventory List
      </Button>
      <Button onclick={() => view = 'create-item'} variant={view === 'create-item' ? 'primary' : 'secondary'}>
        + New Item
      </Button>
      <Button onclick={() => view = 'record-purchase'} variant={view === 'record-purchase' ? 'primary' : 'secondary'}>
        Record Purchase
      </Button>
      <Button onclick={() => view = 'record-sale'} variant={view === 'record-sale' ? 'primary' : 'secondary'}>
        Record Sale
      </Button>
      <Button onclick={() => view = 'record-adjustment'} variant={view === 'record-adjustment' ? 'primary' : 'secondary'}>
        Record Adjustment
      </Button>
    </div>

    {#if view === 'list'}
      <Card title="Inventory Items">
        <Table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Name</th>
              <th>Type</th>
              <th>Unit</th>
              <th>Qty on Hand</th>
              <th>Avg Cost</th>
              <th>Total Value</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each items as item (item.id)}
              {@const balance = getItemBalance(item.id)}
              <tr onclick={() => viewItemDetail(item)} class="clickable">
                <td>{item.sku}</td>
                <td>{item.name}</td>
                <td>{item.type}</td>
                <td>{item.unit_of_measure || 'ea'}</td>
                <td class="number">{balance.quantity.toFixed(2)}</td>
                <td class="number">${balance.quantity > 0 ? (balance.value / balance.quantity).toFixed(2) : '0.00'}</td>
                <td class="number">${balance.value.toFixed(2)}</td>
                <td>
                  <Button size="sm" onclick={(e) => { e.stopPropagation(); viewItemDetail(item); }}>
                    View
                  </Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </Table>
        
        {#if items.length === 0}
          <p class="empty-state">No inventory items found. Create your first item above.</p>
        {/if}
      </Card>
    {/if}

    {#if view === 'create-item'}
      <Card title="Create New Inventory Item">
        <form onsubmit={(e) => { e.preventDefault(); handleCreateItem(); }}>
          <div class="form-row">
            <Input label="SKU" bind:value={formSku} required />
            <Input label="Name" bind:value={formName} required />
          </div>

          <div class="form-row">
            <Select label="Type" bind:value={formType} required>
              <option value="product">Product</option>
              <option value="service">Service</option>
              <option value="bundle">Bundle</option>
            </Select>
            <Input label="Unit of Measure" bind:value={formUnitOfMeasure} placeholder="ea, kg, box, etc." />
          </div>

          <Input label="Description" bind:value={formDescription} />

          <div class="form-row">
            <Input label="Default Price" type="number" step="0.01" bind:value={formDefaultPrice} />
            <Input label="Cost" type="number" step="0.01" bind:value={formCost} />
          </div>

          <div class="form-row">
            <Select label="Inventory Account" bind:value={formInventoryAccountId}>
              <option value="">-- Select Account --</option>
              {#each accounts.filter(a => a.type === 'asset') as account}
                <option value={account.id}>{account.code} - {account.name}</option>
              {/each}
            </Select>
            <Select label="Revenue Account" bind:value={formRevenueAccountId}>
              <option value="">-- Select Account --</option>
              {#each accounts.filter(a => a.type === 'revenue') as account}
                <option value={account.id}>{account.code} - {account.name}</option>
              {/each}
            </Select>
          </div>

          <div class="form-row">
            <Select label="COGS Account" bind:value={formCogsAccountId}>
              <option value="">-- Select Account --</option>
              {#each accounts.filter(a => a.type === 'expense') as account}
                <option value={account.id}>{account.code} - {account.name}</option>
              {/each}
            </Select>
          </div>

          <div class="button-group">
            <Button type="submit">Create Item</Button>
            <Button type="button" variant="secondary" onclick={() => view = 'list'}>Cancel</Button>
          </div>
        </form>
      </Card>
    {/if}

    {#if view === 'record-purchase'}
      <Card title="Record Inventory Purchase">
        <form onsubmit={(e) => { e.preventDefault(); handleRecordPurchase(); }}>
          <Select label="Item" bind:value={purchaseItemId} required>
            <option value="">-- Select Item --</option>
            {#each items as item}
              <option value={item.id}>{item.sku} - {item.name}</option>
            {/each}
          </Select>

          <div class="form-row">
            <Input label="Quantity" type="number" step="0.01" bind:value={purchaseQuantity} required />
            <Input label="Unit Cost" type="number" step="0.01" bind:value={purchaseUnitCost} required />
          </div>

          <div class="form-row">
            <Input label="Purchase Date" type="date" bind:value={purchaseDate} required />
            <Select label="Cash/AP Account" bind:value={purchaseCashAccountId} required>
              <option value="">-- Select Account --</option>
              {#each accounts.filter(a => a.type === 'asset' || a.type === 'liability') as account}
                <option value={account.id}>{account.code} - {account.name}</option>
              {/each}
            </Select>
          </div>

          <Input label="Reference" bind:value={purchaseReference} placeholder="PO#, Invoice#, etc." />
          <Input label="Notes" bind:value={purchaseNotes} />

          {#if typeof purchaseQuantity === 'number' && typeof purchaseUnitCost === 'number'}
            <div class="total-display">
              <strong>Total Cost:</strong> ${(purchaseQuantity * purchaseUnitCost).toFixed(2)}
            </div>
          {/if}

          <div class="button-group">
            <Button type="submit">Record Purchase</Button>
            <Button type="button" variant="secondary" onclick={() => view = 'list'}>Cancel</Button>
          </div>
        </form>
      </Card>
    {/if}

    {#if view === 'record-sale'}
      <Card title="Record Inventory Sale">
        <form onsubmit={(e) => { e.preventDefault(); handleRecordSale(); }}>
          <Select label="Item" bind:value={saleItemId} required>
            <option value="">-- Select Item --</option>
            {#each items as item}
              {@const balance = getItemBalance(item.id)}
              <option value={item.id}>{item.sku} - {item.name} (On hand: {balance.quantity.toFixed(2)})</option>
            {/each}
          </Select>

          <div class="form-row">
            <Input label="Quantity" type="number" step="0.01" bind:value={saleQuantity} required />
            <Input label="Sale Date" type="date" bind:value={saleDate} required />
          </div>

          <Input label="Reference" bind:value={saleReference} placeholder="Invoice#, SO#, etc." />
          <Input label="Notes" bind:value={saleNotes} />

          <p class="info-text">
            <strong>Note:</strong> COGS will be calculated automatically using FIFO method.
          </p>

          <div class="button-group">
            <Button type="submit">Record Sale</Button>
            <Button type="button" variant="secondary" onclick={() => view = 'list'}>Cancel</Button>
          </div>
        </form>
      </Card>
    {/if}

    {#if view === 'record-adjustment'}
      <Card title="Record Inventory Adjustment">
        <form onsubmit={(e) => { e.preventDefault(); handleRecordAdjustment(); }}>
          <Select label="Item" bind:value={adjustmentItemId} required>
            <option value="">-- Select Item --</option>
            {#each items as item}
              {@const balance = getItemBalance(item.id)}
              <option value={item.id}>{item.sku} - {item.name} (On hand: {balance.quantity.toFixed(2)})</option>
            {/each}
          </Select>

          <div class="form-row">
            <Input 
              label="Adjustment Quantity" 
              type="number" 
              step="0.01" 
              bind:value={adjustmentQuantity} 
              required 
              helperText="Positive to increase, negative to decrease"
            />
            <Input label="Adjustment Date" type="date" bind:value={adjustmentDate} required />
          </div>

          {#if typeof adjustmentQuantity === 'number' && adjustmentQuantity > 0}
            <Input 
              label="Unit Cost" 
              type="number" 
              step="0.01" 
              bind:value={adjustmentUnitCost} 
              required
              helperText="Required for positive adjustments (write-ups)"
            />
          {/if}

          <Select label="Adjustment Account" bind:value={adjustmentAccountId} required>
            <option value="">-- Select Account --</option>
            {#each accounts.filter(a => a.type === 'expense' || a.type === 'revenue') as account}
              <option value={account.id}>{account.code} - {account.name}</option>
            {/each}
          </Select>

          <Input label="Reference" bind:value={adjustmentReference} placeholder="Cycle count, shrinkage, etc." />
          <Input label="Notes" bind:value={adjustmentNotes} />

          <p class="info-text">
            <strong>Note:</strong> For negative adjustments (write-downs), cost will be calculated using FIFO.
          </p>

          <div class="button-group">
            <Button type="submit">Record Adjustment</Button>
            <Button type="button" variant="secondary" onclick={() => view = 'list'}>Cancel</Button>
          </div>
        </form>
      </Card>
    {/if}
  {/if}
</div>

<!-- Item Detail Modal -->
{#if showDetailModal && selectedItem}
  <div class="modal-overlay" onclick={closeDetailModal} onkeydown={(e) => e.key === 'Escape' && closeDetailModal()} role="button" tabindex="-1">
    <div class="modal-content" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <Card title={`Item: ${selectedItem.name}`}>
        <div class="detail-section">
          <p><strong>SKU:</strong> {selectedItem.sku}</p>
          <p><strong>Type:</strong> {selectedItem.type}</p>
          <p><strong>Unit:</strong> {selectedItem.unit_of_measure || 'ea'}</p>
          {#if selectedItem.description}
            <p><strong>Description:</strong> {selectedItem.description}</p>
          {/if}
          {#if selectedItem.default_price}
            <p><strong>Default Price:</strong> ${selectedItem.default_price.toFixed(2)}</p>
          {/if}
          <p><strong>Inventory Account:</strong> {getAccountName(selectedItem.inventory_account_id)}</p>
          <p><strong>Revenue Account:</strong> {getAccountName(selectedItem.revenue_account_id)}</p>
          <p><strong>COGS Account:</strong> {getAccountName(selectedItem.cogs_account_id)}</p>
        </div>

        <h3>Recent Movements</h3>
        <Table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Type</th>
              <th>Quantity</th>
              <th>Unit Cost</th>
              <th>Reference</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {#each movements as movement}
              <tr>
                <td>{movement.movement_date}</td>
                <td class="movement-type-{movement.movement_type}">
                  {movement.movement_type}
                </td>
                <td class="number" class:negative={movement.quantity < 0}>
                  {movement.quantity > 0 ? '+' : ''}{movement.quantity.toFixed(2)}
                </td>
                <td class="number">
                  {movement.unit_cost ? `$${movement.unit_cost.toFixed(2)}` : '-'}
                </td>
                <td>{movement.reference_type || '-'}</td>
                <td>{movement.notes || '-'}</td>
              </tr>
            {/each}
          </tbody>
        </Table>

        {#if movements.length === 0}
          <p class="empty-state">No movements recorded for this item.</p>
        {/if}

        <div class="button-group">
          <Button onclick={closeDetailModal}>Close</Button>
        </div>
      </Card>
    </div>
  </div>
{/if}

<style>
  .inventory-view {
    padding: 1rem;
  }

  .toolbar {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .button-group {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .total-display {
    padding: 1rem;
    background: #f0f0f0;
    border-radius: 4px;
    margin: 1rem 0;
    font-size: 1.1rem;
  }

  .info-text {
    padding: 0.75rem;
    background: #e3f2fd;
    border-left: 4px solid #2196f3;
    margin: 1rem 0;
    font-size: 0.9rem;
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: #666;
  }

  .clickable {
    cursor: pointer;
  }

  .clickable:hover {
    background-color: #f5f5f5;
  }

  .number {
    text-align: right;
  }

  .negative {
    color: #d32f2f;
  }

  .movement-type-purchase {
    color: #4caf50;
    font-weight: 600;
  }

  .movement-type-sale {
    color: #f44336;
    font-weight: 600;
  }

  .movement-type-adjustment {
    color: #ff9800;
    font-weight: 600;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal-content {
    max-width: 800px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .detail-section {
    margin-bottom: 1.5rem;
  }

  .detail-section p {
    margin: 0.5rem 0;
  }

  h3 {
    margin-top: 1.5rem;
    margin-bottom: 1rem;
    font-size: 1.2rem;
  }
</style>
