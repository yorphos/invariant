# Quick Start Guide

## Prerequisites

Before you begin, ensure you have the following installed:

### Required
- **Node.js** 18+ and npm
- **Rust** 1.77.2+ (install from [rustup.rs](https://rustup.rs/))

### Platform-Specific

**Windows:**
- Microsoft Visual Studio C++ Build Tools
- WebView2 (usually pre-installed on Windows 10/11)

**macOS:**
```bash
xcode-select --install
```

**Linux (Debian/Ubuntu):**
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev \
  libgtk-3-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

See [Tauri Prerequisites](https://v2.tauri.app/start/prerequisites/) for other Linux distributions.

## Installation

1. **Clone the repository** (or if you already have the code):
   ```bash
   cd /path/to/invariant
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Verify installation:**
   ```bash
   npm run check
   ```
   This should complete without errors.

## Running the Application

### Development Mode

```bash
npm run dev
```

This will:
- Start Vite dev server on `http://localhost:5173`
- Build and launch the Tauri application
- Enable hot module replacement (HMR) for frontend changes
- Open the application window

**First run takes longer** as Rust compiles the backend.

### What Happens on First Launch

1. The app creates a SQLite database in your OS app data directory:
   - **Windows**: `%APPDATA%\com.tauri.dev\invariant.db`
   - **macOS**: `~/Library/Application Support/com.tauri.dev/invariant.db`
   - **Linux**: `~/.local/share/com.tauri.dev/invariant.db`

2. Runs 4 migrations to create the schema:
   - Core ledger tables (accounts, journal, audit)
   - A/R and A/P tables (contacts, invoices, payments)
   - Inventory, payroll, and tax tables
   - Database triggers for integrity enforcement

3. Inserts default settings:
   - Mode: `beginner`
   - Locale: `CA` (Canada)
   - Fiscal year start: `01-01`

4. Shows the dashboard with quick actions

## Using the Application

### Dashboard

The main screen shows:
- Welcome message explaining your current mode
- Quick action buttons to jump to common tasks
- Mode indicator badge in the sidebar (green = Beginner, red = Pro)

### Navigation

Use the sidebar to switch between:
- **Dashboard**: Overview and quick actions
- **Invoices**: Create and manage sales invoices (placeholder)
- **Payments**: Record payments and allocate to invoices (placeholder)
- **Expenses**: Track business expenses (placeholder)
- **Settings**: Change mode and app configuration

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

## Development Workflow

### Making Changes

1. **Frontend changes** (TypeScript/Svelte):
   - Edit files in `src/`
   - Changes hot-reload automatically
   - Check console for errors

2. **Backend changes** (Rust):
   - Edit files in `src-tauri/src/`
   - Stop the dev server (Ctrl+C)
   - Run `npm run dev` again to recompile

3. **Database changes** (migrations):
   - Create a new file in `migrations/` (e.g., `005_my_feature.ts`)
   - Export the migration in `migrations/index.ts`
   - Delete your local database to test from scratch
   - Or manually apply the migration SQL

### Type Checking

```bash
npm run check
```

Runs both Svelte and TypeScript type checking.

### Building for Production

```bash
npm run build
```

Creates a production build in `src-tauri/target/release/`.

**Platform-specific outputs:**
- **Windows**: `.exe` and `.msi` installer
- **macOS**: `.app` bundle and `.dmg`
- **Linux**: `.deb`, `.AppImage`, or binary

## Troubleshooting

### "Rust not found" or compilation errors
```bash
# Install or update Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup update
```

### "Database locked" error
- Close all instances of the app
- Delete the database file and restart (see "What Happens on First Launch" for location)

### "Failed to initialize database"
- Check the console for detailed SQL errors
- Verify migrations are syntactically correct
- Ensure no duplicate migration IDs

### Hot reload not working
- Stop the dev server (Ctrl+C)
- Run `npm run dev` again
- For Rust changes, a full restart is always required

### Type errors in migrations
- Ensure import paths are correct: `import type { Migration } from '../src/lib/services/database'`
- Run `npm run check` to see detailed errors

## Next Steps

Now that the app is running:

1. **Explore the architecture**:
   - Read `docs/project.md` for detailed design
   - Read `docs/implementation-summary.md` for what's built
   - Check `src/lib/domain/` for business logic

2. **Add your first feature**:
   - Create an invoice form component
   - Build an expense entry wizard
   - Implement a simple P&L report

3. **Set up your chart of accounts**:
   - Add standard accounts for your business
   - Use the persistence service: `persistenceService.createAccount()`

4. **Write tests**:
   - Unit tests for `posting-engine.ts`
   - Integration tests for database operations

## Getting Help

- Check the [Tauri Documentation](https://v2.tauri.app/)
- Review the [Svelte Tutorial](https://svelte.dev/tutorial)
- Read the implementation details in `docs/project.md`

## Project Status

**Completed:**
- ✅ Database schema and migrations
- ✅ Domain logic (posting, matching, policy)
- ✅ Persistence layer
- ✅ Basic UI shell

**In Progress:**
- ⏳ Full UI forms for invoices, payments, expenses
- ⏳ Financial reports
- ⏳ Testing infrastructure

**Planned:**
- 📋 Bank reconciliation
- 📋 Receipt attachments
- 📋 Cloud sync (optional)
