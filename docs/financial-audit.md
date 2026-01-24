# Financial Audit Report - Invariant Accounting

**Date:** January 24, 2026  
**Auditor:** OpenCode AI (CPA-level Simulation)  
**Target Version:** Canada-first MVP  

---

## 1. Executive Summary

The "Invariant Accounting" system demonstrates a surprisingly robust foundation for an early-stage MVP. The core ledger architecture enforces double-entry principles and immutability at the database level (SQLite triggers), which acts as an excellent "defense in depth" against application-layer logic errors. The separation of "Transaction Events" from "Journal Entries" provides a strong audit trail.

However, the system currently faces **Critical** risks regarding mathematical precision (floating-point arithmetic) and **Bank Reconciliation logic**. The use of standard IEEE 754 floating-point numbers for financial calculations creates a high probability of rounding errors that will eventually violate the strict database constraints or result in incorrect tax filings. Additionally, the bank reconciliation module appears to have a fundamental logic flaw that renders it unusable.

**Top 5 Risks:**
1.  **Floating Point Math:** Use of JavaScript `number` types for currency leads to inevitable precision errors.
2.  **Bank Reconciliation Logic:** The formula compares "Sum of Cleared Items" directly to "Statement Balance" without accounting for the Opening Balance.
3.  **Tax Rounding:** Lack of specific "round per line" vs. "round per invoice" logic may cause 1-cent variances against official tax tables.
4.  **Credit Notes/Refunds:** No dedicated workflow for partial refunds or credit notes; relying on "Void and Recreate" is insufficient for partial returns.
5.  **Hardcoded Tolerances:** The `ABS(diff) > 0.01` SQL constraint allows a 1-cent imbalance to persist in the ledger, which violates the zero-sum principle of double-entry bookkeeping.

---

## 2. Standards Coverage & Assumptions

**Target Framework:**
- **Standards:** Canadian Accounting Standards for Private Enterprises (ASPE) / General Accepted Accounting Principles (GAAP).
- **Jurisdiction:** Canada (Federal + Provinces). Evidence: `HST-ON`, `GST` tax codes, and `locale: CA` defaults.

**Assumptions:**
- **Currency:** System is single-currency (CAD) by default, though schema supports multi-currency.
- **Basis:** Accrual basis (implied by AR/AP subledgers and "Unpaid" invoice statuses).
- **Database:** SQLite is the only persistence layer; constraints are enforced there.

---

## 3. Detailed Findings

### Ledger & Double-Entry
**Severity: Medium (Architecture is strong, implementation has precision risks)**

*   **Observation:** The database enforces `ABS(debit - credit) < 0.01` via triggers (`migrations/004`).
*   **Why it matters:** This guarantees that the ledger *cannot* be materially out of balance.
*   **Finding:** The `> 0.01` tolerance means a journal entry can technically be out of balance by $0.01. In a high-volume system, these pennies accumulate in the Trial Balance.
*   **Recommendation:** Move to integer-based storage (cents) or strict decimal types. Change constraint to `SUM(debit) = SUM(credit)` (exact match).

### Math & Precision
**Severity: Critical**

*   **Observation:** Typescript code uses `number` (float). Tests verify `toBeCloseTo(expected, 2)`. Code like `quantity * unit_price` runs without explicit rounding steps.
*   **Why it matters:** `0.1 + 0.2 != 0.3`. Eventually, a split payment or tax calculation will result in `$100.005`, which will round unpredictably or fail the DB constraint.
*   **Recommendation:** Adopt a library like `Dinero.js` or `Currency.js` (integer-based). Store values as integers (cents) in the DB, or use text-based decimal storage if using SQLite `DECIMAL`.

### Bank Reconciliation
**Severity: Critical**

*   **Observation:** `src/lib/services/bank-reconciliation.ts` calculates difference as `SUM(Cleared Items) - Statement Balance`.
*   **Why it matters:** This ignores the **Opening Balance**. A reconciliation must be: `Opening Balance + Cleared Deposits - Cleared Withdrawals = Statement Balance`. As implemented, it requires the user to re-clear every historical transaction every month to match the statement balance.
*   **Recommendation:** rewrite `calculateReconciliationDifference` to include the account's running balance *prior* to the reconciliation period as the "Opening Balance".

### Tax (GST/HST)
**Severity: High**

*   **Observation:** Tax is calculated as `subtotal * rate`.
*   **Why it matters:** CRA has specific rules (rounding to nearest cent). Sometimes rounding applies to the *line*, sometimes to the *invoice total*. The current implementation relies on implicit float rounding.
*   **Recommendation:** Implement explicit rounding strategies (e.g., Round Half Up). Add a setting for "Line-level" vs "Invoice-level" tax calculation to match vendor invoices exactly.

### Period Close
**Severity: Low (Implementation is robust)**

*   **Observation:** `migrations/012` prevents posting to closed periods via triggers. `period-close.ts` generates a hard journal entry to zero out P&L.
*   **Why it matters:** Prevents historical data tampering.
*   **Finding:** Logic is sound. The "Undo" (Reopen) capability correctly voids the closing entry, preserving the audit trail.

### Invoicing & A/R
**Severity: Medium**

*   **Observation:** "Edit" functionality forces a "Void & Recreate".
*   **Why it matters:** This is excellent for audit trails but painful for users fixing a typo.
*   **Finding:** Lack of **Credit Note** functionality. If a user returns 1 item from a 10-item invoice, the user must void the whole invoice and recreate a 9-item invoice. This is rigid.
*   **Recommendation:** Implement a `CreditNote` entity that posts `DR Revenue / CR AR`.

---

## 4. Test Plan Recommendations

The current test suite (`accounting-principles.test.ts`) is a good start but covers "Happy Paths". We need "Sad Path" accounting tests:

1.  **Precision Stress Test:**
    *   Create an invoice with quantity `3` and price `33.33`. Total `99.99`.
    *   Apply tax `13%`.
    *   Verify the journal entry balances to the *exact cent* without float artifacts.
2.  **Bank Rec Boundary:**
    *   Test reconciling Period 2 without re-clearing Period 1's items. Verify logic handles opening balances.
3.  **Fiscal Year Boundary:**
    *   Post an invoice on Dec 31 23:59:59.
    *   Close the year.
    *   Attempt to void that invoice. Ensure the system blocks it or forces the reversal into the *new* year.

---

## 5. MVP Compliance Checklist (Canada)

| Feature | Status | Notes |
| :--- | :--- | :--- |
| **Double-Entry Engine** | ✅ Implemented | Enforced by DB triggers. |
| **Chart of Accounts** | ✅ Implemented | Supports Assets, Liab, Equity, Rev, Exp. |
| **GST/HST Logic** | ⚠️ Partial | Rate lookup exists; Rounding rules missing. |
| **Invoicing** | ✅ Implemented | Generated journals are correct. |
| **Bill Payment / AP** | ⚠️ Partial | Schema exists (Migration 010), logic not fully reviewed. |
| **Bank Reconciliation** | ❌ Broken | Logic missing Opening Balance. |
| **Financial Reports** | ⚠️ Partial | SQL queries exist in `period-close.ts`, need formal Balance Sheet view. |
| **Audit Trail** | ✅ Implemented | `audit_log` tracks all changes. |
| **Multi-Currency** | ⚠️ Partial | Schema exists (Migration 011), requires strict FX gain/loss testing. |
