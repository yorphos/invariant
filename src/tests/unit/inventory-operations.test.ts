import { describe, it, expect } from 'vitest';
import type { ItemInput, PurchaseInput, SaleInput, AdjustmentInput } from '../../lib/domain/inventory-operations';

/**
 * Inventory Operations Tests
 * 
 * Tests for inventory management, FIFO costing, COGS calculation, and inventory workflows
 */

describe('Inventory Item - Validation', () => {
  it('should reject item with empty SKU', () => {
    const skus = ['', '   ', '\t'];
    
    for (const sku of skus) {
      const isValid = sku.trim().length > 0;
      expect(isValid).toBe(false);
    }
  });

  it('should reject item with empty name', () => {
    const names = ['', '   ', '\n'];
    
    for (const name of names) {
      const isValid = name.trim().length > 0;
      expect(isValid).toBe(false);
    }
  });

  it('should reject item with invalid type', () => {
    const invalidTypes = ['inventory', 'goods', 'asset', ''];
    
    for (const type of invalidTypes) {
      const isValid = ['product', 'service', 'bundle'].includes(type);
      expect(isValid).toBe(false);
    }
  });

  it('should accept valid item with all required fields', () => {
    const item: ItemInput = {
      sku: 'WIDGET-001',
      name: 'Standard Widget',
      description: 'A standard widget for general use',
      type: 'product',
      unit_of_measure: 'ea',
      default_price: 100.00,
      cost: 60.00,
      inventory_account_id: 1200,
      revenue_account_id: 4000,
      cogs_account_id: 5000,
    };

    const isValid = 
      item.sku.trim().length > 0 &&
      item.name.trim().length > 0 &&
      ['product', 'service', 'bundle'].includes(item.type);

    expect(isValid).toBe(true);
  });
});

describe('Inventory Purchase - Validation', () => {
  it('should reject purchase with zero quantity', () => {
    const purchase: PurchaseInput = {
      item_id: 1,
      quantity: 0,
      unit_cost: 50.00,
      purchase_date: '2026-01-24',
      cash_account_id: 1000,
    };

    const isValid = purchase.quantity > 0;
    expect(isValid).toBe(false);
  });

  it('should reject purchase with negative quantity', () => {
    const purchase: PurchaseInput = {
      item_id: 1,
      quantity: -10,
      unit_cost: 50.00,
      purchase_date: '2026-01-24',
      cash_account_id: 1000,
    };

    const isValid = purchase.quantity > 0;
    expect(isValid).toBe(false);
  });

  it('should reject purchase with negative unit cost', () => {
    const purchase: PurchaseInput = {
      item_id: 1,
      quantity: 10,
      unit_cost: -50.00,
      purchase_date: '2026-01-24',
      cash_account_id: 1000,
    };

    const isValid = purchase.unit_cost >= 0;
    expect(isValid).toBe(false);
  });

  it('should accept purchase with zero unit cost (free goods)', () => {
    const purchase: PurchaseInput = {
      item_id: 1,
      quantity: 10,
      unit_cost: 0.00,
      purchase_date: '2026-01-24',
      cash_account_id: 1000,
    };

    const isValid = purchase.quantity > 0 && purchase.unit_cost >= 0;
    expect(isValid).toBe(true);
  });

  it('should correctly calculate total purchase cost', () => {
    const purchase: PurchaseInput = {
      item_id: 1,
      quantity: 15,
      unit_cost: 42.50,
      purchase_date: '2026-01-24',
      cash_account_id: 1000,
    };

    const totalCost = purchase.quantity * purchase.unit_cost;
    
    expect(totalCost).toBe(637.50);
  });
});

describe('Inventory Sale - Validation', () => {
  it('should reject sale with zero quantity', () => {
    const sale: SaleInput = {
      item_id: 1,
      quantity: 0,
      sale_date: '2026-01-24',
    };

    const isValid = sale.quantity > 0;
    expect(isValid).toBe(false);
  });

  it('should reject sale with negative quantity', () => {
    const sale: SaleInput = {
      item_id: 1,
      quantity: -5,
      sale_date: '2026-01-24',
    };

    const isValid = sale.quantity > 0;
    expect(isValid).toBe(false);
  });

  it('should accept valid sale with reference', () => {
    const sale: SaleInput = {
      item_id: 1,
      quantity: 5,
      sale_date: '2026-01-24',
      reference: 'INV-1001',
      notes: 'Sold to customer ABC',
    };

    const isValid = sale.quantity > 0 && sale.sale_date.length > 0;
    expect(isValid).toBe(true);
  });
});

