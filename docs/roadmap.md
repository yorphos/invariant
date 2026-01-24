# Development Roadmap

This roadmap outlines the path from current MVP foundation to a production-ready accounting application.

## Phase 1: Foundation ✅ (COMPLETED)

### Core Infrastructure
- [x] Tauri v2 + Svelte + TypeScript setup
- [x] SQLite database with migration system
- [x] Security configuration (CSP, permissions)
- [x] Project structure and architecture

### Database Schema
- [x] Core ledger tables (accounts, journal, audit)
- [x] A/R and A/P tables (contacts, invoices, payments)
- [x] Inventory and payroll tables (schema ready)
- [x] Tax tables with Canadian codes
- [x] Database triggers for integrity

### Domain Logic
- [x] Posting engine for double-entry bookkeeping
- [x] A/R matching engine (FIFO, amount, reference)
- [x] Policy engine (beginner vs pro mode)
- [x] Persistence service layer

### UI Shell
- [x] Basic navigation and layout
- [x] Mode switching
- [x] Dashboard placeholder
- [x] Loading and error states

---

## Phase 1.5: Tier 1 UX Improvements ✅ (COMPLETED)

**Goal**: Essential user experience features to make the MVP production-ready.

### 1.5.1 Invoice Voiding & Editing
**Priority**: High | **Status**: ✅ Complete

- [x] `voidInvoice()` function with reversal journal entries
- [x] `editInvoice()` function (void-and-recreate pattern)
- [x] Prevent voiding invoices with payments
- [x] Validation to maintain accounting integrity
- [x] Comprehensive test coverage (9 new tests)

**Acceptance Criteria:** ✅
- User can void unpaid invoices
- Void creates proper reversal entries (CR A/R, DR Revenue, DR Tax)
- User can edit invoices (automatically voids and recreates)
- Complete audit trail preserved
- Double-entry balance maintained

---

### 1.5.2 Invoice & Payment Detail Views
**Priority**: High | **Status**: ✅ Complete

- [x] `InvoiceDetailModal` component with full details
- [x] `PaymentDetailModal` component with allocation breakdown
- [x] Clickable table rows in invoice/payment lists
- [x] Display line items, journal entries, payment history
- [x] Modal size variants (small, medium, large, xlarge)
- [x] Integrated edit and void workflows
- [x] Status badges and professional styling

**Acceptance Criteria:** ✅
- User can click any invoice to see full details
- User can click any payment to see allocations
- Details include journal entries for verification
- Edit and void actions accessible from detail view
- Clean, professional UI presentation

---

### 1.5.3 PDF Invoice Generation
**Priority**: High | **Status**: ✅ Complete

- [x] Install jsPDF library
- [x] Create `pdf-generator.ts` utility
- [x] Professional invoice layout with company header
- [x] Line items table with calculations
- [x] Status badges (VOID, PAID)
- [x] Download PDF button in invoice detail modal
- [x] Handle long invoices with page breaks

**Acceptance Criteria:** ✅
- User can download any invoice as PDF
- PDF includes company info, customer info, line items
- Professional appearance suitable for emailing
- Voided invoices clearly marked
- Works offline (client-side generation)

---

## Phase 2: Core Workflows ✅ (COMPLETED)

**Goal**: Implement the most common small business accounting tasks.

### 2.1 Chart of Accounts Setup
**Priority**: High | **Status**: ✅ Complete

- [x] Default account templates (service business, retail, freelance)
- [x] Account creation form
- [x] Account list/tree view
- [x] Account editing (pro mode)
- [x] Account activation/deactivation

**Acceptance Criteria:** ✅
- User can initialize accounts on first run
- Can add custom accounts
- Hierarchical account structure visible

---

### 2.2 Invoice Management
**Priority**: High | **Status**: ✅ Complete

