# Implementation Document

**Stack:** Tauri v2 + SQLite + TypeScript + Svelte (Vite)
**Goals:** lightweight, snappy, offline-first, cross-platform desktop (Win/macOS/Linux) with a clean path to cloud sync and future web.

---

## 1) High-level architecture

### 1.1 Process model (Tauri)

* **Frontend (WebView):** Svelte UI + TypeScript domain logic.
* **Backend (Rust runtime):** minimal native surface (windowing, file paths, OS integration, auto-updates).
* **DB access:** via **Tauri SQL plugin** (SQLite driver) as the primary mechanism for local persistence. ([Tauri][1])

### 1.2 Core design principle

* **Local-first:** all reads/writes hit local SQLite immediately; UI never waits on network.
* **Server is optional:** sync is a “replication layer” that can arrive later without changing core UX.

### 1.3 Layering

* **UI layer (Svelte):** forms, guided flows, wizards, review screens.
* **Domain layer (TS):** *the only place* that constructs accounting events (invoices, bills, payments, postings).
* **Persistence layer:** SQL schema + migrations + constraints/triggers to enforce invariants at the database boundary.
* **Policy layer:** “Beginner mode” vs “Pro mode” rules (strict nudges vs expert freedom) applied in UI + domain validation.

---

## 2) Framework choice notes (snappy + lightweight)

### Why Tauri

* Uses the system WebView; avoids bundling Chromium; smaller footprint vs Electron while keeping web UI tooling.
* Security model: capability/permission driven (recommended for production hardening). ([Tauri][2])

### Frontend performance rules (Svelte)

* Prefer **Svelte (not SvelteKit)** for a desktop-first app unless you specifically need routing/data loading conventions.
* Use **Vite** build; keep dependency graph minimal (avoid giant UI frameworks if possible).
* Use **virtualized lists** for ledger rows / transaction lists (never render 10k rows).
* Keep heavy computations off the UI thread (Web Workers for report generation if needed later).

---

## 3) Project scaffolding & repo structure

### 3.1 Create the project

Use **create-tauri-app** with an officially maintained template, then choose a Svelte + TS frontend (or “vanilla” then add Svelte). ([Tauri][3])

Suggested repo layout (monorepo-ready):

```
app/
  src/                 # Svelte frontend
  src/lib/             # domain + ui libs
  src-tauri/           # Rust + tauri config
  migrations/          # SQL migration files
  packages/
    domain/            # (optional) pure TS domain engine
    ui/                # (optional) shared UI components
```

### 3.2 Baseline dependencies

* Frontend: `svelte`, `vite`, `typescript`, chosen state store (Svelte stores or something like `nanostores`).
* Tauri: `@tauri-apps/api`, plus Tauri **SQL plugin** and later **Updater plugin**. ([Tauri][1])

---

## 4) Security baseline (must-have from day 1)

### 4.1 Content Security Policy (CSP)

* Run with a strict CSP to reduce XSS impact; Tauri supports CSP configuration and uses nonces/hashes for local resources. ([Tauri][4])
* Treat **any remote content** as hostile: don’t render remote HTML in-app.

### 4.2 Capabilities & permissions

Tauri v2 uses a permissions model to control which commands/plugins can be used by the WebView; you grant permissions via capabilities. ([Tauri][2])
Baseline rule: **only enable what you need** (SQL, path access, dialogs, updater later).

### 4.3 Plugin security stance

* **Internal-only plugins** initially: bundled and code-reviewed.
* Keep a clear boundary: plugin API should not expose raw DB handles by default (even if the core app uses them internally).

---

## 5) SQLite storage design (offline-first)

### 5.1 File placement

* Store DB in the OS “app data” directory (per-user), retrieved via Tauri path APIs in Rust (or plugin utilities).
* Store attachments (receipts, invoices) in a sibling `attachments/` directory with a content-hash filename scheme:

  * `attachments/<sha256>.<ext>`
  * DB stores metadata + association to transactions.

