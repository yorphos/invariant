/**
 * Inventory Operations
 * 
 * Business logic for inventory management:
 * - Item creation and management
 * - Purchase recording (increase inventory)
 * - Sale recording (decrease inventory, calculate COGS using FIFO)
 * - Adjustments (cycle counts, write-offs)
 * - Inventory valuation (FIFO layers)
 * 
 * Accounting Principles:
 * - Purchase: DR Inventory, CR Cash/AP
 * - Sale: DR COGS, CR Inventory (at FIFO cost)
 * - Adjustment: DR/CR Inventory, CR/DR Adjustment account
 * - FIFO costing: First-In, First-Out
 */

import { persistenceService } from '../services/persistence';
import { getDatabase } from '../services/database';
import type { 
  Item, 
  InventoryMovement, 
  InventoryLayer, 
  COGSCalculation,
  InventoryBalance,
  PolicyContext 
} from '../domain/types';

export interface ItemInput {
  sku: string;
  name: string;
  description?: string;
  type: 'product' | 'service' | 'bundle';
  unit_of_measure?: string;
  default_price?: number;
  cost?: number;
  tax_code_id?: number;
  inventory_account_id?: number;
  revenue_account_id?: number;
  cogs_account_id?: number;
}

export interface PurchaseInput {
  item_id: number;
  quantity: number;
  unit_cost: number;
  purchase_date: string;
  reference?: string;
  notes?: string;
  cash_account_id: number; // Where to credit cash/AP
}

export interface SaleInput {
  item_id: number;
  quantity: number;
  sale_date: string;
  reference?: string;
  notes?: string;
}

export interface AdjustmentInput {
  item_id: number;
  quantity: number; // Can be negative
  adjustment_date: string;
  unit_cost?: number; // Optional, for write-ups
  reference?: string;
  notes?: string;
  adjustment_account_id: number; // Offset account
}

export interface PostingResult {
  ok: boolean;
  warnings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }>;
  movement_id?: number;
  journal_entry_id?: number;
  cogs_amount?: number;
}

/**
 * Create a new inventory item
 */