- [x] Invoice creation wizard (beginner mode)
- [x] Invoice form (pro mode shortcut)
- [x] Line item entry with tax calculation
- [x] Customer selection/creation inline
- [x] Invoice list with filters (unpaid, overdue, paid)
- [x] Invoice detail view
- [x] Generate posting when invoice saved
- [x] Update invoice status based on payments

**Acceptance Criteria:** ✅
- User can create invoice end-to-end
- Tax calculated automatically
- A/R account updated correctly
- Journal entry generated and posted

---

### 2.3 Payment Recording
**Priority**: High | **Status**: ✅ Complete

- [x] Payment entry form
- [x] Smart allocation suggestions (use A/R matching engine)
- [x] Manual allocation override
- [x] Multi-invoice allocation
- [x] Payment list and search
- [x] Generate posting when payment recorded
- [x] Update invoice paid amounts

**Acceptance Criteria:** ✅
- Payment automatically matches invoices
- User can override suggestions
- Partial payments supported
- Bank account balance updated

---

### 2.4 Expense Tracking
**Priority**: High | **Status**: ✅ Complete

- [x] Expense entry form
- [x] Vendor selection/creation
- [x] Category/account selection with suggestions
- [x] Receipt attachment (future: for now just notes)
- [x] Expense list with filters
- [x] Generate posting when expense saved

**Acceptance Criteria:** ✅
- User can record expense quickly
- Account suggestions work
- Expense account debited, cash/bank credited

---

### 2.5 Basic Reports
**Priority**: High | **Status**: ✅ Complete

- [x] Profit & Loss (Income Statement)
  - Revenue section
  - Expense section
  - Net income calculation
  - Date range filter
- [x] Balance Sheet
  - Assets section
  - Liabilities section
  - Equity section
  - As-of date
- [x] Trial Balance
  - All accounts with debit/credit balances
  - Verify balance = 0
- [x] Report export (CSV, PDF future)

**Acceptance Criteria:** ✅
- Reports calculate correctly
- Match hand-calculated test data
- Date ranges work properly
- Numbers reconcile to journal entries

---

## Phase 3: Enhanced Features 📋 (PLANNED)

### 3.1 Comprehensive Test Suite Expansion ⭐⭐⭐⭐⭐
**Priority**: HIGH | **Impact**: VERY HIGH

**Why**: Only 37 tests currently, all focused on business logic. Need broader coverage to ensure data integrity and prevent future regressions.

**What to Build**:

- Expand unit tests (target: 70+ tests):
  - Expense operation tests (8-10 tests)
  - Contact type validation tests (5-7 tests)
  - Policy engine tests (10 tests)
  - AR matching tests (10 tests)
- Add integration tests (mock Tauri SQL):
  - Full invoice → payment → reports flow
  - Database trigger testing
  - Migration testing
- Add validation tests:
  - All server-side validation rules
  - Edge cases (leap years, timezone issues)
  - Security tests (SQL injection attempts)

**User Impact**: Confidence in data integrity. Prevents future regressions.

**Technical Notes**:
- May need to mock @tauri-apps/plugin-sql for integration tests
- Follow patterns in TESTING.md

**Acceptance Criteria:**
- 70+ total tests passing
- Coverage of all major business logic
- Security validation tests included
- Integration test framework established

---

### 3.2 Data Export & Backup ⭐⭐⭐⭐
**Priority**: HIGH | **Impact**: HIGH

**Why**: Users need ability to backup data and export for accountant review.

**What to Build**:

- Export Reports to CSV/Excel:
  - Balance Sheet export
  - P&L export
  - Trial Balance export
  - Transaction list export
- Database Backup:
  - "Backup Database" button (copies SQLite file to user-chosen location)
  - "Restore from Backup" button
  - Auto-backup on startup (keep last 7 days)
- Journal Entry Export:
  - Export all journal entries to CSV (for accountant import)

**User Impact**: Peace of mind for data safety. Enables accountant collaboration.

