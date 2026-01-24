# Invariant Accounting

A lightweight, offline-first accounting application built with **Tauri v2**, **SQLite**, **TypeScript**, and **Svelte**. Designed for small businesses and freelancers who need robust accounting tools with the convenience of a desktop application.

## Features

### Core Capabilities

- **Offline-First**: All data stored locally in SQLite. No internet required.
- **Double-Entry Accounting**: Enforced at the database level with triggers
- **Smart A/R Matching**: Automatic payment allocation using FIFO, amount matching, and reference matching
- **Beginner & Pro Modes**: 
  - **Beginner Mode**: Guided workflows, recommended practices, prevents common mistakes
  - **Pro Mode**: Full control, direct journal entries, override warnings
- **Audit Trail**: Complete history of all transactions with immutability for posted entries
- **Cross-Platform**: Windows, macOS, and Linux support

### Implemented Modules

- **Chart of Accounts**: Hierarchical account structure with types (Asset, Liability, Equity, Revenue, Expense)
- **Journal Entries**: Double-entry bookkeeping with draft/posted/void status
- **Contacts**: Customer and vendor management
- **Invoicing**: Create invoices, track A/R, payment tracking
- **Payments**: Record payments with smart allocation
- **Canadian Tax Support**: GST/HST built-in, extensible for other jurisdictions

### Planned Modules

- Inventory tracking
- Payroll processing
- Bank reconciliation
- Financial reports (P&L, Balance Sheet, Trial Balance)
- Receipt/document attachment
- Cloud sync (optional)

## Architecture

```
invariant/
├── src/                      # Frontend (Svelte + TypeScript)
│   ├── lib/
│   │   ├── domain/          # Domain logic (posting engine, A/R matching, policy)
│   │   ├── services/        # Persistence and database services
│   │   └── ui/              # Reusable UI components
│   └── App.svelte           # Main application UI
├── src-tauri/               # Backend (Rust + Tauri)
│   ├── src/                 # Rust application code
│   └── capabilities/        # Tauri permission configuration
├── migrations/              # SQL migrations
│   ├── 001_core_ledger.ts
│   ├── 002_contacts_ar_ap.ts
│   ├── 003_inventory_payroll_tax.ts
│   └── 004_integrity_triggers.ts
└── docs/
    └── project.md           # Detailed implementation document
```

## Tech Stack

- **Frontend**: Svelte 5 + TypeScript + Vite
- **Backend**: Tauri v2 (Rust)
- **Database**: SQLite via Tauri SQL plugin
- **Security**: CSP configured, capability-based permissions

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Rust 1.77.2+
- Platform-specific dependencies for Tauri:
  - **Windows**: Microsoft Visual Studio C++ Build Tools
  - **macOS**: Xcode Command Line Tools
  - **Linux**: webkit2gtk, libappindicator3, etc.

See [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/) for detailed setup.

### Installation

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

### First Run

On first launch, the app will:
1. Create a SQLite database in your app data directory
2. Run all migrations to set up the schema
3. Insert default settings (beginner mode, Canada locale)
4. Initialize the UI

## Development

### Project Structure

- **Domain Layer** (`src/lib/domain/`): Pure business logic
  - `posting-engine.ts`: Creates journal entries following double-entry rules
  - `ar-matching.ts`: Smart invoice-to-payment allocation
  - `policy.ts`: Enforces beginner vs pro mode rules
  - `types.ts`: TypeScript interfaces for all entities

- **Services Layer** (`src/lib/services/`):
  - `database.ts`: Database initialization and migrations
  - `persistence.ts`: High-level CRUD operations

- **Migrations** (`migrations/`): Versioned SQL schema changes
  - Automatically applied on startup
  - Append-only (never edit shipped migrations)

### Key Principles

1. **Local-first**: UI never waits on network
2. **Immutability**: Posted entries cannot be edited (use reversals)
3. **Database enforces invariants**: Triggers prevent unbalanced postings
4. **Single source of truth**: Posting engine is the only place that creates journal entries
5. **Policy-driven**: Beginner mode guides users; Pro mode allows flexibility

## Security

- **CSP**: Strict Content Security Policy configured
- **Permissions**: Capability-based model (SQL, filesystem, dialogs only)
- **No remote content**: All resources local
- **Signed builds**: Production builds are code-signed (Windows/macOS)

## Database Schema

### Core Tables

- `account`: Chart of accounts
- `journal_entry`: Transaction headers
- `journal_line`: Debit/credit lines
- `transaction_event`: High-level business events
- `audit_log`: Change history

### A/R & A/P

- `contact`: Customers and vendors
- `invoice`: Sales invoices
- `invoice_line`: Line items
- `payment`: Payment records
- `allocation`: Invoice-to-payment matching

### Supporting Tables

- `settings`: App configuration
- `tax_code`, `tax_rate`, `tax_jurisdiction`: Tax management
- `item`: Inventory SKUs
- `payroll_run`, `payroll_line`: Payroll processing

## Testing

```bash
# Run type checking
npm run check

# Future: Run unit tests
npm test

# Future: Run e2e tests
npm run test:e2e
```

## Contributing

This is a foundational implementation. Areas for contribution:

1. **UI Components**: Build out invoice/expense/payment forms
2. **Reports**: P&L, Balance Sheet, Trial Balance
3. **Bank Import**: QBO/CSV import
4. **Reconciliation**: Bank statement matching
5. **Multi-currency**: Foreign exchange support
6. **Tests**: Unit and e2e test coverage

## License

[To be determined]

## References

- [Tauri v2 Documentation](https://v2.tauri.app/)
- [Tauri SQL Plugin](https://v2.tauri.app/plugin/sql/)
- [Svelte Documentation](https://svelte.dev/)
- [Implementation Details](docs/project.md)