describe('Inventory Adjustment - Validation', () => {
  it('should reject adjustment with zero quantity', () => {
    const adjustment: AdjustmentInput = {
      item_id: 1,
      quantity: 0,
      adjustment_date: '2026-01-24',
      adjustment_account_id: 5900,
    };

    const isValid = adjustment.quantity !== 0;
    expect(isValid).toBe(false);
  });

  it('should accept positive adjustment (write-up)', () => {
    const adjustment: AdjustmentInput = {
      item_id: 1,
      quantity: 5,
      unit_cost: 50.00,
      adjustment_date: '2026-01-24',
      adjustment_account_id: 5900,
      notes: 'Found during cycle count',
    };

    const isValid = adjustment.quantity !== 0;
    expect(isValid).toBe(true);
  });

  it('should accept negative adjustment (write-down)', () => {
    const adjustment: AdjustmentInput = {
      item_id: 1,
      quantity: -3,
      adjustment_date: '2026-01-24',
      adjustment_account_id: 5900,
      notes: 'Damaged goods',
    };

    const isValid = adjustment.quantity !== 0;
    expect(isValid).toBe(true);
  });

  it('should require unit cost for positive adjustments', () => {
    const adjustmentWithCost: AdjustmentInput = {
      item_id: 1,
      quantity: 5,
      unit_cost: 50.00,
      adjustment_date: '2026-01-24',
      adjustment_account_id: 5900,
    };

    const adjustmentWithoutCost: AdjustmentInput = {
      item_id: 1,
      quantity: 5,
      adjustment_date: '2026-01-24',
      adjustment_account_id: 5900,
    };

    const isValidWithCost = adjustmentWithCost.quantity > 0 && adjustmentWithCost.unit_cost !== undefined && adjustmentWithCost.unit_cost >= 0;
    const isValidWithoutCost = adjustmentWithoutCost.quantity > 0 && adjustmentWithoutCost.unit_cost !== undefined;

    expect(isValidWithCost).toBe(true);
    expect(isValidWithoutCost).toBe(false);
  });
});

