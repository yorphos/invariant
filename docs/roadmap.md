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

## Phase 2: Core Workflows 🚧 (NEXT UP)

**Goal**: Implement the most common small business accounting tasks.

### 2.1 Chart of Accounts Setup
**Priority**: High | **Effort**: 1-2 days

- [ ] Default account templates (service business, retail, freelance)
- [ ] Account creation form
- [ ] Account list/tree view
- [ ] Account editing (pro mode)
- [ ] Account activation/deactivation

**Acceptance Criteria:**
- User can initialize accounts on first run
- Can add custom accounts
- Hierarchical account structure visible

---

### 2.2 Invoice Management
**Priority**: High | **Effort**: 3-5 days

- [ ] Invoice creation wizard (beginner mode)
- [ ] Invoice form (pro mode shortcut)
- [ ] Line item entry with tax calculation
- [ ] Customer selection/creation inline
- [ ] Invoice list with filters (unpaid, overdue, paid)
- [ ] Invoice detail view
- [ ] Generate posting when invoice saved
- [ ] Update invoice status based on payments

**Acceptance Criteria:**
- User can create invoice end-to-end
- Tax calculated automatically
- A/R account updated correctly
- Journal entry generated and posted

---

### 2.3 Payment Recording
**Priority**: High | **Effort**: 3-4 days

- [ ] Payment entry form
- [ ] Smart allocation suggestions (use A/R matching engine)
- [ ] Manual allocation override
- [ ] Multi-invoice allocation
- [ ] Payment list and search
- [ ] Generate posting when payment recorded
- [ ] Update invoice paid amounts

**Acceptance Criteria:**
- Payment automatically matches invoices
- User can override suggestions
- Partial payments supported
- Bank account balance updated

---

### 2.4 Expense Tracking
**Priority**: High | **Effort**: 2-3 days

- [ ] Expense entry form
- [ ] Vendor selection/creation
- [ ] Category/account selection with suggestions
- [ ] Receipt attachment (future: for now just notes)
- [ ] Expense list with filters
- [ ] Generate posting when expense saved

**Acceptance Criteria:**
- User can record expense quickly
- Account suggestions work
- Expense account debited, cash/bank credited

---

### 2.5 Basic Reports
**Priority**: High | **Effort**: 3-4 days

- [ ] Profit & Loss (Income Statement)
  - Revenue section
  - Expense section
  - Net income calculation
  - Date range filter
- [ ] Balance Sheet
  - Assets section
  - Liabilities section
  - Equity section
  - As-of date
- [ ] Trial Balance
  - All accounts with debit/credit balances
  - Verify balance = 0
- [ ] Report export (CSV, PDF future)

**Acceptance Criteria:**
- Reports calculate correctly
- Match hand-calculated test data
- Date ranges work properly
- Numbers reconcile to journal entries

---

## Phase 3: Enhanced Features 📋 (PLANNED)

### 3.1 Bank Reconciliation
**Priority**: Medium | **Effort**: 4-5 days

- [ ] Mark transactions as cleared
- [ ] Reconciliation wizard
- [ ] Statement date and balance entry
- [ ] Auto-match bank statement lines to transactions
- [ ] Outstanding items list
- [ ] Reconciliation report

---

### 3.2 Vendor Bills (A/P)
**Priority**: Medium | **Effort**: 3-4 days

- [ ] Bill entry form
- [ ] Bill payment tracking
- [ ] Bill aging report
- [ ] Payment scheduling
- [ ] A/P journal entries

---

### 3.3 Inventory Tracking
**Priority**: Medium | **Effort**: 5-7 days

- [ ] Item/SKU management
- [ ] Purchase orders
- [ ] Receive inventory
- [ ] Inventory on hand report
- [ ] COGS calculation
- [ ] Inventory movements list
- [ ] Valuation report

---

### 3.4 Payroll Processing
**Priority**: Medium | **Effort**: 5-7 days

- [ ] Employee management
- [ ] Pay run creation
- [ ] Gross pay calculation
- [ ] Deduction calculation (CPP, EI, tax)
- [ ] Net pay computation
- [ ] Payroll journal entries
- [ ] T4 slip preparation (Canada)
- [ ] Remittance tracking

---

### 3.5 Multi-Currency Support
**Priority**: Low | **Effort**: 4-6 days