export async function createItem(itemData: ItemInput): Promise<{ item_id: number }> {
  // Validation
  if (!itemData.sku || itemData.sku.trim() === '') {
    throw new Error('SKU is required');
  }
  if (!itemData.name || itemData.name.trim() === '') {
    throw new Error('Item name is required');
  }
  if (!itemData.type || !['product', 'service', 'bundle'].includes(itemData.type)) {
    throw new Error('Item type must be product, service, or bundle');
  }
  
  // Check for duplicate SKU
  const db = await getDatabase();
  const existing = await db.select<Item[]>(
    'SELECT id FROM item WHERE sku = ? LIMIT 1',
    [itemData.sku]
  );
  
  if (existing.length > 0) {
    throw new Error(`Item with SKU "${itemData.sku}" already exists`);
  }
  
  // Insert item
  const result = await db.execute(
    `INSERT INTO item (
      sku, name, description, type, unit_of_measure,
      default_price, cost, tax_code_id,
      inventory_account_id, revenue_account_id, cogs_account_id,
      is_active, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
    [
      itemData.sku,
      itemData.name,
      itemData.description || null,
      itemData.type,
      itemData.unit_of_measure || null,
      itemData.default_price || null,
      itemData.cost || null,
      itemData.tax_code_id || null,
      itemData.inventory_account_id || null,
      itemData.revenue_account_id || null,
      itemData.cogs_account_id || null
    ]
  );
  
  return { item_id: result.lastInsertId! };
}

/**
 * Record inventory purchase
 * Posts: DR Inventory, CR Cash/AP
 */
export async function recordPurchase(
  purchaseData: PurchaseInput,
  context: PolicyContext = { mode: 'beginner' }
): Promise<PostingResult> {
  const warnings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }> = [];
  
  // Validation
  if (purchaseData.quantity <= 0) {
    throw new Error('Purchase quantity must be greater than 0');
  }
  if (purchaseData.unit_cost < 0) {
    throw new Error('Unit cost cannot be negative');
  }
  if (!purchaseData.purchase_date) {
    throw new Error('Purchase date is required');
  }
  
  const db = await getDatabase();
  
  // Get item details
  const items = await db.select<Item[]>(
    'SELECT * FROM item WHERE id = ? LIMIT 1',
    [purchaseData.item_id]
  );
  
  if (items.length === 0) {
    throw new Error(`Item with ID ${purchaseData.item_id} not found`);
  }
  
  const item = items[0];
  
  if (!item.inventory_account_id) {
    throw new Error(`Item "${item.name}" does not have an inventory account configured`);
  }
  
  const totalCost = purchaseData.quantity * purchaseData.unit_cost;
  
  // Create transaction event
  const eventResult = await db.execute(
    `INSERT INTO transaction_event (event_type, description, reference, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [
      'inventory_purchase',
      `Purchase ${purchaseData.quantity} × ${item.name}`,
      purchaseData.reference || null
    ]
  );
  
  const eventId = eventResult.lastInsertId;
  
  // Create journal entry
  const jeResult = await db.execute(
    `INSERT INTO journal_entry (event_id, entry_date, description, reference, status, posted_at, posted_by)
     VALUES (?, ?, ?, ?, 'posted', datetime('now'), 'system')`,
    [
      eventId,
      purchaseData.purchase_date,
      `Purchase ${purchaseData.quantity} × ${item.name} @ $${purchaseData.unit_cost.toFixed(2)}`,
      purchaseData.reference || null
    ]
  );
  
  const journalEntryId = jeResult.lastInsertId;
  
  // Post journal lines: DR Inventory, CR Cash/AP
  await db.execute(
    `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
     VALUES (?, ?, ?, 0.00, ?)`,
    [
      journalEntryId,
      item.inventory_account_id,
      totalCost,
      `Inventory - ${item.name}`
    ]
  );
  
  await db.execute(
    `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
     VALUES (?, ?, 0.00, ?, ?)`,
    [
      journalEntryId,
      purchaseData.cash_account_id,
      totalCost,
      `Payment for inventory`
    ]
  );
  
  // Create inventory movement record
  const movementResult = await db.execute(
    `INSERT INTO inventory_movement (
      item_id, movement_type, quantity, unit_cost,
      reference_type, reference_id, event_id, movement_date, notes
    ) VALUES (?, 'purchase', ?, ?, ?, ?, ?, ?, ?)`,
    [
      purchaseData.item_id,
      purchaseData.quantity,
      purchaseData.unit_cost,
      'journal_entry',
      journalEntryId,
      eventId,
      purchaseData.purchase_date,
      purchaseData.notes || null
    ]
  );
  
  return {
    ok: true,
    warnings,
    movement_id: movementResult.lastInsertId,
    journal_entry_id: journalEntryId
  };
}

/**
 * Record inventory sale
 * Posts: DR COGS, CR Inventory (at FIFO cost)
 */
export async function recordSale(
  saleData: SaleInput,
  context: PolicyContext = { mode: 'beginner' }
): Promise<PostingResult> {
  const warnings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }> = [];
  
  // Validation
  if (saleData.quantity <= 0) {
    throw new Error('Sale quantity must be greater than 0');
  }
  if (!saleData.sale_date) {
    throw new Error('Sale date is required');
  }
  
  const db = await getDatabase();
  
  // Get item details
  const items = await db.select<Item[]>(
    'SELECT * FROM item WHERE id = ? LIMIT 1',
    [saleData.item_id]
  );
  
  if (items.length === 0) {
    throw new Error(`Item with ID ${saleData.item_id} not found`);
  }
  
  const item = items[0];
  
  if (!item.inventory_account_id) {
    throw new Error(`Item "${item.name}" does not have an inventory account configured`);
  }
  if (!item.cogs_account_id) {
    throw new Error(`Item "${item.name}" does not have a COGS account configured`);
  }
  
  // Calculate COGS using FIFO
  const cogsCalc = await calculateCOGSFIFO(saleData.item_id, saleData.quantity, saleData.sale_date);
  
  if (cogsCalc.quantity_sold < saleData.quantity) {
    warnings.push({
      severity: 'warning',
      message: `Insufficient inventory: requested ${saleData.quantity}, available ${cogsCalc.quantity_sold}. Proceeding with available quantity.`
    });
  }
  
  // Create transaction event
  const eventResult = await db.execute(
    `INSERT INTO transaction_event (event_type, description, reference, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [
      'inventory_sale',
      `Sale ${saleData.quantity} × ${item.name}`,
      saleData.reference || null
    ]
  );
  
  const eventId = eventResult.lastInsertId;
  
  // Create journal entry
  const jeResult = await db.execute(
    `INSERT INTO journal_entry (event_id, entry_date, description, reference, status, posted_at, posted_by)
     VALUES (?, ?, ?, ?, 'posted', datetime('now'), 'system')`,
    [
      eventId,
      saleData.sale_date,
      `COGS for sale of ${saleData.quantity} × ${item.name}`,
      saleData.reference || null
    ]
  );
  
  const journalEntryId = jeResult.lastInsertId;
  
  // Post journal lines: DR COGS, CR Inventory
  await db.execute(
    `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
     VALUES (?, ?, ?, 0.00, ?)`,
    [
      journalEntryId,
      item.cogs_account_id,
      cogsCalc.cogs_amount,
      `COGS - ${item.name}`
    ]
  );
  
  await db.execute(
    `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
     VALUES (?, ?, 0.00, ?, ?)`,
    [
      journalEntryId,
      item.inventory_account_id,
      cogsCalc.cogs_amount,
      `Inventory reduction - ${item.name}`
    ]
  );
  
  // Create inventory movement record (negative quantity)
  const movementResult = await db.execute(
    `INSERT INTO inventory_movement (
      item_id, movement_type, quantity, unit_cost,
      reference_type, reference_id, event_id, movement_date, notes
    ) VALUES (?, 'sale', ?, ?, ?, ?, ?, ?, ?)`,
    [
      saleData.item_id,
      -saleData.quantity, // Negative for sales
      null, // unit_cost not relevant for sales (COGS calculated)
      'journal_entry',
      journalEntryId,
      eventId,
      saleData.sale_date,
      saleData.notes || `COGS: $${cogsCalc.cogs_amount.toFixed(2)}`
    ]
  );
  
  return {
    ok: true,
    warnings,
    movement_id: movementResult.lastInsertId,
    journal_entry_id: journalEntryId,
    cogs_amount: cogsCalc.cogs_amount
  };
}

/**
 * Record inventory adjustment (cycle count, write-off, etc.)
 * Posts: DR/CR Inventory, CR/DR Adjustment account
 */
export async function recordAdjustment(
  adjustmentData: AdjustmentInput,
  context: PolicyContext = { mode: 'beginner' }
): Promise<PostingResult> {
  const warnings: Array<{ severity: 'info' | 'warning' | 'error'; message: string }> = [];
  
  // Validation
  if (adjustmentData.quantity === 0) {
    throw new Error('Adjustment quantity cannot be zero');
  }
  if (!adjustmentData.adjustment_date) {
    throw new Error('Adjustment date is required');
  }
  
  const db = await getDatabase();
  
  // Get item details
  const items = await db.select<Item[]>(
    'SELECT * FROM item WHERE id = ? LIMIT 1',
    [adjustmentData.item_id]
  );
  
  if (items.length === 0) {
    throw new Error(`Item with ID ${adjustmentData.item_id} not found`);
  }
  
  const item = items[0];
  
  if (!item.inventory_account_id) {
    throw new Error(`Item "${item.name}" does not have an inventory account configured`);
  }
  
  // For negative adjustments (write-downs), use FIFO to calculate cost
  // For positive adjustments (write-ups), require unit_cost
  let adjustmentAmount: number;
  
  if (adjustmentData.quantity > 0) {
    // Positive adjustment (write-up)
    if (!adjustmentData.unit_cost || adjustmentData.unit_cost < 0) {
      throw new Error('Unit cost is required for positive adjustments');
    }
    adjustmentAmount = adjustmentData.quantity * adjustmentData.unit_cost;
  } else {
    // Negative adjustment (write-down)
    const cogsCalc = await calculateCOGSFIFO(
      adjustmentData.item_id, 
      Math.abs(adjustmentData.quantity), 
      adjustmentData.adjustment_date
    );
    adjustmentAmount = cogsCalc.cogs_amount;
  }
  
  // Create transaction event
  const eventResult = await db.execute(
    `INSERT INTO transaction_event (event_type, description, reference, created_at)
     VALUES (?, ?, ?, datetime('now'))`,
    [
      'inventory_adjustment',
      `Adjustment ${adjustmentData.quantity} × ${item.name}`,
      adjustmentData.reference || null
    ]
  );
  
  const eventId = eventResult.lastInsertId;
  
  // Create journal entry
  const jeResult = await db.execute(
    `INSERT INTO journal_entry (event_id, entry_date, description, reference, status, posted_at, posted_by)
     VALUES (?, ?, ?, ?, 'posted', datetime('now'), 'system')`,
    [
      eventId,
      adjustmentData.adjustment_date,
      `Inventory adjustment ${adjustmentData.quantity} × ${item.name}`,
      adjustmentData.reference || null
    ]
  );
  
  const journalEntryId = jeResult.lastInsertId;
  
  // Post journal lines based on adjustment direction
  if (adjustmentData.quantity > 0) {
    // Positive adjustment: DR Inventory, CR Adjustment account
    await db.execute(
      `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
       VALUES (?, ?, ?, 0.00, ?)`,
      [
        journalEntryId,
        item.inventory_account_id,
        adjustmentAmount,
        `Inventory adjustment - ${item.name}`
      ]
    );
    
    await db.execute(
      `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
       VALUES (?, ?, 0.00, ?, ?)`,
      [
        journalEntryId,
        adjustmentData.adjustment_account_id,
        adjustmentAmount,
        `Inventory write-up`
      ]
    );
  } else {
    // Negative adjustment: DR Adjustment account, CR Inventory
    await db.execute(
      `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
       VALUES (?, ?, ?, 0.00, ?)`,
      [
        journalEntryId,
        adjustmentData.adjustment_account_id,
        adjustmentAmount,
        `Inventory write-down`
      ]
    );
    
    await db.execute(
      `INSERT INTO journal_line (journal_entry_id, account_id, debit_amount, credit_amount, description)
       VALUES (?, ?, 0.00, ?, ?)`,
      [
        journalEntryId,
        item.inventory_account_id,
        adjustmentAmount,
        `Inventory adjustment - ${item.name}`
      ]
    );
  }
  
  // Create inventory movement record
  const movementResult = await db.execute(
    `INSERT INTO inventory_movement (
      item_id, movement_type, quantity, unit_cost,
      reference_type, reference_id, event_id, movement_date, notes
    ) VALUES (?, 'adjustment', ?, ?, ?, ?, ?, ?, ?)`,
    [
      adjustmentData.item_id,
      adjustmentData.quantity,
      adjustmentData.unit_cost || null,
      'journal_entry',
      journalEntryId,
      eventId,
      adjustmentData.adjustment_date,
      adjustmentData.notes || null
    ]
  );
  
  return {
    ok: true,
    warnings,
    movement_id: movementResult.lastInsertId,
    journal_entry_id: journalEntryId
  };
}

/**
 * Calculate COGS using FIFO method
 * Returns the cost of goods sold for the specified quantity
 */
export async function calculateCOGSFIFO(
  itemId: number,
  quantityToSell: number,
  asOfDate: string
): Promise<COGSCalculation> {
  const db = await getDatabase();
  
  // Get all purchase movements up to the sale date, ordered by date (FIFO)
  const purchases = await db.select<Array<{
    id: number;
    movement_date: string;
    quantity: number;
    unit_cost: number;
  }>>(
    `SELECT id, movement_date, quantity, unit_cost
     FROM inventory_movement
     WHERE item_id = ?
       AND movement_type IN ('purchase', 'adjustment')
       AND quantity > 0
       AND movement_date <= ?
     ORDER BY movement_date ASC, id ASC`,
    [itemId, asOfDate]
  );
  
  // Get all sales and negative adjustments to calculate consumed quantities
  const consumptions = await db.select<Array<{
    movement_id: number;
    quantity_consumed: number;
  }>>(
    `SELECT id as movement_id, ABS(quantity) as quantity_consumed
     FROM inventory_movement
     WHERE item_id = ?
       AND movement_type IN ('sale', 'adjustment')
       AND quantity < 0
       AND movement_date <= ?
     ORDER BY movement_date ASC, id ASC`,
    [itemId, asOfDate]
  );
  
  // Build FIFO layers (remaining quantities from purchases)
  const layers: InventoryLayer[] = [];
  
  for (const purchase of purchases) {
    let remainingQty = purchase.quantity;
    
    // Subtract quantities consumed by prior sales
    for (const consumption of consumptions) {
      if (remainingQty <= 0) break;
      
      // Simple FIFO: consume from oldest layer first
      const toConsume = Math.min(remainingQty, consumption.quantity_consumed);
      remainingQty -= toConsume;
      consumption.quantity_consumed -= toConsume;
    }
    
    if (remainingQty > 0) {
      layers.push({
        movement_id: purchase.id,
        purchase_date: purchase.movement_date,
        quantity_remaining: remainingQty,
        unit_cost: purchase.unit_cost || 0
      });
    }
  }
  
  // Now calculate COGS by consuming from the FIFO layers
  let quantityRemaining = quantityToSell;
  let cogsAmount = 0;
  const layersConsumed: InventoryLayer[] = [];
  const remainingLayers: InventoryLayer[] = [];
  
  for (const layer of layers) {
    if (quantityRemaining <= 0) {
      // No more to consume, keep layer as-is
      remainingLayers.push(layer);
      continue;
    }
    
    const toConsume = Math.min(quantityRemaining, layer.quantity_remaining);
    cogsAmount += toConsume * layer.unit_cost;
    quantityRemaining -= toConsume;
    
    layersConsumed.push({
      ...layer,
      quantity_remaining: toConsume
    });
    
    // If layer has quantity left, add to remaining
    if (toConsume < layer.quantity_remaining) {
      remainingLayers.push({
        ...layer,
        quantity_remaining: layer.quantity_remaining - toConsume
      });
    }
  }
  
  return {
    cogs_amount: cogsAmount,
    quantity_sold: quantityToSell - quantityRemaining,
    layers_consumed: layersConsumed,
    remaining_layers: remainingLayers
  };
}

/**
 * Get current inventory balance for an item
 */
export async function getInventoryBalance(
  itemId: number,
  asOfDate: string
): Promise<InventoryBalance> {
  const db = await getDatabase();
  
  // Sum all movements
  const result = await db.select<Array<{
    total_quantity: number;
  }>>(
    `SELECT COALESCE(SUM(quantity), 0) as total_quantity
     FROM inventory_movement
     WHERE item_id = ?
       AND movement_date <= ?`,
    [itemId, asOfDate]
  );
  
  const quantityOnHand = result[0]?.total_quantity || 0;
  
  // Calculate FIFO layers and total cost
  const cogsCalc = await calculateCOGSFIFO(itemId, 0, asOfDate);
  const fifoLayers = cogsCalc.remaining_layers;
  
  const totalCost = fifoLayers.reduce(
    (sum, layer) => sum + (layer.quantity_remaining * layer.unit_cost),
    0
  );
  
  const averageCost = quantityOnHand > 0 ? totalCost / quantityOnHand : 0;
  
  return {
    item_id: itemId,
    quantity_on_hand: quantityOnHand,
    total_cost: totalCost,
    average_cost: averageCost,
    fifo_layers: fifoLayers
  };
}

/**
 * Get inventory valuation for all items
 */
export async function getInventoryValuation(asOfDate: string): Promise<Array<{
  item: Item;
  balance: InventoryBalance;
}>> {
  const db = await getDatabase();
  
  // Get all active items
  const items = await db.select<Item[]>(
    `SELECT * FROM item WHERE is_active = 1 ORDER BY sku`
  );
  
  const valuations: Array<{ item: Item; balance: InventoryBalance }> = [];
  
  for (const item of items) {
    const balance = await getInventoryBalance(item.id!, asOfDate);
    
    // Only include items with inventory
    if (balance.quantity_on_hand !== 0) {
      valuations.push({ item, balance });
    }
  }
  
  return valuations;
}