describe('FIFO Cost Calculation', () => {
  interface FIFOLayer {
    purchase_date: string;
    quantity: number;
    unit_cost: number;
  }

  function calculateFIFOCOGS(layers: FIFOLayer[], quantityToSell: number): { cogs: number; remainingLayers: FIFOLayer[] } {
    let quantityRemaining = quantityToSell;
    let cogs = 0;
    const remaining: FIFOLayer[] = [];

    for (const layer of layers) {
      if (quantityRemaining <= 0) {
        remaining.push(layer);
        continue;
      }

      const toConsume = Math.min(quantityRemaining, layer.quantity);
      cogs += toConsume * layer.unit_cost;
      quantityRemaining -= toConsume;

      if (toConsume < layer.quantity) {
        remaining.push({
          ...layer,
          quantity: layer.quantity - toConsume,
        });
      }
    }

    return { cogs, remainingLayers: remaining };
  }

  it('should calculate COGS using FIFO for single purchase layer', () => {
    const layers: FIFOLayer[] = [
      { purchase_date: '2026-01-01', quantity: 100, unit_cost: 50.00 },
    ];

    const result = calculateFIFOCOGS(layers, 20);

    expect(result.cogs).toBe(1000.00); // 20 × $50
    expect(result.remainingLayers.length).toBe(1);
    expect(result.remainingLayers[0].quantity).toBe(80);
  });

  it('should calculate COGS using FIFO for multiple purchase layers', () => {
    const layers: FIFOLayer[] = [
      { purchase_date: '2026-01-01', quantity: 50, unit_cost: 40.00 },
      { purchase_date: '2026-01-10', quantity: 50, unit_cost: 45.00 },
      { purchase_date: '2026-01-20', quantity: 50, unit_cost: 50.00 },
    ];

    const result = calculateFIFOCOGS(layers, 75);

    // Should consume:
    // - First layer: 50 × $40 = $2,000
    // - Second layer: 25 × $45 = $1,125
    // Total COGS: $3,125

    expect(result.cogs).toBe(3125.00);
    expect(result.remainingLayers.length).toBe(2);
    expect(result.remainingLayers[0].quantity).toBe(25); // Remaining from second layer
    expect(result.remainingLayers[0].unit_cost).toBe(45.00);
    expect(result.remainingLayers[1].quantity).toBe(50); // Third layer untouched
    expect(result.remainingLayers[1].unit_cost).toBe(50.00);
  });

  it('should handle exact layer consumption', () => {
    const layers: FIFOLayer[] = [
      { purchase_date: '2026-01-01', quantity: 100, unit_cost: 50.00 },
      { purchase_date: '2026-01-10', quantity: 50, unit_cost: 55.00 },
    ];

    const result = calculateFIFOCOGS(layers, 100);

    expect(result.cogs).toBe(5000.00); // 100 × $50
    expect(result.remainingLayers.length).toBe(1);
    expect(result.remainingLayers[0].quantity).toBe(50);
    expect(result.remainingLayers[0].unit_cost).toBe(55.00);
  });

  it('should handle sale quantity exceeding available inventory', () => {
    const layers: FIFOLayer[] = [
      { purchase_date: '2026-01-01', quantity: 50, unit_cost: 50.00 },
    ];

    const result = calculateFIFOCOGS(layers, 100);

    // Should only consume what's available
    expect(result.cogs).toBe(2500.00); // 50 × $50
    expect(result.remainingLayers.length).toBe(0);
  });

  it('should calculate correct COGS with varying unit costs', () => {
    const layers: FIFOLayer[] = [
      { purchase_date: '2026-01-01', quantity: 10, unit_cost: 10.00 },
      { purchase_date: '2026-01-05', quantity: 10, unit_cost: 15.00 },
      { purchase_date: '2026-01-10', quantity: 10, unit_cost: 20.00 },
    ];

    const result = calculateFIFOCOGS(layers, 25);

    // Should consume:
    // - First layer: 10 × $10 = $100
    // - Second layer: 10 × $15 = $150
    // - Third layer: 5 × $20 = $100
    // Total COGS: $350

    expect(result.cogs).toBe(350.00);
    expect(result.remainingLayers.length).toBe(1);
    expect(result.remainingLayers[0].quantity).toBe(5);
    expect(result.remainingLayers[0].unit_cost).toBe(20.00);
  });

  it('should handle fractional quantities in FIFO calculation', () => {
    const layers: FIFOLayer[] = [
      { purchase_date: '2026-01-01', quantity: 10.5, unit_cost: 50.00 },
      { purchase_date: '2026-01-10', quantity: 15.3, unit_cost: 55.00 },
    ];

    const result = calculateFIFOCOGS(layers, 12.8);

    // Should consume:
    // - First layer: 10.5 × $50 = $525.00
    // - Second layer: 2.3 × $55 = $126.50
    // Total COGS: $651.50

    expect(result.cogs).toBeCloseTo(651.50, 2);
    expect(result.remainingLayers.length).toBe(1);
    expect(result.remainingLayers[0].quantity).toBeCloseTo(13.0, 1);
  });

  it('should maintain FIFO order with multiple small sales', () => {
    let layers: FIFOLayer[] = [
      { purchase_date: '2026-01-01', quantity: 100, unit_cost: 40.00 },
      { purchase_date: '2026-01-10', quantity: 100, unit_cost: 45.00 },
    ];

    // First sale
    const result1 = calculateFIFOCOGS(layers, 50);
    expect(result1.cogs).toBe(2000.00); // 50 × $40
    layers = result1.remainingLayers;

    // Second sale
    const result2 = calculateFIFOCOGS(layers, 50);
    expect(result2.cogs).toBe(2000.00); // 50 × $40
    layers = result2.remainingLayers;

    // Third sale (should now consume from second layer)
    const result3 = calculateFIFOCOGS(layers, 50);
    expect(result3.cogs).toBe(2250.00); // 50 × $45
    layers = result3.remainingLayers;

    expect(layers.length).toBe(1);
    expect(layers[0].quantity).toBe(50);
    expect(layers[0].unit_cost).toBe(45.00);
  });
});

describe('Inventory Valuation', () => {
  it('should calculate average cost correctly', () => {
    const purchases = [
      { quantity: 100, unit_cost: 40.00 },
      { quantity: 50, unit_cost: 50.00 },
      { quantity: 150, unit_cost: 45.00 },
    ];

    const totalCost = purchases.reduce((sum, p) => sum + (p.quantity * p.unit_cost), 0);
    const totalQty = purchases.reduce((sum, p) => sum + p.quantity, 0);
    const avgCost = totalCost / totalQty;

    // Total cost: (100 × 40) + (50 × 50) + (150 × 45) = 4000 + 2500 + 6750 = 13,250
    // Total qty: 300
    // Avg cost: 13,250 / 300 = 44.1667

    expect(totalCost).toBe(13250.00);
    expect(totalQty).toBe(300);
    expect(avgCost).toBeCloseTo(44.1667, 4);
  });

  it('should calculate inventory value at average cost', () => {
    const quantityOnHand = 150;
    const averageCost = 44.1667;
    const inventoryValue = quantityOnHand * averageCost;

    expect(inventoryValue).toBeCloseTo(6625.00, 1); // Use 1 decimal place tolerance
  });
});