- [ ] Currency table
- [ ] Exchange rate management
- [ ] Foreign currency accounts
- [ ] Realized/unrealized gain/loss
- [ ] Multi-currency invoices
- [ ] Multi-currency payments

---

## Phase 4: Advanced Features 🔮 (FUTURE)

### 4.1 Bank Import
**Priority**: Medium | **Effort**: 3-4 days

- [ ] QBO file import
- [ ] CSV import with mapping
- [ ] Auto-categorization rules
- [ ] Import history tracking

---

### 4.2 Receipt/Document Management
**Priority**: Low | **Effort**: 3-4 days

- [ ] File upload and storage
- [ ] Content-hash naming (prevent duplicates)
- [ ] Attach receipts to transactions
- [ ] Image viewer in-app
- [ ] PDF support

---

### 4.3 Cloud Sync (Optional)
**Priority**: Low | **Effort**: 7-10 days

- [ ] Sync server design (separate project)
- [ ] Delta sync protocol
- [ ] Conflict resolution
- [ ] Multi-device support
- [ ] Offline-first preservation

---

### 4.4 Budgeting
**Priority**: Low | **Effort**: 4-5 days

- [ ] Budget creation per account
- [ ] Monthly/quarterly budgets
- [ ] Budget vs actual reports
- [ ] Variance analysis

---

### 4.5 Multi-Company
**Priority**: Low | **Effort**: 3-4 days

- [ ] Company/entity table
- [ ] Switch between companies
- [ ] Separate databases per company
- [ ] Company settings

---

### 4.6 User Management & Permissions
**Priority**: Low | **Effort**: 5-7 days

- [ ] User accounts
- [ ] Role-based permissions
- [ ] Audit trail with user attribution
- [ ] Password management

---

## Phase 5: Polish & Production 🚀 (BEFORE RELEASE)

### 5.1 Testing
**Priority**: Critical | **Effort**: 7-10 days

- [ ] Unit tests for posting engine
- [ ] Unit tests for A/R matching
- [ ] Integration tests for database
- [ ] E2E tests for core flows
- [ ] Test coverage > 80%

---

### 5.2 Error Handling & Validation
**Priority**: High | **Effort**: 3-4 days

- [ ] Comprehensive input validation
- [ ] User-friendly error messages
- [ ] Graceful degradation
- [ ] Error reporting/logging

---

### 5.3 Performance Optimization
**Priority**: Medium | **Effort**: 3-4 days

- [ ] Database indexing review
- [ ] Query optimization
- [ ] Virtualized lists for large datasets
- [ ] Lazy loading
- [ ] Caching strategies

---

### 5.4 Documentation
**Priority**: High | **Effort**: 3-5 days

- [ ] User guide
- [ ] Video tutorials
- [ ] API documentation
- [ ] Accounting concepts explainer
- [ ] FAQ

---

### 5.5 Distribution & Updates
**Priority**: High | **Effort**: 4-5 days

- [ ] Code signing certificates
- [ ] Build pipeline (GitHub Actions)
- [ ] Auto-update configuration
- [ ] Update server/feed
- [ ] Release process

---

### 5.6 Accessibility
**Priority**: Medium | **Effort**: 2-3 days

- [ ] Keyboard navigation
- [ ] Screen reader support
- [ ] High contrast mode
- [ ] Accessible error messages
- [ ] WCAG 2.1 AA compliance

---

## Milestones

### Milestone 1: MVP (Current Status: 70%)
- [x] Foundation
- [ ] Core Workflows (Phase 2)
- [ ] Basic testing
- **Target**: Q2 2026

### Milestone 2: Beta Release
- [ ] All Phase 2 complete
- [ ] Phase 3.1, 3.2 complete
- [ ] Testing suite
- [ ] Documentation
- **Target**: Q3 2026

### Milestone 3: Production Release v1.0
- [ ] All core features
- [ ] Full testing
- [ ] Polish
- [ ] Documentation
- [ ] Distribution pipeline
- **Target**: Q4 2026

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

- Estimates assume 1 developer working full-time
- Adjust for team size and availability
- Each phase should be releasable incrementally
- User feedback will adjust priorities
- Beginner mode workflows should be prioritized over pro mode features

## Last Updated
January 24, 2026
