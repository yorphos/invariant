# Invariant Accounting

**Professional offline-first accounting software for small businesses and freelancers.**

Invariant Accounting is a desktop application that brings enterprise-grade double-entry bookkeeping to your local machine. Built with modern web technologies wrapped in a native desktop shell, it provides the power of traditional accounting software without the complexity, cost, or cloud dependency.

[![Status](https://img.shields.io/badge/Status-MVP%20Complete-brightgreen)]()
[![License](https://img.shields.io/badge/License-TBD-blue)]()
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey)]()

---

## 🎯 Core Philosophy

**Local-First**: Your financial data never leaves your computer. No subscriptions, no cloud lock-in, no privacy concerns.

**Double-Entry Enforced**: Database triggers ensure accounting integrity. Unbalanced entries are impossible.

**Progressive Disclosure**: Beginner mode guides you through correct workflows. Pro mode gives you full control when you're ready.

---

## ✨ Features

### Current Release (MVP v0.1.0)

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
- Automatic journal posting:
  - **DR** Expense Account
  - **CR** Cash/Bank Account

#### 📈 Financial Reports
- **Balance Sheet**: Assets = Liabilities + Equity (with verification)
- **Profit & Loss**: Revenue - Expenses = Net Income
- **Trial Balance**: Complete debit/credit listing
- As-of-date filtering for historical reporting
- Real-time data (no month-end close required)

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
│   │   │   └── expense-operations.ts   # Expense workflows
│   │   ├── services/            # Data layer
│   │   │   ├── database.ts      # Migration runner
│   │   │   ├── persistence.ts   # CRUD operations
│   │   │   └── seed.ts          # Default data
│   │   ├── ui/                  # Reusable components
│   │   │   ├── Button.svelte
│   │   │   ├── Input.svelte
│   │   │   ├── Select.svelte
│   │   │   ├── Card.svelte
│   │   │   ├── Modal.svelte
│   │   │   ├── Table.svelte
│   │   │   ├── InvoiceDetailModal.svelte
│   │   │   └── PaymentDetailModal.svelte
│   │   ├── utils/               # Utility functions
│   │   │   └── pdf-generator.ts # PDF generation
│   │   └── views/               # Application screens
│   │       ├── DashboardView.svelte
│   │       ├── ContactsView.svelte
│   │       ├── InvoicesView.svelte
│   │       ├── PaymentsView.svelte
│   │       ├── ExpensesView.svelte
│   │       └── ReportsView.svelte
│   └── main.ts                  # Application entry point
├── src-tauri/                   # Rust backend
│   ├── src/lib.rs               # Plugin registration
│   ├── Cargo.toml               # Rust dependencies
│   ├── capabilities/            # Permission system
│   │   └── default.json
│   └── tauri.conf.json          # Application configuration
├── migrations/                  # Database versioning
│   ├── 001_core_ledger.ts       # Accounts, journal, audit
│   ├── 002_contacts_ar_ap.ts    # Contacts, invoices, payments
│   ├── 003_inventory_payroll_tax.ts  # Future modules
│   ├── 004_integrity_triggers.ts     # Data integrity
│   └── index.ts                 # Migration registry
└── docs/                        # Documentation
    ├── project.md               # Original specification
    ├── mvp-completion.md        # Implementation summary
    ├── quick-start.md
    ├── roadmap.md
    └── troubleshooting.md
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
git clone https://github.com/yourusername/invariant.git
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

2. **Run Migrations**: Apply all 4 schema migrations automatically

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
npm run lint            # Run linter (if configured)
npm run format          # Format code (if configured)
```

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

### ✅ Tier 1: Essential UX Improvements (COMPLETED)
- [x] Invoice editing and voiding workflows
- [x] Invoice and payment detail views
- [x] PDF generation for invoices

### Phase 2: Enhanced Features
- [ ] Test suite expansion (70+ tests)
- [ ] Data export and backup functionality
- [ ] Advanced payment allocation UI (FIFO, heuristic matching)
- [ ] Date range filtering for reports
- [ ] Custom report builder
- [ ] Batch operations (bulk payments, invoice generation)

### Phase 3: Banking Integration
- [ ] Bank statement import (CSV, OFX, QBO)
- [ ] Automatic transaction matching
- [ ] Bank reconciliation workflows
- [ ] Transaction categorization rules

### Phase 4: Advanced Accounting
- [ ] Multi-currency support with exchange rates
- [ ] Inventory tracking and COGS calculation
- [ ] Payroll processing with tax withholdings
- [ ] Budgeting and forecasting
- [ ] Custom fields and tags

### Phase 5: Collaboration
- [ ] Multi-user support with permissions
- [ ] Optional cloud sync (encrypted)
- [ ] Accountant collaboration mode
- [ ] Data export API

---

## 🐛 Known Limitations

1. **Single Currency**: Only CAD supported in MVP (architecture supports multi-currency)
2. **Report Date Ranges**: Reports show all-time data (period filtering coming in Phase 2)
3. **Manual Allocation**: Payment allocation is manual (advanced strategies exist but not in UI)
4. **Default Company Info**: PDF invoices use default company info (settings UI planned)
5. **Single Entity**: Supports one business entity per database

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
- **Issue Tracker**: [GitHub Issues](https://github.com/yourusername/invariant/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/invariant/discussions)
- **Project Status**: See [CHANGELOG.md](CHANGELOG.md)

---

## 📞 Support

For questions, issues, or feature requests:
- Open an issue on GitHub
- Check documentation in `docs/`
- Review [troubleshooting guide](docs/troubleshooting.md)

---

**Built with ❤️ for small businesses who value data ownership and accounting integrity.**
