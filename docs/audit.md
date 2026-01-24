# Accounting Compliance & Technical Review

**Date:** 2026-01-24
**Reviewer:** OpenCode Agent (CPA-level spec)
**System:** Invariant Accounting (v0.1.0)
**Scope:** Full repository analysis for accounting principles compliance

---

## 1. Executive Summary

Invariant Accounting demonstrates a surprisingly robust foundation for a "beginner" accounting system, largely due to its "accounting-first" database design. The use of strict SQLite triggers to enforce double-entry balancing and immutability of posted records is a professional-grade architectural choice that significantly reduces the risk of data corruption.

However, the system is currently a **prototype** and is **not yet ready** for real-world production use, primarily due to hardcoded tax logic, missing financial closing procedures, and a lack of reporting depth (specifically regarding retained earnings and period-based income statements). While the data integrity is high, the business logic layer makes dangerous assumptions (e.g., fixed 13% tax) that would cause immediate non-compliance outside specific scenarios.

**Top 5 Risks:**
1.  **Critical Tax Non-Compliance:** Hardcoded 13% tax rate (Ontario HST) makes the system unusable for any other jurisdiction or tax-exempt scenarios.
2.  **Reporting Validity:** Income Statement logic calculates inception-to-date totals, failing to isolate fiscal periods.
3.  **Missing Period Close:** No mechanism to close periods or calculate Retained Earnings, meaning the Balance Sheet will permanently drift out of balance in future years.
4.  **Fragile Chart of Accounts:** Key account IDs (A/R, Tax Payable) are hardcoded in the codebase, creating a high risk of failure if the user modifies the default chart of accounts.
5.  **No Bank Reconciliation:** Missing ability to reconcile ledgers against external bank data, a fundamental requirement for verifying accuracy.

---

## 2. Standards Coverage & Assumptions

**Target Framework:**
The system appears to target **Canadian ASPE (Accounting Standards for Private Enterprises)** given the terminology ("HST", "GST") and simplified accrual basis. It is effectively a "Cash/Accrual Hybrid" suited for small service-based businesses.

**Assumptions Made for Review:**
*   The system is single-currency (CAD).
*   The user is operating in Ontario, Canada (due to the 13% hardcoded tax).
*   Inventory is periodic (not perpetual), as COGS logic is rudimentary.

---

## 3. Detailed Findings

### Ledger & Double-Entry
**Severity: LOW (Positive Finding)**
*   **Observation:** The system enforces strict double-entry principles.
*   **Evidence:** `migrations/004_integrity_triggers.ts` contains a trigger `enforce_balanced_journal_on_post` that aborts transactions if debits != credits (0.01 tolerance).
*   **Why it matters:** This guarantees the trial balance will always equal zero, preventing the most common software accounting error.
*   **Recommendation:** Maintain this approach. It is excellent.

### Period Close & Adjustments
**Severity: CRITICAL**
*   **Observation:** There is no "Period Close" functionality. `journal_entry` table has dates, but there is no "soft close" (locking dates) or "hard close" (moving Net Income to Retained Earnings).
*   **Why it matters:** Without closing entries, the Income Statement accounts (Revenue/Expense) never reset to zero. In Year 2, the "Revenue" account will show the sum of Year 1 + Year 2. The Balance Sheet will also fail to balance because the "Equity" section relies on a dynamic calculation of Net Income that spans *all time*.
*   **Recommendation:** Implement a `fiscal_years` table and a `close_period` function that generates a journal entry: Debit Revenue, Credit Expenses, Plug Retained Earnings.

### Invoicing / A/R
**Severity: HIGH**
*   **Observation:** `invoice-operations.ts` uses hardcoded account codes ('1100' for A/R, '2220' for Tax).
*   **Why it matters:** If a user deletes or renumbers these accounts, the system will crash or post to the wrong account.
*   **Recommendation:** Add a `system_accounts` mapping table or settings configuration to allow flexible account mapping.

