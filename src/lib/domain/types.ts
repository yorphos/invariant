// Core domain types

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type JournalStatus = 'draft' | 'posted' | 'void';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'overdue' | 'void';
export type CreditNoteStatus = 'draft' | 'issued' | 'applied' | 'partial' | 'void';
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
  is_tax_inclusive?: boolean;
  tax_code_id?: number;
  account_id?: number;
}

export interface CreditNote {
  id?: number;
  credit_note_number: string;
  contact_id: number;
  event_id?: number;
  issue_date: string;
  status: CreditNoteStatus;
  subtotal: number;
  tax_amount: number;
  total_amount: number;
  applied_amount: number;
  tax_code_id?: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CreditNoteLine {
  id?: number;
  credit_note_id?: number;
  line_number: number;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  is_tax_inclusive?: boolean;
  tax_code_id?: number;
  account_id?: number;
}

export interface CreditNoteApplication {
  id?: number;
  credit_note_id: number;
  invoice_id: number;
  amount: number;
  application_date: string;
  notes?: string;
  created_at?: string;
}

export interface CreditNoteRefund {
  id?: number;
  credit_note_id: number;
  refund_number: string;
  refund_date: string;
  amount: number;
  payment_method?: PaymentMethod;
  reference?: string;
  notes?: string;
  event_id?: number;
  created_at?: string;
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

export type PayrollStatus = 'draft' | 'approved' | 'paid' | 'void';

export interface PayrollRun {
  id?: number;
  run_number: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  status: PayrollStatus;
  total_gross: number;
  total_deductions: number;
  total_net: number;
  event_id?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PayrollLine {
  id?: number;
  payroll_run_id?: number;
  employee_name: string;
  employee_id?: string;
  gross_pay: number;
  cpp_amount: number;
  ei_amount: number;
  income_tax: number;
  other_deductions: number;
  net_pay: number;
}

export interface PayrollCalculation {
  gross_pay: number;
  cpp_employee: number;
  cpp_employer: number;
  ei_employee: number;
  ei_employer: number;
  income_tax: number;
  other_deductions: number;
  net_pay: number;
  total_employer_cost: number;
}

// Multi-Currency Types
export interface Currency {
  id?: number;
  code: string; // ISO 4217: USD, CAD, EUR, GBP, etc.
  name: string; // US Dollar, Canadian Dollar, Euro, etc.
  symbol: string; // $, €, £, etc.
  decimal_places: number;
  is_active: boolean;
  created_at?: string;
}

export interface ExchangeRate {
  id?: number;
  from_currency_id: number;
  to_currency_id: number;
  rate_date: string;
  rate: number; // Exchange rate (from → to)
  source?: string; // Source of rate (manual, API, bank, etc.)
  created_at?: string;
}

export interface FXGainLoss {
  id?: number;
  transaction_date: string;
  account_id: number;
  currency_id: number;
  foreign_amount: number;
  home_amount: number;
  exchange_rate: number;
  settled_rate: number;
  gain_loss_amount: number; // Positive = gain, Negative = loss
  gain_loss_type: 'realized' | 'unrealized';
  journal_entry_id?: number;
  reference?: string;
  notes?: string;
  created_at?: string;
}

export interface MultiCurrencyTransaction {
  home_currency_id: number;
  foreign_currency_id: number;
  foreign_amount: number;
  exchange_rate: number;
  home_amount: number; // foreign_amount × exchange_rate
}

// Bank Import Types
export type BankFileFormat = 'csv' | 'qbo' | 'ofx';
export type BankImportStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type BankTransactionType = 'debit' | 'credit' | 'check' | 'deposit' | 'fee' | 'interest' | 'withdrawal' | 'transfer' | 'other';
export type MatchStatus = 'unmatched' | 'auto_matched' | 'manual_matched' | 'imported' | 'ignored';

export interface BankStatementImport {
  id?: number;
  account_id: number;
  import_date?: string;
  file_name: string;
  file_format: BankFileFormat;
  statement_start_date?: string;
  statement_end_date?: string;
  opening_balance?: number;
  closing_balance?: number;
  total_transactions: number;
  imported_transactions: number;
  matched_transactions: number;
  status: BankImportStatus;
  error_message?: string;
  imported_by?: string;
  created_at?: string;
}

export interface BankStatementTransaction {
  id?: number;
  import_id: number;
  transaction_date: string;
  post_date?: string;
  description: string;
  reference_number?: string;
  check_number?: string;
  payee?: string;
  amount: number;
  balance?: number;
  transaction_type?: BankTransactionType;
  category?: string;
  memo?: string;
  match_status: MatchStatus;
  matched_journal_entry_id?: number;
  matched_confidence?: number;
  suggested_account_id?: number;
  suggested_contact_id?: number;
  suggestion_confidence?: number;
  imported_as_journal_entry_id?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CategorizationRule {
  id?: number;
  rule_name: string;
  priority: number;
  is_active: boolean;
  description_pattern?: string;
  payee_pattern?: string;
  amount_min?: number;
  amount_max?: number;
  transaction_type?: BankTransactionType;
  assign_account_id?: number;
  assign_contact_id?: number;
  assign_category?: string;
  notes_template?: string;
  times_applied: number;
  last_applied_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface RuleApplicationLog {
  id?: number;
  rule_id: number;
  bank_transaction_id: number;
  applied_at?: string;
}

// Document Storage Types
export type DocumentType = 'receipt' | 'invoice' | 'bill' | 'contract' | 'statement' | 'other';
export type EntityType = 'invoice' | 'payment' | 'expense' | 'bill' | 'vendor_payment' | 'journal_entry' | 'contact' | 'other';
export type AttachmentType = 'primary' | 'supporting' | 'related';

export interface Document {
  id?: number;
  file_name: string;
  original_file_name: string;
  file_size: number;
  mime_type: string;
  content_hash: string;
  file_path: string;
  document_type?: DocumentType;
  description?: string;
  tags?: string;
  uploaded_by?: string;
  uploaded_at?: string;
  created_at?: string;
}

export interface DocumentAttachment {
  id?: number;
  document_id: number;
  entity_type: EntityType;
  entity_id: number;
  attachment_type: AttachmentType;
  notes?: string;
  attached_by?: string;
  attached_at?: string;
}

export interface DocumentWithAttachment extends Document {
  attachment_id?: number;
  entity_type?: EntityType;
  entity_id?: number;
  attachment_type?: AttachmentType;
  attachment_notes?: string;
}