### 5.2 Migrations

* Use a simple migrations runner at startup:

  * `PRAGMA foreign_keys = ON;`
  * apply migrations in order
  * store applied migration IDs in a `_migrations` table
* Keep migrations **append-only** in git; never edit historical migrations once shipped.

### 5.3 Schema philosophy (accounting correctness)

You want to “force norms” mainly via **invariants** that are *always true* regardless of beginner/pro mode:

Always enforced at DB level:

* Referential integrity (foreign keys).
* **Double-entry integrity** for posted journal entries.
* Immutability of posted transactions (edits become reversal + replacement).

Soft-enforced (policy/UI level):

* Account numbering conventions
* “Preferred” flows (invoice → payment → deposit)
* Categorization nudges

### 5.4 Minimal core tables (MVP)

**Ledger core**

* `account`
* `journal_entry` (header; includes `status = draft|posted|void`)
* `journal_line` (debit/credit lines)
* `transaction_event` (high-level event: “invoice created”, “payment received”, etc. for audit + undo semantics)
* `audit_log` (who/when/what, even in single-user mode)

**Operational modules**

* `contact` (customer/vendor)
* `invoice`, `invoice_line`, `payment`, `allocation` (A/R matching)
* `item` (inventory SKU), `inventory_movement` (inventory tracking)
* `payroll_run`, `payroll_line` (simple payroll MVP)
* `tax_code`, `tax_rate`, `tax_jurisdiction` (Canada-first)

### 5.5 DB constraints / triggers (key to “hands walked to correctness”)

Use triggers to prevent invalid “posted” states (example approach):

* `journal_line` constraint: exactly one of debit/credit is > 0
* `journal_entry` can be **draft** while building; only when **posted** do we enforce balanced totals.
* Trigger blocks setting status to `posted` unless balanced.

This gives you a strong guarantee even if UI code has bugs: posted entries cannot be unbalanced.

---

## 6) Beginner vs Pro mode implementation

### 6.1 Mode is a policy, not a separate database

Store:

* `settings.mode = beginner|pro`
* `settings.locale = CA`
* `settings.fiscal_year_start`, etc.

### 6.2 What “Beginner mode” enforces (UX + validation)

* Workflow-first UI (wizards):

  * Create invoice → receive payment → allocate → reconcile deposit
* Hard nudges:

  * if user tries to post a raw journal that looks like revenue, recommend using “Sales” flow
  * auto-suggest accounts based on vendor/customer history
* Guardrails:

  * prevent editing posted entries directly (offer reversal flow)
  * warn on unusual account choices (“Are you sure you want to post office supplies to Fixed Assets?”)

### 6.3 What “Pro mode” unlocks

* Full chart-of-accounts editing, raw journals, bypassing suggestions.
* Still cannot violate *hard invariants* (balanced posted entries, immutable audit trail).

Implementation detail:

* Domain functions accept a `PolicyContext` and return:

  * `Result = { ok: true, postings } | { ok: false, warnings, requiresOverride }`
* Beginner mode blocks `requiresOverride`; pro mode allows it after confirmation.

---

## 7) Smart A/R matching engine (lumpsum, FIFO, etc.)

### 7.1 Data model for matching

* `payment` records represent **incoming money events** (could be bank deposit, platform payout, or manual receipt)
* `invoice` records represent receivables
* `allocation` links payment ↔ invoice with:

  * amount allocated
  * method (exact ref, FIFO, heuristic)
  * confidence score + explanation

### 7.2 Matching pipeline (deterministic → heuristic)

1. **Deterministic**: exact invoice number / reference match
2. **Candidate generation**: find open invoices by:

   * same customer (if known)
   * amount similarity ± tolerance
   * date windows
3. **Allocation policy**:

   * FIFO oldest-first (default)
   * newest-first
   * best-fit subset (optional later)