### Payments / Deposits
**Severity: MEDIUM**
*   **Observation:** Payment allocation logic (`allocation` table) exists and supports partial payments. However, `update_payment_allocated_insert` trigger logic is complex and could desync if manual journal entries affect A/R directly without going through the `payment` module.
*   **Why it matters:** Subledger (A/R Aging) might disagree with the General Ledger (A/R Account Balance).
*   **Recommendation:** Add a "Subledger Integrity Check" report that compares `SUM(open invoices)` vs `Account 1100 Balance`.

### Tax (GST/HST/VAT)
**Severity: CRITICAL**
*   **Observation:** `src/lib/domain/invoice-operations.ts` line 64: `const taxAmount = subtotal * 0.13;`
*   **Why it matters:** This hardcodes Ontario HST. It ignores the `tax_code` and `tax_rate` tables completely. This is legally non-compliant for anyone outside Ontario or selling zero-rated goods.
*   **Recommendation:** Wire up the existing `tax_rate` schema. Lookup the rate based on the invoice's `tax_code_id`.

### Reporting & Financial Statements
**Severity: HIGH**
*   **Observation:** `ReportsView.svelte` calculates "Net Income" as `Total Revenue (All Time) - Total Expenses (All Time)`.
*   **Why it matters:** This is technically "Retained Earnings + Current Year Income" combined. An Income Statement must be filterable by `start_date` and `end_date`.
*   **Recommendation:** Refactor the report query to accept a date range for the Income Statement. For the Balance Sheet, calculate Retained Earnings as (Assets - Liabilities - Share Capital) for dates prior to the current year.

### Audit Trail & Controls
**Severity: LOW (Positive Finding)**
*   **Observation:** Immutability is enforced via database triggers. Posted entries cannot be updated or deleted.
*   **Evidence:** `prevent_modify_posted_journal` trigger in migration 004.
*   **Why it matters:** This meets strict audit standards. Even a developer with DB access cannot easily alter history without disabling triggers.

---

## 4. Test Plan Recommendations

The current test suite focuses on happy paths. I recommend adding these specific accounting validation tests:

1.  **The "Year 2" Test:**
    *   Create revenue in Year 1.
    *   Create revenue in Year 2.
    *   Run Income Statement for Year 2.
    *   *Expected:* Only Year 2 revenue shows.
    *   *Current Prediction:* FAILS (Shows Year 1 + Year 2).

2.  **The "Tax Mismatch" Test:**
    *   Create an invoice with a tax code meant for 5% (GST).
    *   Verify the journal entry posted.
    *   *Expected:* Tax amount is 5%.
    *   *Current Prediction:* FAILS (Calculates 13%).

3.  **The "Manual A/R" Test:**
    *   Create a manual Journal Entry: DR Cash, CR A/R (bypassing the Payment module).
    *   Check Invoice Status.
    *   *Expected:* Invoice remains "Open" (Subledger desync), but GL is correct.
    *   *Goal:* Verify how the system handles GL/Subledger discrepancies.

---

## 5. MVP Compliance Checklist (Canada-First)

| Item | Status | Notes |
| :--- | :--- | :--- |
| **Double-Entry Engine** | ✅ **Implemented** | Best-in-class implementation. |
| **Audit Trail (Immutable)** | ✅ **Implemented** | Enforced by DB triggers. |
| **Chart of Accounts** | ⚠️ **Partial** | Standard structure, but brittle hardcoding. |
| **Sales Tax Logic** | ❌ **Missing** | Hardcoded to 13%; schema exists but unused. |
| **Financial Reports** | ⚠️ **Partial** | Logic is rudimentary; Period concepts missing. |
| **Period Closing** | ❌ **Missing** | No retained earnings roll-forward. |
| **Bank Reconciliation** | ❌ **Missing** | No functionality to match bank feeds. |
| **A/R Aging** | ⚠️ **Partial** | Data exists, but no dedicated report. |
| **Multi-Currency** | ❌ **Missing** | Single currency only. |
| **Data Backup** | ⚠️ **Unknown** | SQLite file is portable, but no auto-backup seen. |

