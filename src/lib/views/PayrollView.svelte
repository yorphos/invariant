<script lang="ts">
  import { onMount } from 'svelte';
  import { getDatabase } from '../services/database';
  import { 
    createPayrollRun, 
    approvePayrollRun, 
    voidPayrollRun,
    calculatePayroll,
    type EmployeePayInput 
  } from '../domain/payroll-operations';
  import type { PayrollRun, PayrollLine, Account, PolicyMode } from '../domain/types';
  import Button from '../ui/Button.svelte';
  import Input from '../ui/Input.svelte';
  import Select from '../ui/Select.svelte';
  import Card from '../ui/Card.svelte';
  import Table from '../ui/Table.svelte';

  export let mode: PolicyMode;

  let payrollRuns: PayrollRun[] = [];
  let accounts: Account[] = [];
  let loading = true;
  let view: 'list' | 'create' = 'list';
  let selectedRun: PayrollRun | null = null;
  let showDetailModal = false;
  let runLines: PayrollLine[] = [];

  // Form fields
  let formRunNumber = '';
  let formPeriodStart = '';
  let formPeriodEnd = '';
  let formPayDate = '';
  let formEmployees: Array<{
    employee_name: string;
    employee_id: string;
    gross_pay: number | '';
    other_deductions: number | '';
  }> = [{ employee_name: '', employee_id: '', gross_pay: '', other_deductions: '' }];

  // Approval accounts
  let cashAccountId: number | '' = '';
  let salaryExpenseAccountId: number | '' = '';
  let cppPayableAccountId: number | '' = '';
  let eiPayableAccountId: number | '' = '';
  let taxPayableAccountId: number | '';

  // Calculated previews
  let employeePreviews: Array<{
    employee_name: string;
    gross_pay: number;
    cpp: number;
    ei: number;
    tax: number;
    deductions: number;
    net_pay: number;
  }> = [];

  $: {
    // Recalculate previews when form data changes
    employeePreviews = formEmployees
      .filter(e => e.employee_name && typeof e.gross_pay === 'number' && e.gross_pay > 0)
      .map(e => {
        const calc = calculatePayroll({
          employee_name: e.employee_name,
          employee_id: e.employee_id || undefined,
          gross_pay: e.gross_pay as number,
          other_deductions: typeof e.other_deductions === 'number' ? e.other_deductions : 0,
        }, 'biweekly');

        return {
          employee_name: e.employee_name,
          gross_pay: calc.gross_pay,
          cpp: calc.cpp_employee,
          ei: calc.ei_employee,
          tax: calc.income_tax,
          deductions: calc.other_deductions,
          net_pay: calc.net_pay,
        };
      });
  }

  $: totalGross = employeePreviews.reduce((sum, e) => sum + e.gross_pay, 0);
  $: totalNet = employeePreviews.reduce((sum, e) => sum + e.net_pay, 0);
  $: totalDeductions = totalGross - totalNet;

  onMount(async () => {
    await loadData();
  });

  async function loadData() {
    loading = true;
    try {
      const db = await getDatabase();

      // Load payroll runs
      payrollRuns = await db.select<PayrollRun[]>(
        'SELECT * FROM payroll_run ORDER BY period_end DESC, id DESC'
      );

      // Load accounts
      accounts = await db.select<Account[]>(
        'SELECT * FROM account WHERE is_active = 1 ORDER BY code'
      );

      // Generate next run number
      if (payrollRuns.length === 0) {
        formRunNumber = 'PAY-0001';
      } else {
        const lastNum = Math.max(...payrollRuns.map(run => {
          const match = run.run_number.match(/\d+$/);
          return match ? parseInt(match[0]) : 0;
        }));
        formRunNumber = `PAY-${String(lastNum + 1).padStart(4, '0')}`;
      }

      // Set default dates (current pay period - biweekly)
      const today = new Date();
      const dayOfWeek = today.getDay();
      const daysToLastSunday = dayOfWeek;
      const periodEnd = new Date(today);
      periodEnd.setDate(today.getDate() - daysToLastSunday - 1); // Last Saturday
      
      const periodStart = new Date(periodEnd);
      periodStart.setDate(periodEnd.getDate() - 13); // 14 days ago

      const payDate = new Date(periodEnd);
      payDate.setDate(periodEnd.getDate() + 5); // Pay on Thursday after period end

      formPeriodStart = periodStart.toISOString().split('T')[0];
      formPeriodEnd = periodEnd.toISOString().split('T')[0];
      formPayDate = payDate.toISOString().split('T')[0];

      // Try to find typical payroll accounts
      const cashAccounts = accounts.filter(a => a.code === '1000' || a.name.toLowerCase().includes('cash'));
      if (cashAccounts.length > 0) cashAccountId = cashAccounts[0].id!;

      const salaryAccounts = accounts.filter(a => a.type === 'expense' && a.name.toLowerCase().includes('salary'));
      if (salaryAccounts.length > 0) salaryExpenseAccountId = salaryAccounts[0].id!;

      const liabilityAccounts = accounts.filter(a => a.type === 'liability');
      const cppAccounts = liabilityAccounts.filter(a => a.name.toLowerCase().includes('cpp'));
      if (cppAccounts.length > 0) cppPayableAccountId = cppAccounts[0].id!;

      const eiAccounts = liabilityAccounts.filter(a => a.name.toLowerCase().includes('ei'));
      if (eiAccounts.length > 0) eiPayableAccountId = eiAccounts[0].id!;

      const taxAccounts = liabilityAccounts.filter(a => a.name.toLowerCase().includes('tax'));
      if (taxAccounts.length > 0) taxPayableAccountId = taxAccounts[0].id!;

    } catch (e) {
      console.error('Failed to load data:', e);
      alert(`Error loading data: ${e instanceof Error ? e.message : String(e)}`);
    }
    loading = false;
  }

  function addEmployee() {
    formEmployees = [...formEmployees, { employee_name: '', employee_id: '', gross_pay: '', other_deductions: '' }];
  }

  function removeEmployee(index: number) {
    if (formEmployees.length > 1) {
      formEmployees = formEmployees.filter((_, i) => i !== index);
    }
  }

  async function handleCreatePayrollRun() {
    try {
      // Validation
      if (formEmployees.length === 0 || !formEmployees.some(e => e.employee_name)) {
        alert('Please add at least one employee');
        return;
      }

      const employees: EmployeePayInput[] = formEmployees
        .filter(e => e.employee_name && typeof e.gross_pay === 'number' && e.gross_pay > 0)
        .map(e => ({
          employee_name: e.employee_name,
          employee_id: e.employee_id || undefined,
          gross_pay: e.gross_pay as number,
          other_deductions: typeof e.other_deductions === 'number' ? e.other_deductions : 0,
        }));

      if (employees.length === 0) {
        alert('Please enter valid employee data (name and gross pay)');
        return;
      }

      const result = await createPayrollRun(
        {
          run_number: formRunNumber,
          period_start: formPeriodStart,
          period_end: formPeriodEnd,
          pay_date: formPayDate,
        },
        employees,
        { mode }
      );

      alert(`Payroll run created successfully! ID: ${result.payroll_run_id}\n\nStatus: Draft\nYou can now review and approve it.`);

      // Reset form
      formEmployees = [{ employee_name: '', employee_id: '', gross_pay: '', other_deductions: '' }];
      view = 'list';
      await loadData();

    } catch (e) {
      console.error('Failed to create payroll run:', e);
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function viewRunDetail(run: PayrollRun) {
    selectedRun = run;
    showDetailModal = true;

    // Load lines for this run
    try {
      const db = await getDatabase();
      runLines = await db.select<PayrollLine[]>(
        'SELECT * FROM payroll_line WHERE payroll_run_id = ? ORDER BY employee_name',
        [run.id]
      );
    } catch (e) {
      console.error('Failed to load payroll lines:', e);
    }
  }

  function closeDetailModal() {
    showDetailModal = false;
    selectedRun = null;
    runLines = [];
  }

  async function handleApproveRun(run: PayrollRun) {
    if (run.status !== 'draft') {
      alert('Only draft payroll runs can be approved');
      return;
    }

    // Validate accounts
    if (typeof cashAccountId !== 'number' || typeof salaryExpenseAccountId !== 'number' ||
        typeof cppPayableAccountId !== 'number' || typeof eiPayableAccountId !== 'number' ||
        typeof taxPayableAccountId !== 'number') {
      alert('Please select all required accounts before approving');
      return;
    }

    const confirmed = confirm(
      `Approve payroll run ${run.run_number}?\n\n` +
      `This will:\n` +
      `- Create a journal entry\n` +
      `- Debit Salary Expense: ${formatCurrency(run.total_gross)}\n` +
      `- Credit Cash (Net Pay): ${formatCurrency(run.total_net)}\n` +
      `- Credit Payroll Liabilities: ${formatCurrency(run.total_deductions)}\n\n` +
      `Continue?`
    );

    if (!confirmed) return;

    try {
      const result = await approvePayrollRun(
        run.id!,
        cashAccountId,
        salaryExpenseAccountId,
        cppPayableAccountId,
        eiPayableAccountId,
        taxPayableAccountId,
        { mode }
      );

      if (result.ok) {
        alert(`Payroll run approved! Journal Entry #${result.journal_entry_id}`);
        closeDetailModal();
        await loadData();
      }
    } catch (e) {
      console.error('Failed to approve payroll run:', e);
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleVoidRun(run: PayrollRun) {
    if (run.status === 'void') {
      alert('Payroll run is already voided');
      return;
    }

    const confirmed = confirm(
      `Void payroll run ${run.run_number}?\n\n` +
      `This action will mark the run as void.` +
      (run.status === 'approved' ? '\nA reversal journal entry will be created.' : '') +
      `\n\nContinue?`
    );

    if (!confirmed) return;

    try {
      const result = await voidPayrollRun(run.id!, { mode });

      if (result.ok) {
        alert('Payroll run voided successfully');
        closeDetailModal();
        await loadData();
      }
    } catch (e) {
      console.error('Failed to void payroll run:', e);
      alert(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD'
    }).format(amount);
  }

  function getStatusClass(status: string): string {
    switch (status) {
      case 'draft': return 'status-draft';
      case 'approved': return 'status-approved';
      case 'paid': return 'status-paid';
      case 'void': return 'status-void';
      default: return '';
    }
  }

  function getAccountName(accountId: number | null | undefined): string {
    if (!accountId) return 'N/A';
    const account = accounts.find(a => a.id === accountId);
    return account ? `${account.code} - ${account.name}` : `Account #${accountId}`;
  }
</script>

<div class="payroll-view">
  {#if loading}
    <p>Loading payroll...</p>
  {:else}
    <!-- Navigation buttons -->
    <div class="toolbar">
      <Button on:click={() => view = 'list'} variant={view === 'list' ? 'primary' : 'secondary'}>
        Payroll Runs
      </Button>
      <Button on:click={() => view = 'create'} variant={view === 'create' ? 'primary' : 'secondary'}>
        + New Payroll Run
      </Button>
    </div>

    {#if view === 'list'}
      <Card title="Payroll Runs">
        <Table>
          <thead>
            <tr>
              <th>Run Number</th>
              <th>Period</th>
              <th>Pay Date</th>
              <th>Status</th>
              <th>Gross Pay</th>
              <th>Deductions</th>
              <th>Net Pay</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {#each payrollRuns as run (run.id)}
              <tr on:click={() => viewRunDetail(run)} class="clickable">
                <td>{run.run_number}</td>
                <td>{run.period_start} to {run.period_end}</td>
                <td>{run.pay_date}</td>
                <td>
                  <span class="status-badge {getStatusClass(run.status)}">
                    {run.status.toUpperCase()}
                  </span>
                </td>
                <td class="amount">{formatCurrency(run.total_gross)}</td>
                <td class="amount">{formatCurrency(run.total_deductions)}</td>
                <td class="amount">{formatCurrency(run.total_net)}</td>
                <td>
                  <Button size="sm" on:click={(e) => { e.stopPropagation(); viewRunDetail(run); }}>
                    View
                  </Button>
                </td>
              </tr>
            {/each}
          </tbody>
        </Table>

        {#if payrollRuns.length === 0}
          <p class="empty-state">No payroll runs found. Create your first payroll run above.</p>
        {/if}
      </Card>
    {/if}

    {#if view === 'create'}
      <Card title="Create Payroll Run">
        <form on:submit|preventDefault={handleCreatePayrollRun}>
          <div class="form-row">
            <Input label="Run Number" bind:value={formRunNumber} required />
            <Input label="Pay Date" type="date" bind:value={formPayDate} required />
          </div>

          <div class="form-row">
            <Input label="Period Start" type="date" bind:value={formPeriodStart} required />
            <Input label="Period End" type="date" bind:value={formPeriodEnd} required />
          </div>

          <h3>Employees</h3>
          {#each formEmployees as employee, index (index)}
            <div class="employee-row">
              <div class="employee-fields">
                <Input 
                  label="Employee Name" 
                  bind:value={employee.employee_name} 
                  required 
                  placeholder="John Doe"
                />
                <Input 
                  label="Employee ID (optional)" 
                  bind:value={employee.employee_id} 
                  placeholder="EMP-001"
                />
                <Input 
                  label="Gross Pay" 
                  type="number" 
                  step="0.01" 
                  bind:value={employee.gross_pay} 
                  required 
                  placeholder="2500.00"
                />
                <Input 
                  label="Other Deductions" 
                  type="number" 
                  step="0.01" 
                  bind:value={employee.other_deductions} 
                  placeholder="0.00"
                />
                <div class="button-container">
                  <Button 
                    type="button" 
                    variant="secondary" 
                    on:click={() => removeEmployee(index)}
                    disabled={formEmployees.length === 1}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            </div>
          {/each}

          <Button type="button" variant="secondary" on:click={addEmployee}>
            + Add Employee
          </Button>

          {#if employeePreviews.length > 0}
            <div class="preview-section">
              <h3>Payroll Preview</h3>
              <table class="preview-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Gross Pay</th>
                    <th>CPP</th>
                    <th>EI</th>
                    <th>Income Tax</th>
                    <th>Other</th>
                    <th>Net Pay</th>
                  </tr>
                </thead>
                <tbody>
                  {#each employeePreviews as preview}
                    <tr>
                      <td>{preview.employee_name}</td>
                      <td class="amount">{formatCurrency(preview.gross_pay)}</td>
                      <td class="amount">{formatCurrency(preview.cpp)}</td>
                      <td class="amount">{formatCurrency(preview.ei)}</td>
                      <td class="amount">{formatCurrency(preview.tax)}</td>
                      <td class="amount">{formatCurrency(preview.deductions)}</td>
                      <td class="amount"><strong>{formatCurrency(preview.net_pay)}</strong></td>
                    </tr>
                  {/each}
                  <tr class="total-row">
                    <td><strong>Totals</strong></td>
                    <td class="amount"><strong>{formatCurrency(totalGross)}</strong></td>
                    <td colspan="4" class="amount"><strong>Deductions: {formatCurrency(totalDeductions)}</strong></td>
                    <td class="amount"><strong>{formatCurrency(totalNet)}</strong></td>
                  </tr>
                </tbody>
              </table>
              <p class="info-text">
                <strong>Note:</strong> CPP, EI, and income tax are calculated using 2026 Canadian rates. 
                This is a simplified calculation for demonstration purposes.
              </p>
            </div>
          {/if}

          <div class="button-group">
            <Button type="submit">Create Payroll Run (Draft)</Button>
            <Button type="button" variant="secondary" on:click={() => view = 'list'}>Cancel</Button>
          </div>
        </form>
      </Card>
    {/if}
  {/if}
</div>

<!-- Payroll Run Detail Modal -->
{#if showDetailModal && selectedRun}
  <div class="modal-overlay" on:click={closeDetailModal} on:keydown={(e) => e.key === 'Escape' && closeDetailModal()} role="button" tabindex="-1">
    <div class="modal-content" on:click={(e) => e.stopPropagation()} on:keydown={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
      <Card title={`Payroll Run: ${selectedRun.run_number}`}>
        <div class="detail-section">
          <p><strong>Period:</strong> {selectedRun.period_start} to {selectedRun.period_end}</p>
          <p><strong>Pay Date:</strong> {selectedRun.pay_date}</p>
          <p>
            <strong>Status:</strong> 
            <span class="status-badge {getStatusClass(selectedRun.status)}">
              {selectedRun.status.toUpperCase()}
            </span>
          </p>
          <p><strong>Total Gross:</strong> {formatCurrency(selectedRun.total_gross)}</p>
          <p><strong>Total Deductions:</strong> {formatCurrency(selectedRun.total_deductions)}</p>
          <p><strong>Total Net:</strong> {formatCurrency(selectedRun.total_net)}</p>
        </div>

        {#if selectedRun.status === 'draft'}
          <div class="approval-section">
            <h3>Approval Settings</h3>
            <p class="info-text">Select accounts for posting the payroll journal entry:</p>
            
            <div class="form-row">
              <Select label="Cash Account" bind:value={cashAccountId} required>
                <option value="">-- Select Account --</option>
                {#each accounts.filter(a => a.type === 'asset') as account}
                  <option value={account.id}>{account.code} - {account.name}</option>
                {/each}
              </Select>
              
              <Select label="Salary Expense Account" bind:value={salaryExpenseAccountId} required>
                <option value="">-- Select Account --</option>
                {#each accounts.filter(a => a.type === 'expense') as account}
                  <option value={account.id}>{account.code} - {account.name}</option>
                {/each}
              </Select>
            </div>

            <div class="form-row">
              <Select label="CPP Payable Account" bind:value={cppPayableAccountId} required>
                <option value="">-- Select Account --</option>
                {#each accounts.filter(a => a.type === 'liability') as account}
                  <option value={account.id}>{account.code} - {account.name}</option>
                {/each}
              </Select>
              
              <Select label="EI Payable Account" bind:value={eiPayableAccountId} required>
                <option value="">-- Select Account --</option>
                {#each accounts.filter(a => a.type === 'liability') as account}
                  <option value={account.id}>{account.code} - {account.name}</option>
                {/each}
              </Select>
            </div>

            <Select label="Income Tax Payable Account" bind:value={taxPayableAccountId} required>
              <option value="">-- Select Account --</option>
              {#each accounts.filter(a => a.type === 'liability') as account}
                <option value={account.id}>{account.code} - {account.name}</option>
              {/each}
            </Select>
          </div>
        {/if}

        <h3>Employee Details</h3>
        <Table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Employee ID</th>
              <th>Gross Pay</th>
              <th>CPP</th>
              <th>EI</th>
              <th>Tax</th>
              <th>Other</th>
              <th>Net Pay</th>
            </tr>
          </thead>
          <tbody>
            {#each runLines as line}
              <tr>
                <td>{line.employee_name}</td>
                <td>{line.employee_id || '-'}</td>
                <td class="amount">{formatCurrency(line.gross_pay)}</td>
                <td class="amount">{formatCurrency(line.cpp_amount)}</td>
                <td class="amount">{formatCurrency(line.ei_amount)}</td>
                <td class="amount">{formatCurrency(line.income_tax)}</td>
                <td class="amount">{formatCurrency(line.other_deductions)}</td>
                <td class="amount"><strong>{formatCurrency(line.net_pay)}</strong></td>
              </tr>
            {/each}
          </tbody>
        </Table>

        <div class="button-group">
          {#if selectedRun.status === 'draft'}
            <Button on:click={() => selectedRun && handleApproveRun(selectedRun)}>Approve & Post</Button>
          {/if}
          {#if selectedRun.status !== 'void' && selectedRun.status !== 'paid'}
            <Button variant="secondary" on:click={() => selectedRun && handleVoidRun(selectedRun)}>Void</Button>
          {/if}
          <Button variant="secondary" on:click={closeDetailModal}>Close</Button>
        </div>
      </Card>
    </div>
  </div>
{/if}

<style>
  .payroll-view {
    padding: 1rem;
  }

  .toolbar {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .employee-row {
    border: 1px solid #ddd;
    padding: 1rem;
    margin-bottom: 1rem;
    border-radius: 4px;
    background: #f9f9f9;
  }

  .employee-fields {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr auto;
    gap: 0.5rem;
    align-items: end;
  }

  .button-container {
    padding-bottom: 0.5rem;
  }

  .button-group {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .preview-section {
    margin: 2rem 0;
    padding: 1rem;
    background: #f0f8ff;
    border-radius: 4px;
  }

  .preview-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
  }

  .preview-table th,
  .preview-table td {
    padding: 0.5rem;
    border: 1px solid #ddd;
    text-align: left;
  }

  .preview-table th {
    background: #2c3e50;
    color: white;
    font-weight: 600;
  }

  .preview-table .total-row {
    background: #e8f4f8;
    font-weight: 600;
  }

  .info-text {
    padding: 0.75rem;
    background: #fff9e6;
    border-left: 4px solid #ffc107;
    margin: 1rem 0;
    font-size: 0.9rem;
  }

  .amount {
    text-align: right;
    font-family: 'Courier New', monospace;
  }

  .empty-state {
    text-align: center;
    padding: 2rem;
    color: #666;
  }

  .clickable {
    cursor: pointer;
  }

  .clickable:hover {
    background-color: #f5f5f5;
  }

  .status-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .status-draft {
    background: #fff3cd;
    color: #856404;
  }

  .status-approved {
    background: #d1ecf1;
    color: #0c5460;
  }

  .status-paid {
    background: #d4edda;
    color: #155724;
  }

  .status-void {
    background: #f8d7da;
    color: #721c24;
  }

  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal-content {
    max-width: 1000px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .detail-section {
    margin-bottom: 1.5rem;
  }

  .detail-section p {
    margin: 0.5rem 0;
  }

  .approval-section {
    margin: 1.5rem 0;
    padding: 1rem;
    background: #f0f8ff;
    border-radius: 4px;
  }

  h3 {
    margin-top: 1.5rem;
    margin-bottom: 1rem;
    font-size: 1.2rem;
  }
</style>