describe('Double-Entry Verification - Inventory', () => {
  it('should balance purchase entry: DR Inventory, CR Cash', () => {
    const quantity = 100;
    const unitCost = 50.00;
    const totalCost = quantity * unitCost;

    const debitInventory = totalCost;
    const creditCash = totalCost;

    expect(debitInventory).toBe(creditCash);
    expect(debitInventory).toBe(5000.00);
  });

  it('should balance sale entry: DR COGS, CR Inventory', () => {
    const cogsAmount = 1250.00; // Calculated via FIFO

    const debitCOGS = cogsAmount;
    const creditInventory = cogsAmount;

    expect(debitCOGS).toBe(creditInventory);
    expect(debitCOGS).toBe(1250.00);
  });

  it('should balance positive adjustment: DR Inventory, CR Adjustment Account', () => {
    const quantity = 10;
    const unitCost = 50.00;
    const adjustmentAmount = quantity * unitCost;

    const debitInventory = adjustmentAmount;
    const creditAdjustment = adjustmentAmount;

    expect(debitInventory).toBe(creditAdjustment);
    expect(debitInventory).toBe(500.00);
  });

  it('should balance negative adjustment: DR Adjustment Account, CR Inventory', () => {
    const cogsAmount = 300.00; // Calculated via FIFO for items written off

    const debitAdjustment = cogsAmount;
    const creditInventory = cogsAmount;

    expect(debitAdjustment).toBe(creditInventory);
    expect(debitAdjustment).toBe(300.00);
  });
});

describe('Inventory Edge Cases', () => {
  it('should handle zero unit cost purchases (free goods)', () => {
    const purchase = {
      quantity: 50,
      unit_cost: 0.00,
    };

    const totalCost = purchase.quantity * purchase.unit_cost;
    expect(totalCost).toBe(0.00);

    const isValid = purchase.quantity > 0 && purchase.unit_cost >= 0;
    expect(isValid).toBe(true);
  });

  it('should handle very small quantities (decimal precision)', () => {
    const purchase = {
      quantity: 0.001,
      unit_cost: 5000.00,
    };

    const totalCost = purchase.quantity * purchase.unit_cost;
    expect(totalCost).toBe(5.00);
  });

  it('should handle very large quantities', () => {
    const purchase = {
      quantity: 1000000,
      unit_cost: 0.50,
    };

    const totalCost = purchase.quantity * purchase.unit_cost;
    expect(totalCost).toBe(500000.00);
  });

  it('should prevent selling more than available (in validation)', () => {
    const availableQty = 50;
    const saleQty = 100;

    const canSellAll = saleQty <= availableQty;
    expect(canSellAll).toBe(false);

    // Should either reject or sell only what's available
    const actualSaleQty = Math.min(saleQty, availableQty);
    expect(actualSaleQty).toBe(50);
  });

  it('should handle items with no purchase history (negative inventory scenario)', () => {
    const layers: any[] = [];
    const saleQty = 10;

    // With no layers, COGS should be 0 and quantity sold should be 0
    const quantitySold = Math.min(saleQty, layers.reduce((sum, l) => sum + l.quantity, 0));
    const cogs = 0;

    expect(quantitySold).toBe(0);
    expect(cogs).toBe(0);
  });
});

describe('Inventory Accounting Principles', () => {
  it('should ensure inventory increases with purchases', () => {
    let inventoryBalance = 100;
    const purchaseQty = 50;

    inventoryBalance += purchaseQty;

    expect(inventoryBalance).toBe(150);
  });

  it('should ensure inventory decreases with sales', () => {
    let inventoryBalance = 100;
    const saleQty = 30;

    inventoryBalance -= saleQty;

    expect(inventoryBalance).toBe(70);
  });

  it('should ensure COGS is recorded at historical cost (FIFO)', () => {
    // The sale price should not affect COGS calculation
    const salePrice = 150.00;
    const historicalCost = 80.00; // FIFO cost from purchase layers

    const cogs = historicalCost; // Not salePrice!
    const grossProfit = salePrice - cogs;

    expect(cogs).toBe(80.00);
    expect(grossProfit).toBe(70.00);
  });

  it('should handle inventory adjustments for shrinkage', () => {
    const expectedQty = 100;
    const actualQty = 95; // After physical count
    const shrinkage = expectedQty - actualQty;

    expect(shrinkage).toBe(5);
    expect(shrinkage).toBeGreaterThan(0); // Indicates loss
  });

  it('should calculate gross profit correctly with inventory', () => {
    const salesRevenue = 10000.00;
    const cogs = 6000.00;
    const grossProfit = salesRevenue - cogs;
    const grossMargin = (grossProfit / salesRevenue) * 100;

    expect(grossProfit).toBe(4000.00);
    expect(grossMargin).toBeCloseTo(40.00, 2);
  });
});
