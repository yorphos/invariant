# Changelog

All notable changes to Invariant Accounting will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial project setup with Tauri v2 + Svelte + TypeScript + Vite
- SQLite database with automatic migration system
- Core database schema (accounts, journal, audit log)
- A/R and A/P schema (contacts, invoices, payments, allocations)
- Inventory and payroll schema (items, movements, payroll runs)
- Tax management schema with Canadian tax codes (GST, HST, PST)
- Database triggers for double-entry integrity enforcement
- Database triggers for posted entry immutability
- Posting engine for creating journal entries
- A/R matching engine with multiple strategies (exact, amount, FIFO)
- Policy engine for beginner vs pro mode enforcement
- Persistence service layer with type-safe CRUD operations
- Basic UI shell with navigation and mode switching
- Dashboard with quick actions
- Settings page with mode toggle
- Content Security Policy configuration
- Capability-based permission system
- Comprehensive documentation (README, quick-start, roadmap, troubleshooting)

### Fixed
- Recursive loop in npm scripts (beforeDevCommand pointing to itself)

## [0.1.0] - 2026-01-24

### Initial Release
- Foundation and architecture complete
- Database layer: 100% complete
- Domain logic: 100% complete
- Services layer: 100% complete
- UI: Basic shell complete, forms pending

### Known Limitations
- Invoice creation UI not yet implemented
- Payment entry UI not yet implemented
- Expense recording UI not yet implemented
- No financial reports yet
- No testing infrastructure yet
- No bank reconciliation
- No receipt attachments
- No cloud sync

### Technical Details
- SQLite database with 20+ tables
- 4 comprehensive migrations
- 10+ database triggers
- ~3,500+ lines of code
- Full TypeScript coverage
- Rust backend with Tauri plugins (SQL, FS, Dialog)

### What Works
- Database initialization and migrations
- Mode switching (Beginner ↔ Pro)
- Settings persistence
- Double-entry validation
- Smart payment matching algorithms
- Policy-driven workflow recommendations

## Versioning Strategy

- **Major version (X.0.0)**: Breaking changes, significant new features
- **Minor version (0.X.0)**: New features, no breaking changes
- **Patch version (0.0.X)**: Bug fixes, small improvements