4. **Result**:

   * auto-allocate if confidence high
   * otherwise queue for review

### 7.3 Performance note

Keep matching logic in TS but run in a worker if you expect large invoice volumes.

---

## 8) Plugin architecture (internal-only MVP)

### 8.1 Plugin packaging

Start with “bundled plugins” (internal modules) but treat them like plugins:

* Each plugin has:

  * `manifest.json` (id, version, capabilities requested)
  * `register(appApi)` entry point
* Loaded at startup from a compiled-in list (not filesystem loading yet).

### 8.2 Plugin API boundaries

Expose a **high-level** API:

* `registerRoute()`, `registerReport()`, `registerImporter()`
* `readModel()` / `writeCommand()` instead of “run any SQL”

(You can keep raw SQL internally but don’t make it the plugin contract.)

### 8.3 Future: scripting as “plugin type”

Design plugin host so later you can run untrusted plugin code in a sandbox (separate JS runtime). For MVP, don’t do third-party loading.

---

## 9) Auto-updates and releases

Use Tauri’s **Updater plugin**; it supports static JSON or a dynamic update server approach. ([Tauri][5])
Release goals:

* Signed builds for Windows/macOS
* GitHub Actions pipeline to build + attach artifacts
* Update feed hosted on GitHub Releases or a static bucket

---

## 10) Testing & quality gates

### 10.1 Testing layers

* **Domain unit tests (TS):** journal posting rules, tax calculation, allocations, inventory movements
* **DB integration tests:** migration correctness, trigger enforcement (posting must be balanced)
* **UI e2e:** smoke tests for core flows (create invoice, receive payment, allocate, reconcile)

### 10.2 Determinism requirement

Accounting is high-integrity: tests should include “golden” fixtures for:

* P&L totals
* Balance sheet totals
* Trial balance equals zero
* Known tax scenarios (GST/HST combos)

---

## 11) Performance checklist (snappy by default)

* Paginate queries; index common filters:

  * `journal_entry(date)`, `journal_line(account_id)`, `invoice(status, due_date)`, `payment(date)`
* Use virtualized tables for transaction lists.
* Cache derived totals (but invalidate via event log).
* Keep startup work minimal:

  * open DB
  * run migrations
  * load settings
  * render shell
  * load “heavy” screens lazily

---

## 12) Implementation steps (practical “do this in order”)

1. Scaffold Tauri v2 + Svelte + TS (Vite) ([Tauri][3])
2. Add SQL plugin with SQLite driver; implement DB open + migrations ([Tauri][1])
3. Build core schema: accounts + journal + audit log + triggers for posted-balance enforcement
4. Implement domain posting engine (TS) + a thin persistence service
5. Build beginner-mode core flows:

   * record expense
   * create invoice
   * receive payment
   * allocate payment (FIFO default)
6. Add reconciliation “mark cleared” (bank statement import later)
7. Add inventory module (simple movements) + payroll module (simple runs) + sales tax codes
8. Add updater plugin + CI packaging ([Tauri][5])
9. Lock down permissions + CSP, verify production hardening ([Tauri][4])

---

## Appendix: Key Tauri references we’re building around

* Create project / templates: ([Tauri][3])
* SQL plugin (SQLite via sqlx): ([Tauri][1])
* Updater plugin: ([Tauri][5])
* Permissions & capabilities model: ([Tauri][2])
* CSP guidance: ([Tauri][4])

[1]: https://v2.tauri.app/plugin/sql/?utm_source=chatgpt.com "SQL"
[2]: https://v2.tauri.app/security/permissions/?utm_source=chatgpt.com "Permissions"
[3]: https://v2.tauri.app/start/create-project/?utm_source=chatgpt.com "Create a Project"
[4]: https://v2.tauri.app/security/csp/?utm_source=chatgpt.com "Content Security Policy (CSP)"
[5]: https://v2.tauri.app/plugin/updater/?utm_source=chatgpt.com "Updater"