**Technical Notes**:
- Use Tauri's file save/open dialogs
- SQLite backup is just file copy
- CSV export is straightforward with standard format

**Acceptance Criteria:**
- User can export all major reports to CSV
- Database backup/restore works reliably
- Auto-backup on startup implemented
- Journal entries exportable for accountant review

---

### 3.3 Advanced Payment Allocation UI ⭐⭐⭐⭐
**Priority**: MEDIUM | **Impact**: HIGH

**Why**: Current UI is basic - user manually selects invoices. The AR matching engine exists but isn't fully utilized in the UI.

**What to Build**:

- Smart Suggestions:
  - Show FIFO-recommended allocations (oldest first)
  - Show amount-match suggestions (payment exactly matches invoice)
  - Show reference-match suggestions (payment ref matches invoice number)
  - Confidence scores displayed
- Allocation Helpers:
  - "Apply FIFO" button (auto-allocate oldest first)
  - "Apply to Selected" button
  - Drag-to-reorder allocation priorities
  - Visual indication of over/under allocation
  - Running totals (allocated vs. remaining)
- Partial Payment UX:
  - Clear UI for partially paying multiple invoices
  - Warning if payment doesn't fully cover any invoice

**User Impact**: Saves time, reduces errors, makes payment entry faster.

**Technical Notes**:
- AR matching engine already exists (ar-matching.ts)
- Just needs better UI integration

**Acceptance Criteria:**
- FIFO suggestions shown automatically
- One-click allocation buttons work
- Visual feedback for allocation status
- Partial payment handling clear and intuitive

---

### 3.4 Date Range Filtering for Reports ⭐⭐⭐⭐
**Priority**: MEDIUM | **Impact**: HIGH

**Why**: Currently reports show all-time data. Users need monthly, quarterly, yearly views.

**What to Build**:

- Date Range Picker:
  - Start date and end date inputs
  - Quick buttons: "This Month", "Last Month", "This Quarter", "This Year", "Last Year", "All Time"
- Report Updates:
  - P&L: filter transactions by date range
  - Balance Sheet: as-of date (already exists, enhance UX)
  - Trial Balance: as-of date
  - Dashboard metrics: date range filter
- Comparison Reports:
  - "Compare to Previous Period" toggle
  - Shows current vs. prior (e.g., this month vs. last month)

**User Impact**: Essential for monthly/quarterly financial review. Required for tax filing.

**Technical Notes**:
- SQL queries need WHERE entry_date BETWEEN ? AND ?
- Watch for off-by-one errors (inclusive vs. exclusive dates)

**Acceptance Criteria:**
- Date range picker on all major reports
- Quick date selection buttons work
- Period comparison functionality implemented
- Reports calculate correctly for selected ranges

---

### 3.5 Batch Operations ⭐⭐⭐
**Priority**: MEDIUM | **Impact**: MEDIUM

**Why**: Users with many transactions need bulk actions (e.g., monthly invoice generation, bulk payment import).

**What to Build**:

- Batch Invoice Creation:
  - Select multiple contacts
  - Apply same line items to all (e.g., monthly retainer)
  - Generate all at once
- Batch Payment Entry:
  - Import payments from CSV (bank statement)
  - Auto-match to invoices by reference
  - Review & confirm before posting
- Bulk Status Changes:
  - Mark multiple invoices as "sent"
  - Void multiple transactions

**User Impact**: Saves hours for subscription/retainer businesses or high-volume users.

**Technical Notes**:
- Needs transaction wrapping (all-or-nothing)
- CSV parsing for import
- Error handling for partial failures

**Acceptance Criteria:**
- Batch invoice creation works for multiple customers
- CSV payment import with matching
- Bulk status updates function correctly
- Transaction atomicity maintained

---

### 3.6 Bank Reconciliation ⭐⭐⭐⭐
**Priority**: MEDIUM | **Impact**: HIGH

