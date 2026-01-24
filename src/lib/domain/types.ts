// Core domain types

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type JournalStatus = 'draft' | 'posted' | 'void';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'void';
export type PaymentStatus = 'pending' | 'allocated' | 'partial' | 'reconciled';
export type BillStatus = 'draft' | 'pending' | 'paid' | 'partial' | 'overdue' | 'void';
export type VendorPaymentStatus = 'pending' | 'allocated' | 'partial' | 'cleared';
export type AllocationMethod = 'exact' | 'fifo' | 'manual' | 'heuristic';
export type ReconciliationStatus = 'in_progress' | 'completed' | 'cancelled';
export type PaymentMethod = 'cash' | 'check' | 'transfer' | 'card' | 'other';
export type PolicyMode = 'beginner' | 'pro';

export interface Account {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  parent_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransactionEvent {
  id?: number;
  event_type: string;
  description: string;
  reference?: string;
  created_at?: string;
  created_by?: string;
  metadata?: string;
}

export interface JournalEntry {
  id?: number;
  event_id?: number;
  entry_date: string;
  description: string;
  reference?: string;
  status: JournalStatus;
  posted_at?: string;
  posted_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface JournalLine {
  id?: number;
  journal_entry_id?: number;
  account_id: number;
  debit_amount: number;
  credit_amount: number;
  description?: string;
  created_at?: string;
}

export interface Contact {
  id?: number;
  type: 'customer' | 'vendor' | 'both';
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  tax_id?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Invoice {
  id?: number;
  invoice_number: string;
  contact_id: number;
  event_id?: number;
  issue_date: string;
  due_date: string;
  status: InvoiceStatus;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  tax_code_id?: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface InvoiceLine {
  id?: number;
  invoice_id?: number;
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  tax_code_id?: number;
  account_id?: number;
}

export interface Payment {
  id?: number;
  payment_number: string;
  contact_id?: number;
  event_id?: number;
  payment_date: string;
  amount: number;
  payment_method?: PaymentMethod;
  reference?: string;
  notes?: string;
  allocated_amount: number;
  status: PaymentStatus;
  created_at?: string;
  updated_at?: string;
}

export interface Allocation {
  id?: number;
  payment_id: number;
  invoice_id: number;
  amount: number;
  allocation_method: AllocationMethod;
  confidence_score?: number;
  explanation?: string;
  created_at?: string;
}

export interface Bill {
  id?: number;
  bill_number: string;
  vendor_id: number;
  event_id?: number;
  bill_date: string;
  due_date: string;
  status: BillStatus;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  paid_amount: number;
  tax_code_id?: number;
  reference?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BillLine {
  id?: number;
  bill_id?: number;
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  account_id: number;
  item_id?: number;
}

export interface VendorPayment {
  id?: number;
  payment_number: string;
  vendor_id: number;
  event_id?: number;
  payment_date: string;
  amount: number;
  payment_method?: PaymentMethod;
  check_number?: string;
  reference?: string;
  notes?: string;
  allocated_amount: number;
  status: VendorPaymentStatus;
  created_at?: string;
  updated_at?: string;
}

export interface BillAllocation {
  id?: number;
  vendor_payment_id: number;
  bill_id: number;
  amount: number;
  allocation_date: string;
  notes?: string;
  created_at?: string;
}

export interface TaxCode {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_compound: boolean;
  is_active: boolean;
}

export interface TaxRate {
  id: number;
  tax_code_id: number;
  jurisdiction_id: number;
  rate: number;
  effective_from: string;
  effective_to?: string;
  account_id?: number;
}

export interface PolicyContext {
  mode: PolicyMode;
  user?: string;
}

export interface ValidationWarning {
  level: 'warning' | 'error';
  message: string;
  field?: string;
  requiresOverride: boolean;
}

export interface PostingResult {
  ok: boolean;
  journal_entry_id?: number;
  event_id?: number;
  warnings: ValidationWarning[];
  postings?: JournalLine[];
}

export interface BankReconciliation {
  id?: number;
  account_id: number;
  statement_date: string;
  statement_balance: number;
  book_balance: number;
  status: ReconciliationStatus;
  completed_at?: string;
  completed_by?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface BankReconciliationItem {
  id?: number;
  reconciliation_id: number;
  journal_line_id: number;
  is_cleared: boolean;
  notes?: string;
  created_at?: string;
}

export interface UnreconciledTransaction {
  journal_line_id: number;
  journal_entry_id: number;
  entry_date: string;
  description: string;
  reference?: string;
  debit_amount: number;
  credit_amount: number;
  running_balance: number;
}

export type ItemType = 'product' | 'service' | 'bundle';
export type MovementType = 'purchase' | 'sale' | 'adjustment' | 'transfer';

export interface Item {
  id?: number;
  sku: string;
  name: string;
  description?: string;
  type: ItemType;
  unit_of_measure?: string;
  default_price?: number;
  cost?: number;
  tax_code_id?: number;
  inventory_account_id?: number;
  revenue_account_id?: number;
  cogs_account_id?: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryMovement {
  id?: number;
  item_id: number;
  movement_type: MovementType;
  quantity: number;
  unit_cost?: number;
  reference_type?: string;
  reference_id?: number;
  event_id?: number;
  movement_date: string;
  notes?: string;
  created_at?: string;
}

export interface InventoryLayer {
  movement_id: number;
  purchase_date: string;
  quantity_remaining: number;
  unit_cost: number;
}

export interface COGSCalculation {
  cogs_amount: number;
  quantity_sold: number;
  layers_consumed: InventoryLayer[];
  remaining_layers: InventoryLayer[];
}

export interface InventoryBalance {
  item_id: number;
  quantity_on_hand: number;
  total_cost: number;
  average_cost: number;
  fifo_layers: InventoryLayer[];
}
