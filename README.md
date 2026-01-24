# Invariant Accounting

**Professional offline-first accounting software for small businesses and freelancers.**

Invariant Accounting is a desktop application that brings enterprise-grade double-entry bookkeeping to your local machine. Built with modern web technologies wrapped in a native desktop shell, it provides the power of traditional accounting software without the complexity, cost, or cloud dependency.

[![Status](https://img.shields.io/badge/Status-Phase%207%20Complete-brightgreen)]()
[![License](https://img.shields.io/badge/License-TBD-blue)]()
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)]()
[![Tests](https://img.shields.io/badge/Tests-501%20Passing-success)]()
[![Migrations](https://img.shields.io/badge/Migrations-16-blue)]()

---

## 🎯 Core Philosophy

**Local-First**: Your financial data never leaves your computer. No subscriptions, no cloud lock-in, no privacy concerns.

**Double-Entry Enforced**: Database triggers ensure accounting integrity. Unbalanced entries are impossible.

**Progressive Disclosure**: Beginner mode guides you through correct workflows. Pro mode gives you full control when you're ready.

---

## ✨ Features

### Current Release (Phase 7 Complete)

#### 🔧 Dynamic Account Management (Phase 7 - Latest)
- **Editable Account Codes** - Change account codes when editing accounts
  - Code uniqueness validation prevents duplicates
  - Confirmation dialog for system account changes
- **Expanded System Account Roles** - 18 configurable system account mappings
  - Core Accounting, Cash & Banking, Payroll, and more
- **System Account Badges** - Visual indicators for mapped accounts
- **Database Reset** (Pro Mode) - Complete reset to factory state with safety confirmation

#### 🎨 UX Hardening (Phase 6)
- **Manual Journal Entry UI** (Pro Mode only)
  - Create custom journal entries with multiple lines
  - Real-time debit/credit balance validation
  - View recent journal entries with detail modal
- **System Account Mapping UI** (Pro Mode only)
  - Configure A/R, A/P, Sales Tax Payable, Retained Earnings accounts
  - Dropdown filters accounts by expected type
- **Toast Notification System**
  - Non-blocking notifications for success, error, warning, info
  - Auto-dismiss with configurable duration
  - Replaces all alert() dialogs
- **Mode Switch Confirmation**
  - Confirmation modal when switching Beginner/Pro modes
  - Explains feature differences and guardrails
- **Reconciliation Adjustment Flow**
  - Create adjustment entries when reconciliation doesn't balance
  - Proper double-entry with expense account selection
  - Full audit trail with transaction metadata

#### 🏦 Bank Import & Receipt Management (Phase 5)
- **CSV bank statement import** with flexible column mapping
- **Auto-matching** of imported transactions to existing journal entries
  - Amount matching with ±$0.01 tolerance
  - Date matching within ±3 days window
  - Description similarity scoring (Jaccard algorithm)
  - Confidence score calculation
- **Categorization rules** engine for automatic transaction categorization
  - Regex pattern matching on description and payee
  - Amount range filters
  - Transaction type filters
  - Priority-based rule evaluation
  - Audit trail of rule applications
- **Transaction import workflow** to create journal entries from bank transactions
  - One-click import of unmatched transactions
  - Automatic journal entry creation with proper debits/credits
  - Smart detection of money in vs. money out
- **Receipt attachment** for invoices and expenses
  - Drag-and-drop file upload (images, PDFs, documents)
  - SHA-256 content-hash deduplication (same file uploaded twice = one copy)
  - Attach multiple documents to any entity
  - View and delete attachments
  - 10MB file size limit per document
- Bank Import view accessible from main navigation

#### 🔒 Audit Hardening & Compliance (Phase 4)
- **Closed period enforcement** with database triggers
- **Tax-inclusive pricing** support for retail scenarios
- **System account integrity** fixes for A/P and equity accounts
- **Safe backup/restore** operations under active use
- **Foreign key enforcement** across all database access paths
- **Full audit compliance** achieved (see docs/roadmap.md for details)
- Outstanding issues documented and accepted as low-priority risks

#### 📋 Contact Management
- Create and manage customers and vendors
- Store complete contact information (email, phone, address, tax ID)
- Classify contacts by type (customer, vendor, or both)
- Track active/inactive status

#### 🧾 Invoicing
- Create professional multi-line invoices
- Automatic sequential numbering (INV-0001, INV-0002, ...)
- Line-item detail with quantity, unit price, and revenue account coding
- Automatic tax calculation (13% HST/GST - Canadian defaults)
- Real-time status tracking (draft → sent → partial → paid → overdue)
- **Invoice voiding** with automatic reversal journal entries
- **Invoice editing** (void-and-recreate pattern for audit trail)
- **Detailed invoice view** with line items, journal entries, and payment history
- **PDF generation** for professional invoice documents
- **Receipt attachments** with drag-and-drop file upload (Phase 5)
- Automatic journal posting on creation:
  - **DR** Accounts Receivable
  - **CR** Revenue (by line item)
  - **CR** Sales Tax Payable

#### 💰 Payment Processing
- Record payments via multiple methods (cash, check, bank transfer, card)
- Automatic payment numbering (PAY-0001, PAY-0002, ...)
- Smart invoice allocation with visual selection
- Automatic invoice status updates
- **Detailed payment view** with allocation breakdown and journal entries
- Automatic journal posting:
  - **DR** Cash/Bank Account
  - **CR** Accounts Receivable

#### 📊 Expense Tracking
- Quick expense entry with minimal friction
- Link expenses to vendors
- Categorize by expense account
- **Receipt attachments** with drag-and-drop file upload (Phase 5)
- Automatic journal posting:
  - **DR** Expense Account
  - **CR** Cash/Bank Account

#### 📈 Financial Reports
- **Balance Sheet**: Assets = Liabilities + Equity (with verification)
- **Profit & Loss**: Revenue - Expenses = Net Income
- **Trial Balance**: Complete debit/credit listing
- As-of-date filtering for historical reporting
- Real-time data (no month-end close required)
- **10x+ faster report generation** with database-level aggregation (Phase 5.5)

#### 🎛️ Dashboard
- At-a-glance business metrics:
  - Total and open invoice counts
  - Accounts receivable balance
  - Period revenue and expenses
  - Net income (profit/loss)
- Recent transaction history
- Quick action shortcuts

#### 🏦 Default Chart of Accounts
50+ pre-configured accounts covering:
- **Assets** (1000-1999): Cash, A/R, inventory, equipment
- **Liabilities** (2000-2999): A/P, tax payable, loans
- **Equity** (3000-3999): Owner's equity, retained earnings
- **Revenue** (4000-4999): Sales, services, other income
- **Expenses** (5000-9999): COGS, operating expenses, other

#### 🔒 Data Integrity
- Database triggers enforce double-entry rules
- Posted entries are immutable (edit protection)
- Automatic total calculations
- Foreign key constraints
- Complete audit trail

#### 🎓 Beginner & Pro Modes
- **Beginner Mode**:
  - Auto-generated document numbers
  - Guided workflows
  - Recommended account usage
  - Prevents common mistakes
- **Pro Mode**:
  - Manual document numbering
  - Direct journal entry access
  - Override warnings
  - Advanced features unlocked

---

## 🏗️ Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Svelte 5 + TypeScript | Reactive UI with type safety |
| **Build Tool** | Vite | Fast development and optimized builds |
| **Desktop Shell** | Tauri v2 (Rust) | Native OS integration |
| **Database** | SQLite | Local-first data persistence |
| **Styling** | CSS (scoped) | Component-based styling |

### Project Structure

```
invariant/
├── src/                          # Frontend application
│   ├── App.svelte               # Main application shell
│   ├── lib/
│   │   ├── domain/              # Business logic (pure TypeScript)
│   │   │   ├── types.ts         # Entity interfaces
│   │   │   ├── posting-engine.ts    # Double-entry validation
│   │   │   ├── ar-matching.ts   # Payment allocation algorithms
│   │   │   ├── policy.ts        # Mode enforcement rules
│   │   │   ├── invoice-operations.ts   # Invoice workflows
│   │   │   ├── payment-operations.ts   # Payment workflows
│   │   │   ├── expense-operations.ts   # Expense workflows
│   │   │   ├── bill-operations.ts      # Vendor bill workflows
│   │   │   ├── inventory-operations.ts # Inventory management
│   │   │   ├── payroll-operations.ts   # Payroll processing
│   │   │   └── currency-operations.ts  # Multi-currency support
│   │   ├── services/            # Data layer
│   │   │   ├── database.ts      # Migration runner
│   │   │   ├── persistence.ts   # CRUD operations
│   │   │   ├── seed.ts          # Default data
│   │   │   ├── reports.ts       # Report aggregation
│   │   │   ├── backup.ts        # Backup/restore
│   │   │   ├── bank-import.ts   # Bank statement import
│   │   │   ├── bank-reconciliation.ts  # Reconciliation logic
│   │   │   ├── batch-operations.ts     # Bulk operations
│   │   │   ├── document-storage.ts     # Receipt attachments
│   │   │   ├── period-close.ts  # Fiscal period management
│   │   │   ├── system-accounts.ts      # System account mappings
│   │   │   ├── tax.ts           # Tax calculations
│   │   │   └── transactions.ts  # Transaction support
│   │   ├── stores/              # Svelte stores
│   │   │   └── toast.ts         # Toast notifications
│   │   ├── ui/                  # Reusable components (10 components)
│   │   │   ├── Button.svelte, Input.svelte, Select.svelte
│   │   │   ├── Card.svelte, Modal.svelte, Table.svelte
│   │   │   ├── FileUpload.svelte, ToastContainer.svelte
│   │   │   └── InvoiceDetailModal.svelte, PaymentDetailModal.svelte
│   │   ├── utils/               # Utility functions
│   │   │   ├── pdf-generator.ts # PDF generation
│   │   │   └── csv-export.ts    # CSV export
│   │   └── views/               # Application screens (14 views)
│   │       ├── DashboardView.svelte     # Business metrics
│   │       ├── ContactsView.svelte      # Customer/vendor management
│   │       ├── AccountsView.svelte      # Chart of accounts
│   │       ├── InvoicesView.svelte      # Sales invoices
│   │       ├── PaymentsView.svelte      # Payment recording
│   │       ├── ExpensesView.svelte      # Expense tracking
│   │       ├── BillsView.svelte         # Vendor bills
│   │       ├── InventoryView.svelte     # Inventory management
│   │       ├── PayrollView.svelte       # Payroll processing
│   │       ├── ReportsView.svelte       # Financial reports
│   │       ├── ReconciliationView.svelte # Bank reconciliation
│   │       ├── BankImportView.svelte    # Bank statement import
│   │       ├── JournalEntryView.svelte  # Manual journal entries
│   │       └── BatchOperationsView.svelte # Bulk operations
│   └── main.ts                  # Application entry point
├── src-tauri/                   # Rust backend
│   ├── src/lib.rs               # Plugin registration
│   ├── Cargo.toml               # Rust dependencies
│   ├── capabilities/            # Permission system
│   │   └── default.json
│   └── tauri.conf.json          # Application configuration
├── migrations/                  # Database versioning (16 migrations)
│   ├── 001_core_ledger.ts       # Accounts, journal, audit
│   ├── 002_contacts_ar_ap.ts    # Contacts, invoices, payments
│   ├── 003-016                  # Additional feature migrations
│   └── index.ts                 # Migration registry
└── docs/                        # Documentation
    ├── project.md               # Original architecture specification
    ├── roadmap.md               # Development roadmap and phase tracking
    └── troubleshooting.md       # Debugging and problem-solving guide
```

### Design Principles

1. **Local-First**: All data stored locally in SQLite. No network dependency.
2. **Immutability**: Posted journal entries cannot be edited (use reversal transactions).
3. **Database Enforces Invariants**: Triggers prevent invalid data at the database level.
4. **Single Source of Truth**: Domain operations are the only way to create journal entries.
5. **Progressive Disclosure**: Simple workflows for beginners, advanced features for pros.
6. **Type Safety**: End-to-end TypeScript for compile-time error prevention.

---

## 🚀 Getting Started

### Prerequisites

#### Required
- **Node.js** 18+ with npm
- **Rust** 1.77.2 or later (for building native binaries)

#### Platform-Specific Dependencies

**Windows**:
- Microsoft Visual Studio C++ Build Tools
- WebView2 (usually pre-installed on Windows 10/11)

**macOS**:
- Xcode Command Line Tools: `xcode-select --install`

**Linux** (Debian/Ubuntu):
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

See [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/) for other distributions.

### Installation

```bash
# Clone the repository
git clone https://github.com/yorphos/invariant.git
cd invariant

# Install dependencies
npm install

# Run in development mode (frontend only)
npm run dev

# Run full application (Tauri + frontend)
npm run tauri dev

# Build production application
npm run tauri build
```

### First Launch

On first run, Invariant will:

1. **Create Database**: SQLite database in OS-specific app data directory
   - Windows: `%APPDATA%\invariant`
   - macOS: `~/Library/Application Support/invariant`
   - Linux: `~/.local/share/invariant`

2. **Run Migrations**: Apply all 16 schema migrations automatically

3. **Seed Data**: Insert default chart of accounts (50+ accounts)

4. **Initialize Settings**: Set beginner mode as default

5. **Display Dashboard**: Show welcome screen and quick actions

### Quick Start Guide

#### 1. Add Your First Customer
Navigate to **Contacts** → Click **New Contact** → Fill in customer details → Save

#### 2. Create an Invoice
Navigate to **Invoices** → Click **New Invoice** → Select customer → Add line items → Submit

The system automatically:
- Generates invoice number (INV-0001)
- Calculates tax (13% HST)
- Posts to journal (DR A/R, CR Revenue, CR Tax)
- Tracks status

#### 3. Record a Payment
Navigate to **Payments** → Click **Record Payment** → Select customer → Enter amount → Select invoices to apply → Submit

The system automatically:
- Generates payment number (PAY-0001)
- Posts to journal (DR Cash, CR A/R)
- Updates invoice statuses
- Records allocations

#### 4. View Reports
Navigate to **Reports** → Select report type → Choose date → Generate

Available reports:
- Balance Sheet (Assets = Liabilities + Equity)
- Profit & Loss (Revenue - Expenses)
- Trial Balance (All accounts)

### Beginner vs Pro Mode

**Beginner Mode (Default):**
- Guided workflows for common tasks
- Prevents editing posted transactions
- Warns about unusual account usage
- Recommends best practices
- Blocks potentially incorrect operations

**Pro Mode:**
- Full chart of accounts editing
- Direct journal entry creation
- Bypass workflow recommendations
- Override warnings
- Advanced features unlocked

**To switch modes:**
1. Click "Settings" in the sidebar
2. Click "Switch to Pro Mode" (or "Switch to Beginner Mode")

---

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev              # Run Vite dev server (frontend only)
npm run tauri dev       # Run full Tauri app in dev mode

# Building
npm run build           # Build frontend for production
npm run tauri build     # Build distributable binaries

# Quality Checks
npm run check           # Run TypeScript type checking
npm run test:run        # Run test suite
npm run lint            # Run linter (if configured)
npm run format          # Format code (if configured)
```

### Development Workflow

**Frontend changes** (TypeScript/Svelte):
- Edit files in `src/`
- Changes hot-reload automatically
- Check console for errors

**Backend changes** (Rust):
- Edit files in `src-tauri/src/`
- Stop the dev server (Ctrl+C)
- Run `npm run tauri dev` again to recompile

**Database changes** (migrations):
- Create a new file in `migrations/` (e.g., `017_my_feature.ts`)
- Export the migration in `migrations/index.ts`
- Restart app to apply migration
- Follow append-only principle (never edit shipped migrations)

### Database Migrations

Migrations run automatically on startup. To create a new migration:

1. Create `migrations/00X_description.ts`
2. Export migration object with `id`, `name`, and `up` SQL
3. Add to `migrations/index.ts` exports
4. Follow append-only principle (never edit shipped migrations)

Example:
```typescript
export const migration005 = {
  id: '005',
  name: 'add_bank_reconciliation',
  up: `
    CREATE TABLE bank_statement (...);
    CREATE TABLE reconciliation (...);
  `
};
```

### Creating Domain Operations

All business logic belongs in `src/lib/domain/`:

1. Define TypeScript interfaces in `types.ts`
2. Create operation module (e.g., `new-feature-operations.ts`)
3. Use `persistenceService` for data access
4. Return `PostingResult` with warnings
5. Call from UI components

---

## 🔒 Security & Privacy

### Data Security
- **No Cloud Storage**: All data remains on your device
- **No Telemetry**: No usage tracking or analytics
- **No External Calls**: Application runs fully offline

### Application Security
- **Content Security Policy**: Strict CSP prevents XSS attacks
- **Capability System**: Tauri permissions limited to SQL, filesystem, dialogs
- **Signed Binaries**: Production builds code-signed (Windows/macOS)
- **Sandboxed Environment**: Tauri provides OS-level sandboxing

### Data Integrity
- **Database Triggers**: Enforce double-entry rules at DB level
- **Foreign Key Constraints**: Prevent orphaned records
- **Immutable Posted Entries**: Cannot edit after posting
- **Audit Trail**: Complete change history

---

## 📊 Database Schema

### Core Ledger
- `account`: Chart of accounts with hierarchy
- `journal_entry`: Transaction headers (draft/posted/void)
- `journal_line`: Debit/credit lines (always balanced)
- `transaction_event`: Business event tracking
- `audit_log`: Change history and user actions
- `settings`: Application configuration

### Accounts Receivable / Payable
- `contact`: Customer and vendor records
- `invoice`: Sales invoice headers
- `invoice_line`: Invoice line items
- `payment`: Payment records
- `allocation`: Invoice-to-payment matching

### Tax Management
- `tax_code`: Tax types (GST, HST, PST, etc.)
- `tax_rate`: Historical tax rates by date
- `tax_jurisdiction`: Geographic tax rules

### Future Modules
- `item`: Inventory SKU management
- `payroll_run`: Payroll batch processing
- `payroll_line`: Employee payment lines
- `bank_statement`: Imported bank transactions
- `reconciliation`: Bank reconciliation records

---

## 🗺️ Roadmap

### ✅ Completed Phases

#### Phase 1-3: Core MVP
- [x] Invoice editing and voiding workflows
- [x] Invoice and payment detail views
- [x] PDF generation for invoices

#### Phase 4: Audit Hardening
- [x] Closed period enforcement (database triggers)
- [x] System account integrity fixes
- [x] Tax-inclusive pricing support
- [x] Backup/restore hardening
- [x] Foreign key enforcement consistency

#### Phase 5: Bank Import & Receipt Management
- [x] CSV bank statement import with flexible mapping
- [x] Transaction matching and auto-categorization
- [x] Receipt attachment with drag-and-drop
- [x] Content-hash deduplication
- [x] Bank import UI and workflows

#### Phase 5.5: Performance & Integrity
- [x] N+1 query pattern optimization in reports (10x+ faster)
- [x] Database-level aggregation for Balance Sheet, P&L, Trial Balance
- [x] Reports service layer for clean separation of concerns

#### Phase 6: UX Hardening
- [x] Manual journal entry UI (Pro Mode)
- [x] System account mapping UI
- [x] Toast notification system
- [x] Mode switch confirmation dialogs
- [x] Reconciliation adjustment flow

#### Phase 7: Dynamic Account Management
- [x] Editable account codes
- [x] Expanded system account roles (18 configurable roles)
- [x] System account badges in UI
- [x] Database reset functionality (Pro Mode)
- [x] Comprehensive test suite (501 tests)

### 🚧 Future Phases

#### Phase 8: Advanced Features
- [ ] Additional file format support (OFX, QBO)
- [ ] Advanced auto-categorization rules
- [ ] Custom report builder
- [ ] Date range filtering for reports

#### Phase 9: Extended Functionality
- [ ] Multi-currency support with exchange rates
- [ ] Inventory tracking and COGS calculation
- [ ] Payroll processing with tax withholdings
- [ ] Budgeting and forecasting

#### Phase 10: Collaboration
- [ ] Multi-user support with permissions
- [ ] Optional cloud sync (encrypted)
- [ ] Accountant collaboration mode
- [ ] Data export API

---

## 🐛 Known Limitations

1. **Floating-Point Precision**: Uses 1-cent tolerance for balance checking (acceptable for MVP, consider integer-cent storage for V2)
2. **Report Date Ranges**: Advanced date filtering available in Phase 3 (fiscal year close, period filtering)
3. **Default Company Info**: PDF invoices use default company info (settings UI planned)
4. **Single Entity**: Supports one business entity per database
5. **Invoice Numbering**: Client-side generation (acceptable for single-user, would need ACID counter for multi-user)

---

## 🤝 Contributing

Invariant Accounting is in active development. Contributions are welcome!

### Areas for Contribution
1. **Feature Development**: Implement roadmap features
2. **Testing**: Add unit and e2e tests
3. **Documentation**: Improve guides and API docs
4. **Localization**: Add support for other languages
5. **Platform Support**: Test and improve cross-platform compatibility
6. **Bug Fixes**: Report and fix issues

### Development Setup
See [Getting Started](#-getting-started) above. Submit PRs against the `main` branch.

---

## 📝 License

License to be determined. Currently proprietary during development.

---

## 🙏 Acknowledgments

Built with open-source technologies:
- [Tauri](https://tauri.app/) - Desktop application framework
- [Svelte](https://svelte.dev/) - Reactive UI framework
- [SQLite](https://sqlite.org/) - Embedded database
- [Vite](https://vitejs.dev/) - Build tool

Inspired by accounting principles from:
- [Plain Text Accounting](https://plaintextaccounting.org/)
- [Double-Entry Bookkeeping](https://en.wikipedia.org/wiki/Double-entry_bookkeeping)

---

## 📚 Additional Resources

- **Documentation**: See `docs/` directory
- **Issue Tracker**: [GitHub Issues](https://github.com/yorphos/invariant/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yorphos/invariant/discussions)
- **Project Status**: See [CHANGELOG.md](CHANGELOG.md)

---

## 📞 Support

For questions, issues, or feature requests:
- Open an issue on GitHub
- Check documentation in `docs/`
- Review [troubleshooting guide](docs/troubleshooting.md)

---

**Built with ❤️ for small businesses who value data ownership and accounting integrity.**