**Why**: Essential for verifying books match bank statements. Required for accurate accounting.

**What to Build**:

- Reconciliation Workflow:
  - Select bank account
  - Enter statement date and ending balance
  - List of unreconciled transactions (payments, expenses)
  - Checkboxes to mark as "cleared"
  - Running balance calculation
  - Reconcile button (locks matched transactions)
- Reconciliation Report:
  - Cleared vs. outstanding transactions
  - Difference (should be $0.00)
- Mark as Cleared:
  - Add cleared flag to journal_entry table
  - Migration to add field

**User Impact**: Critical for catching bank errors, fraud detection, and month-end close.

**Technical Notes**:
- Schema change needed (add cleared and reconciliation_id to journal_entry)
- Migration 006_bank_reconciliation.ts

**Acceptance Criteria:**
- User can reconcile bank accounts
- Cleared transactions marked correctly
- Reconciliation difference calculated
- Schema migration successful

---

### 3.7 Vendor Bills & Accounts Payable ⭐⭐⭐⭐
**Priority**: MEDIUM | **Impact**: MEDIUM-HIGH

**Why**: Currently only track expenses (paid immediately). No support for bills to pay later.

**What to Build**:

- Bill Creation:
  - Similar to invoice, but for purchases
  - Multi-line bills with expense accounts
  - Due date tracking
  - Status: draft → received → partial → paid
  - Journal entry: DR Expense, CR Accounts Payable
- Bill Payment:
  - Select bills to pay
  - Create payment
  - Journal entry: DR A/P, CR Cash
- A/P Reports:
  - Bills due report
  - Vendor aging report
  - A/P balance

**User Impact**: Enables accrual accounting (vs. cash-only). Important for businesses with credit terms from suppliers.

**Technical Notes**:
- Schema mostly exists (bill table is stubbed in migration 002)
- Mirror invoice/payment architecture
- Need bill_line table similar to invoice_line

**Acceptance Criteria:**
- User can create and manage bills
- Bill payment workflow complete
- A/P reports functional
- Accrual accounting properly implemented

---

### 3.8 Inventory Tracking
**Priority**: Medium

- [ ] Item/SKU management
- [ ] Purchase orders
- [ ] Receive inventory
- [ ] Inventory on hand report
- [ ] COGS calculation
- [ ] Inventory movements list
- [ ] Valuation report

---

### 3.9 Payroll Processing
**Priority**: Medium

- [ ] Employee management
- [ ] Pay run creation
- [ ] Gross pay calculation
- [ ] Deduction calculation (CPP, EI, tax)
- [ ] Net pay computation
- [ ] Payroll journal entries
- [ ] T4 slip preparation (Canada)
- [ ] Remittance tracking

---

### 3.10 Multi-Currency Support
**Priority**: Low

- [ ] Currency table
- [ ] Exchange rate management
- [ ] Foreign currency accounts
- [ ] Realized/unrealized gain/loss
- [ ] Multi-currency invoices
- [ ] Multi-currency payments

---

## Phase 4: Advanced Features 🔮 (FUTURE)

### 4.1 Bank Import
**Priority**: Medium

- [ ] QBO file import
- [ ] CSV import with mapping
- [ ] Auto-categorization rules
- [ ] Import history tracking

---

### 4.2 Receipt/Document Management
**Priority**: Low

- [ ] File upload and storage
- [ ] Content-hash naming (prevent duplicates)
- [ ] Attach receipts to transactions
- [ ] Image viewer in-app
- [ ] PDF support

---

### 4.3 Cloud Sync (Optional)
**Priority**: Low

- [ ] Sync server design (separate project)
- [ ] Delta sync protocol
- [ ] Conflict resolution
- [ ] Multi-device support
- [ ] Offline-first preservation

---

### 4.4 Budgeting
**Priority**: Low

- [ ] Budget creation per account
- [ ] Monthly/quarterly budgets
- [ ] Budget vs actual reports
- [ ] Variance analysis

---

### 4.5 Multi-Company
**Priority**: Low

- [ ] Company/entity table
- [ ] Switch between companies
- [ ] Separate databases per company
- [ ] Company settings

---

### 4.6 User Management & Permissions
**Priority**: Low

- [ ] User accounts
- [ ] Role-based permissions
- [ ] Audit trail with user attribution
- [ ] Password management

---

## Phase 5: Polish & Production 🚀 (BEFORE RELEASE)

### 5.1 Testing
**Priority**: Critical

- [ ] Unit tests for posting engine
- [ ] Unit tests for A/R matching
- [ ] Integration tests for database
- [ ] E2E tests for core flows
- [ ] Test coverage > 80%

---

### 5.2 Error Handling & Validation
**Priority**: High

- [ ] Comprehensive input validation
- [ ] User-friendly error messages
- [ ] Graceful degradation
- [ ] Error reporting/logging

---

### 5.3 Performance Optimization
**Priority**: Medium

- [ ] Database indexing review
- [ ] Query optimization
- [ ] Virtualized lists for large datasets
- [ ] Lazy loading
- [ ] Caching strategies

---

### 5.4 Documentation
**Priority**: High

- [ ] User guide
- [ ] Video tutorials
- [ ] API documentation
- [ ] Accounting concepts explainer
- [ ] FAQ

---

### 5.5 Distribution & Updates
**Priority**: High

- [ ] Code signing certificates
- [ ] Build pipeline (GitHub Actions)
- [ ] Auto-update configuration
- [ ] Update server/feed
- [ ] Release process

---

### 5.6 Accessibility
**Priority**: Medium

- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] High contrast mode
- [ ] Accessible error messages
- [ ] WCAG 2.1 AA compliance

---

## Milestones

### Milestone 1: MVP Foundation ✅ (COMPLETED)
- [x] Foundation infrastructure
- [x] Database schema and migrations
- [x] Core domain logic
- [x] Basic UI shell
- [x] Essential workflows (invoices, payments, expenses)
- [x] **Tier 1 UX improvements (void/edit, details, PDF)**

### Milestone 2: Enhanced MVP (In Progress)
- [ ] Test suite expansion (70+ tests)
- [ ] Data export and backup
- [ ] Date range filtering
- [ ] Enhanced features from Phase 3

### Milestone 3: Beta Release
- [ ] All Phase 2 complete
- [ ] Core Phase 3 features complete
- [ ] Testing suite
- [ ] Documentation

### Milestone 4: Production Release v1.0
- [ ] All core features
- [ ] Full testing
- [ ] Polish
- [ ] Documentation
- [ ] Distribution pipeline

---

## Prioritization Framework

**Must-Have (P0):**
- Core workflows (invoices, payments, expenses)
- Reports (P&L, Balance Sheet)
- Testing infrastructure
- Error handling

**Should-Have (P1):**
- Bank reconciliation
- Vendor bills
- Receipt attachments
- Auto-updates

**Nice-to-Have (P2):**
- Inventory tracking
- Payroll
- Multi-currency
- Budgeting

**Future (P3):**
- Cloud sync
- Multi-company
- Advanced permissions

---

## Contribution Areas

If you're looking to contribute, high-impact areas:

1. **UI Forms** (Phase 2) - Most impactful for users
2. **Reports** (Phase 2.5) - High value, clear requirements
3. **Testing** (Phase 5.1) - Critical for quality
4. **Bank Reconciliation** (Phase 3.1) - Frequently requested
5. **Documentation** (Phase 5.4) - Always needed

---

## Notes

- Priorities and estimates are subject to change based on user feedback
- Each phase should be releasable incrementally
- User feedback will adjust priorities
- Beginner mode workflows should be prioritized over pro mode features
- Focus on data integrity and accounting principles above all else
