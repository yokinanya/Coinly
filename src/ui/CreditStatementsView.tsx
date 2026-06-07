import { CalendarDays } from "lucide-react";
import { useMemo, useState } from "react";
import { createCombinedStatementForAccounts, createStatementForAccount } from "../domain/operations";
import { accountCurrencyOptions } from "../domain/recurring";
import { combinedStatementStats, deleteStatement, isCombinedStatement, revokeStatementSettlement, settleStatement, statementAccountBillingTotals, statementAccountCurrencyTotals, statementAccountCurrencyTransactionTotals, statementAccountIds, statementAdjustments, statementBillingAmounts, statementBillingTotals, statementDetails, statementMonthOptions, statementSettlementTransactionIds, updateStatementAdjustments, updateStatementBillingAmounts } from "../domain/statements";
import type { CombinedStatementStats, StatementAccountCurrencyTotal, StatementAdjustmentInput, StatementBillingAmountInput, StatementMonthOption } from "../domain/statements";
import type { AppData, CreditCardStatement, CreditCardStatementAdjustment, CreditCardStatementBillingAmount, CurrencyCode, Transaction } from "../domain/types";
import { ConfirmDialog, EmptyState, MessageBanner, MultiSelectField, SelectField, TextField } from "./common";
import type { StatusMessage } from "./common";
import { money } from "./format";
import { Button, Drawer, Select } from "./components";
import { AnimatedRow } from "./managers/ManagerCommon";
import { useAutoDismissStatus } from "./useAutoDismissMessage";

const DETAIL_DRAWER_WIDTH = 520;
const SETTLEMENT_DRAWER_WIDTH = 440;
const BILLING_DRAWER_WIDTH = 560;
const ADJUSTMENT_DRAWER_WIDTH = 560;
const CREDIT_STATEMENTS_DRAWER_WIDTH = 760;
const COMBINED_STATEMENT_DRAWER_WIDTH = 460;
const COMBINED_GENERATE_TARGET = "__combined_statement__";
const BANK_BILLING_CURRENCY = "CNY";

let adjustmentRowCounter = 0;

export function CreditStatementsView(props: {
  readonly data: AppData;
  readonly setData: (data: AppData) => void;
  readonly onBack: () => void;
  readonly onNavigate?: (id: "accounts") => void;
}) {
  const creditAccounts = props.data.accounts.filter((account) => account.kind === "credit");
  const statementMonths = useMemo(() => statementMonthOptions(props.data.statements), [props.data.statements]);
  const [selectedMonth, setSelectedMonth] = useState(() => statementMonths[0]?.key ?? "");
  const [generateTarget, setGenerateTarget] = useState("");
  const [status, setStatus] = useState<StatusMessage>();
  const [creatingAccountId, setCreatingAccountId] = useState<string>();
  const [combinedOpen, setCombinedOpen] = useState(false);
  const [combinedAccountIds, setCombinedAccountIds] = useState<readonly string[]>([]);
  const generateOptions = useMemo(() => statementGenerateOptions(creditAccounts), [creditAccounts]);
  const effectiveGenerateTarget = generateOptions.some((option) => option.value === generateTarget) ? generateTarget : generateOptions[0]?.value ?? "";
  const effectiveMonth = statementMonths.some((option) => option.key === selectedMonth) ? selectedMonth : statementMonths[0]?.key ?? "";
  const stats = useMemo(() => effectiveMonth ? combinedStatementStats(props.data, effectiveMonth) : undefined, [props.data, effectiveMonth]);
  useAutoDismissStatus(status, () => setStatus(undefined));
  const createStatement = (accountId: string) => {
    if (creatingAccountId) return;
    const account = creditAccounts.find((item) => item.id === accountId);
    if (!account) return;
    setCreatingAccountId(accountId);
    try {
      props.setData(createStatementForAccount(props.data, account));
      setStatus({ tone: "success", text: "账期已生成" });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "账期生成失败" });
    } finally {
      setCreatingAccountId(undefined);
    }
  };
  const openCombinedStatement = () => {
    setCombinedAccountIds(defaultCombinedAccountIds(creditAccounts));
    setCombinedOpen(true);
  };
  const generateSelectedStatement = () => {
    if (!effectiveGenerateTarget) return;
    if (effectiveGenerateTarget === COMBINED_GENERATE_TARGET) {
      openCombinedStatement();
      return;
    }
    createStatement(effectiveGenerateTarget);
  };
  const createCombinedStatement = () => {
    try {
      const accounts = creditAccounts.filter((account) => combinedAccountIds.includes(account.id));
      props.setData(createCombinedStatementForAccounts(props.data, accounts));
      setStatus({ tone: "success", text: "合并账单已生成" });
      setCombinedOpen(false);
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "合并账单生成失败" });
    }
  };
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-(--color-text)">信用卡账期</h1>
          <p className="mt-1 text-sm text-(--color-text-secondary)">生成、查看并结算信用卡账期。</p>
        </div>
        <Button onClick={props.onBack}>返回明细</Button>
      </div>
      <StatementStatusMessage status={status} />
      <StatementActions
        creatingAccountId={creatingAccountId}
        options={generateOptions}
        target={effectiveGenerateTarget}
        onGenerate={generateSelectedStatement}
        onTargetChange={setGenerateTarget}
      />
      <StatementCombinedStats monthOptions={statementMonths} selectedMonth={effectiveMonth} stats={stats} onMonthChange={setSelectedMonth} />
      <StatementGrid data={props.data} setData={props.setData} setStatus={setStatus} />
      <CombinedStatementDrawer
        open={combinedOpen}
        creditAccounts={creditAccounts}
        selectedAccountIds={combinedAccountIds}
        onChange={setCombinedAccountIds}
        onClose={() => setCombinedOpen(false)}
        onSave={createCombinedStatement}
      />
      {creditAccounts.length === 0 && <EmptyState action={props.onNavigate ? { label: "去账户", onClick: () => props.onNavigate?.("accounts") } : undefined}>暂无信用卡账户。</EmptyState>}
    </section>
  );
}

function CombinedStatementDrawer(props: {
  readonly open: boolean;
  readonly creditAccounts: readonly AppData["accounts"][number][];
  readonly selectedAccountIds: readonly string[];
  readonly onChange: (ids: readonly string[]) => void;
  readonly onClose: () => void;
  readonly onSave: () => void;
}) {
  const footer = <StatementDrawerFooter onCancel={props.onClose} onSave={props.onSave} />;
  return (
    <Drawer open={props.open} title="合并生成账单" width={COMBINED_STATEMENT_DRAWER_WIDTH} footer={footer} onClose={props.onClose}>
      <div className="space-y-4">
        <MultiSelectField
          label="信用卡"
          values={props.selectedAccountIds}
          options={combinedAccountOptions(props.creditAccounts)}
          description="只会生成一张合并账单；所选信用卡需要配置且使用相同账单日。"
          onChange={props.onChange}
        />
        <div className="row-card p-3 text-sm text-(--color-text-secondary)">
          结算合并账单时，会按每张卡、每个原始消费币种自动拆分为多笔还款交易。
        </div>
      </div>
    </Drawer>
  );
}

function StatementDrawerFooter(props: { readonly saveLabel?: string; readonly onCancel: () => void; readonly onSave: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button onClick={props.onCancel}>取消</Button>
      <Button variant="primary" onClick={props.onSave}>{props.saveLabel ?? "生成账单"}</Button>
    </div>
  );
}

export function CreditStatementsDrawer(props: {
  readonly open: boolean;
  readonly data: AppData;
  readonly setData: (data: AppData) => void;
  readonly onClose: () => void;
}) {
  return (
    <Drawer open={props.open} title="信用卡账期" width={CREDIT_STATEMENTS_DRAWER_WIDTH} onClose={props.onClose}>
      <CreditStatementsView data={props.data} setData={props.setData} onBack={props.onClose} />
    </Drawer>
  );
}

function StatementCombinedStats(props: {
  readonly monthOptions: readonly StatementMonthOption[];
  readonly selectedMonth: string;
  readonly stats?: CombinedStatementStats;
  readonly onMonthChange: (month: string) => void;
}) {
  if (!props.stats || props.monthOptions.length === 0) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="panel p-4">
        <div className="space-y-3">
          <h2 className="font-semibold text-(--color-text)">账期概览</h2>
          <StatementMonthSelect value={props.selectedMonth} options={monthSelectOptions(props.monthOptions)} onChange={props.onMonthChange} />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <StatsMetric label="账期" value={`${props.stats.statementCount} 个`} />
          <StatsMetric label="已结算" value={`${props.stats.paidCount} 个`} />
          <StatsMetric label="待结算" value={`${props.stats.unpaidCount} 个`} />
          <StatsMetric label="消费明细" value={`${props.stats.transactionCount} 条`} />
          <StatsMetric label="银行账单" value={`${props.stats.billingAmountCount} 项`} />
          {props.stats.adjustmentCount > 0 && <StatsMetric label="历史补差" value={`${props.stats.adjustmentCount} 项`} />}
        </div>
      </div>
      <div className="panel p-4">
        <h2 className="font-semibold text-(--color-text)">金额汇总</h2>
        <div className="mt-3 space-y-4">
          {props.stats.billingTotals.length > 0 && <TotalSection title="银行应还" rows={props.stats.billingTotals} />}
          <TotalSection title={props.stats.billingTotals.length > 0 ? "原币种明细" : "消费汇总"} rows={props.stats.totals} emptyText="该月份暂无消费明细。" />
        </div>
      </div>
    </div>
  );
}

function StatementMonthSelect(props: {
  readonly value: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly onChange: (month: string) => void;
}) {
  return (
    <div className="flex w-full items-center justify-between gap-2 rounded-md border border-(--color-border) bg-(--color-surface-muted) px-2 py-1.5 sm:w-auto sm:min-w-48">
      <span className="flex items-center gap-1.5 text-sm font-medium text-(--color-text-secondary)">
        <CalendarDays size={15} aria-hidden="true" />
        月份
      </span>
      <Select
        aria-label="账期月份"
        className="min-h-8 w-32 border-transparent bg-transparent px-2 py-1 shadow-none hover:border-(--color-border) sm:w-28"
        value={props.value}
        options={[...props.options]}
        onChange={(value) => props.onChange(String(value))}
      />
    </div>
  );
}

function StatsMetric(props: { readonly label: string; readonly value: string }) {
  return (
    <div className="row-card flex items-center justify-between gap-3 p-3 text-sm">
      <span className="text-(--color-text-secondary)">{props.label}</span>
      <span className="font-medium text-(--color-text)">{props.value}</span>
    </div>
  );
}

function monthSelectOptions(options: readonly StatementMonthOption[]) {
  return options.map((option) => ({ value: option.key, label: option.label }));
}

function StatementStatusMessage({ status }: { readonly status?: StatusMessage }) {
  if (!status?.text) return null;
  return <AnimatedRow><MessageBanner message={status.text} tone={status.tone} /></AnimatedRow>;
}

function StatementActions(props: {
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly target: string;
  readonly creatingAccountId?: string;
  readonly onGenerate: () => void;
  readonly onTargetChange: (target: string) => void;
}) {
  if (props.options.length === 0) return null;
  return (
    <div className="panel flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="label shrink-0">账单对象</span>
        <Select aria-label="账单对象" className="min-w-0 flex-1 sm:max-w-md" value={props.target} options={props.options} onChange={(value) => props.onTargetChange(String(value))} />
      </div>
      <Button variant="primary" loading={Boolean(props.creatingAccountId)} disabled={!props.target || Boolean(props.creatingAccountId)} onClick={props.onGenerate}>生成账单</Button>
    </div>
  );
}

function StatementGrid(props: {
  readonly data: AppData;
  readonly setData: (data: AppData) => void;
  readonly setStatus: (status: StatusMessage) => void;
}) {
  const gridClass = props.data.statements.length > 1 ? "grid gap-4 lg:grid-cols-2" : "grid gap-4";
  return (
    <div className={gridClass}>
      {props.data.statements.map((statement) => (
        <AnimatedRow key={statement.id}>
          <StatementPanel data={props.data} statement={statement} setData={props.setData} setStatus={props.setStatus} />
        </AnimatedRow>
      ))}
    </div>
  );
}

function StatementPanel(props: {
  readonly data: AppData;
  readonly statement: CreditCardStatement;
  readonly setData: (data: AppData) => void;
  readonly setStatus: (status: StatusMessage) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [billingOpen, setBillingOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const accountName = statementAccountName(props.data.accounts, props.statement);
  const details = statementDetails(props.data.transactions, props.statement);
  const billingRows = statementBillingTotals(props.statement);
  return (
    <div className="panel p-4">
      <StatementSummary accountName={accountName} statement={props.statement} rows={details.totals} billingRows={billingRows} details={details.transactions} adjustments={details.adjustments} />
      <StatementButtons statement={props.statement} onAdjust={() => setAdjustmentOpen(true)} onBilling={() => setBillingOpen(true)} onDelete={() => setDeleteOpen(true)} onDetail={() => setDetailOpen(true)} onSettle={() => setSettlementOpen(true)} onRevoke={() => setConfirmOpen(true)} />
      <DetailDrawer data={props.data} open={detailOpen} statement={props.statement} transactions={details.transactions} adjustments={details.adjustments} onClose={() => setDetailOpen(false)} />
      <SettlementDrawer data={props.data} statement={props.statement} open={settlementOpen} setData={props.setData} setStatus={props.setStatus} onClose={() => setSettlementOpen(false)} />
      {billingOpen && <BillingAmountDrawer data={props.data} statement={props.statement} setData={props.setData} setStatus={props.setStatus} onClose={() => setBillingOpen(false)} />}
      {adjustmentOpen && <AdjustmentDrawer data={props.data} statement={props.statement} setData={props.setData} setStatus={props.setStatus} onClose={() => setAdjustmentOpen(false)} />}
      <ConfirmDialog open={confirmOpen} title="撤销结算" description="撤销后会移除该账期对应的还款记录。" onCancel={() => setConfirmOpen(false)} onConfirm={() => revoke(props, setConfirmOpen)} />
      <ConfirmDialog open={deleteOpen} title="删除账期" description="删除后会移除该账期记录；如果账期已结算，也会删除对应还款记录。" onCancel={() => setDeleteOpen(false)} onConfirm={() => removeStatement(props, setDeleteOpen)} />
    </div>
  );
}

function StatementSummary(props: {
  readonly accountName: string;
  readonly statement: CreditCardStatement;
  readonly rows: readonly { readonly currency: CurrencyCode; readonly amount: number }[];
  readonly billingRows: readonly { readonly currency: CurrencyCode; readonly amount: number }[];
  readonly details: readonly Transaction[];
  readonly adjustments: readonly CreditCardStatementAdjustment[];
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{props.accountName}</h2>
          {isCombinedStatement(props.statement) && <p className="mt-1 text-xs text-(--color-text-secondary)">合并账单</p>}
          <p className="mt-1 text-sm text-(--color-text-secondary)">{dateRange(props.statement.startAt, props.statement.endAt)}</p>
        </div>
        <span className={statusClass(props.statement.paid)}>{props.statement.paid ? "已结算" : "待结算"}</span>
      </div>
      <div className="mt-3 space-y-4">
        {props.billingRows.length > 0 && <TotalSection title="银行应还" rows={props.billingRows} />}
        <TotalSection title={props.billingRows.length > 0 ? "原币种明细" : "消费汇总"} rows={props.rows} />
      </div>
      <p className="row-card mt-3 p-3 text-xs text-(--color-text-secondary)">账期内消费明细：{props.details.length} 条{props.adjustments.length > 0 ? ` · 补差 ${props.adjustments.length} 项` : ""}</p>
      {props.statement.paid && <SettlementSummary statement={props.statement} />}
    </>
  );
}

function StatementButtons(props: {
  readonly statement: CreditCardStatement;
  readonly onAdjust: () => void;
  readonly onBilling: () => void;
  readonly onDelete: () => void;
  readonly onDetail: () => void;
  readonly onSettle: () => void;
  readonly onRevoke: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button onClick={props.onDetail}>查看明细</Button>
      <Button disabled={props.statement.paid} onClick={props.onBilling}>银行账单</Button>
      <Button disabled={props.statement.paid} onClick={props.onAdjust}>历史补差</Button>
      <Button disabled={props.statement.paid} variant="primary" onClick={props.onSettle}>{props.statement.paid ? "已结算" : "记录结算"}</Button>
      {props.statement.paid && <Button variant="danger" onClick={props.onRevoke}>撤销结算</Button>}
      <Button variant="danger" onClick={props.onDelete}>删除账期</Button>
    </div>
  );
}

function DetailDrawer(props: {
  readonly data: AppData;
  readonly open: boolean;
  readonly statement: CreditCardStatement;
  readonly transactions: readonly Transaction[];
  readonly adjustments: readonly CreditCardStatementAdjustment[];
  readonly onClose: () => void;
}) {
  const empty = props.transactions.length === 0 && props.adjustments.length === 0;
  return (
    <Drawer open={props.open} title="账期明细" width={DETAIL_DRAWER_WIDTH} onClose={props.onClose}>
      <p className="mb-3 text-sm text-(--color-text-secondary)">{dateRange(props.statement.startAt, props.statement.endAt)}</p>
      <div className="space-y-2">
        {props.transactions.map((transaction) => <TransactionRow key={transaction.id} accountName={isCombinedStatement(props.statement) ? accountName(props.data.accounts, transaction.accountId) : undefined} transaction={transaction} />)}
        {props.adjustments.map((adjustment) => <StatementAdjustmentRow key={adjustment.id} accountName={isCombinedStatement(props.statement) ? accountName(props.data.accounts, adjustment.accountId) : undefined} adjustment={adjustment} />)}
      </div>
      {empty && <EmptyState>该账期暂无消费明细。</EmptyState>}
    </Drawer>
  );
}

function BillingAmountDrawer(props: {
  readonly data: AppData;
  readonly statement: CreditCardStatement;
  readonly setData: (data: AppData) => void;
  readonly setStatus: (status: StatusMessage) => void;
  readonly onClose: () => void;
}) {
  const originalRows = statementAccountCurrencyTotals(props.data, props.statement);
  const [rows, setRows] = useState(() => initialBillingRows(props.statement));
  const [error, setError] = useState("");
  const save = () => {
    try {
      props.setData(updateStatementBillingAmounts(props.data, props.statement.id, billingInputsFromRows(rows)));
      props.setStatus({ tone: "success", text: "银行账单已保存" });
      props.onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "银行账单保存失败");
    }
  };
  const footer = <StatementDrawerFooter saveLabel="保存出账金额" onCancel={props.onClose} onSave={save} />;
  return (
    <Drawer open title="银行账单" width={BILLING_DRAWER_WIDTH} footer={footer} onClose={props.onClose}>
      <div className="space-y-3">
        {error && <MessageBanner message={error} tone="error" />}
        <p className="text-sm text-(--color-text-secondary)">按银行账单录入每张卡的 CNY 出账金额；外币明细保留原币种，仅用于核对。</p>
        {rows.map((row) => (
          <BillingAmountEditorRow
            key={row.accountId}
            accountName={accountName(props.data.accounts, row.accountId)}
            originalRows={originalRows.filter((item) => item.accountId === row.accountId)}
            row={row}
            onChange={(amount) => setRows((current) => current.map((item) => item.accountId === row.accountId ? { ...item, amount } : item))}
          />
        ))}
      </div>
    </Drawer>
  );
}

function BillingAmountEditorRow(props: {
  readonly accountName: string;
  readonly originalRows: readonly StatementAccountCurrencyTotal[];
  readonly row: BillingEditorRowState;
  readonly onChange: (amount: string) => void;
}) {
  return (
    <div className="row-card space-y-3 p-3">
      <TextField label={`${props.accountName} 银行出账金额（CNY）`} type="number" inputMode="decimal" min={0} step="0.01" value={props.row.amount} onChange={props.onChange} />
      <OriginalCurrencyReference rows={props.originalRows} />
    </div>
  );
}

function OriginalCurrencyReference(props: { readonly rows: readonly StatementAccountCurrencyTotal[] }) {
  if (props.rows.length === 0) {
    return <p className="text-xs text-(--color-text-secondary)">原币种明细：暂无记录。</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-(--color-text-secondary)">原币种明细参考</p>
      {props.rows.map((row) => <TotalRow key={`${row.accountId}:${row.currency}`} currency={row.currency} amount={row.amount} />)}
    </div>
  );
}

function AdjustmentDrawer(props: {
  readonly data: AppData;
  readonly statement: CreditCardStatement;
  readonly setData: (data: AppData) => void;
  readonly setStatus: (status: StatusMessage) => void;
  readonly onClose: () => void;
}) {
  const recordedTotals = useMemo(() => accountCurrencyTotalMap(statementAccountCurrencyTransactionTotals(props.data, props.statement)), [props.data, props.statement]);
  const [rows, setRows] = useState(() => initialAdjustmentRows(props.data, props.statement));
  const [error, setError] = useState("");
  const accountOptions = statementAccountOptions(props.data.accounts, props.statement);
  const updateRow = (row: AdjustmentEditorRowState, patch: Partial<AdjustmentEditorRowState>) => {
    setRows((current) => current.map((item) => item.key === row.key ? normalizeAdjustmentRowCurrency({ ...item, ...patch }, props.data.accounts) : item));
  };
  const save = () => {
    try {
      const inputs = adjustmentInputsFromRows(rows, recordedTotals);
      props.setData(updateStatementAdjustments(props.data, props.statement.id, inputs));
      props.setStatus({ tone: "success", text: "账单补差已保存" });
      props.onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "账单补差保存失败");
    }
  };
  const footer = <StatementDrawerFooter saveLabel="保存补差" onCancel={props.onClose} onSave={save} />;
  return (
    <Drawer open title="账单补差" width={ADJUSTMENT_DRAWER_WIDTH} footer={footer} onClose={props.onClose}>
      <div className="space-y-3">
        {error && <MessageBanner message={error} tone="error" />}
        {rows.map((row) => (
          <AdjustmentEditorRow
            key={row.key}
            accountOptions={accountOptions}
            accounts={props.data.accounts}
            recordedTotals={recordedTotals}
            row={row}
            onChange={(patch) => updateRow(row, patch)}
            onRemove={() => setRows((current) => current.filter((item) => item.key !== row.key))}
          />
        ))}
        <Button onClick={() => {
          const accountId = statementAccountIds(props.statement)[0] ?? props.statement.accountId;
          setRows((current) => [...current, newAdjustmentEditorRowForAccount(props.data.accounts, accountId, props.statement.primaryCurrency)]);
        }}>添加补差币种</Button>
      </div>
    </Drawer>
  );
}

function AdjustmentEditorRow(props: {
  readonly accountOptions: readonly { readonly value: string; readonly label: string }[];
  readonly accounts: readonly AppData["accounts"][number][];
  readonly recordedTotals: ReadonlyMap<string, number>;
  readonly row: AdjustmentEditorRowState;
  readonly onChange: (patch: Partial<AdjustmentEditorRowState>) => void;
  readonly onRemove: () => void;
}) {
  const recordedAmount = props.recordedTotals.get(accountCurrencyKey(props.row.accountId, props.row.currency)) ?? 0;
  const statementAmount = Number(props.row.statementAmount || "0");
  const adjustmentAmount = Number.isFinite(statementAmount) ? Math.max(0, roundMoney(statementAmount - recordedAmount)) : 0;
  const currencyOptions = adjustmentCurrencyOptions(props.accounts, props.row.accountId);
  return (
    <div className="row-card space-y-3 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="信用卡" value={props.row.accountId} options={props.accountOptions} onChange={(accountId) => props.onChange({ accountId })} />
        <SelectField label="币种" value={props.row.currency} options={currencyOptions} onChange={(currency) => props.onChange({ currency })} />
        <TextField label="银行账单总额" type="number" inputMode="decimal" min={0} step="0.01" value={props.row.statementAmount} onChange={(statementAmount) => props.onChange({ statementAmount })} />
        <TextField label="备注" value={props.row.note} onChange={(note) => props.onChange({ note })} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-(--color-text-secondary)">
        <span>已记录净额：{money(recordedAmount, props.row.currency)} · 补差：{money(adjustmentAmount, props.row.currency)}</span>
        <Button variant="danger" onClick={props.onRemove}>删除</Button>
      </div>
    </div>
  );
}

function SettlementDrawer(props: {
  readonly data: AppData;
  readonly statement: CreditCardStatement;
  readonly open: boolean;
  readonly setData: (data: AppData) => void;
  readonly setStatus: (status: StatusMessage) => void;
  readonly onClose: () => void;
}) {
  const [amount, setAmount] = useState("0");
  const [currency, setCurrency] = useState<CurrencyCode>(props.statement.primaryCurrency);
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const combined = isCombinedStatement(props.statement);
  const billingRows = statementAccountBillingTotals(props.statement).filter((row) => row.amount > 0);
  const previewRows = combined ? settlementPreviewRows(props.data, props.statement, billingRows) : billingRows;
  const previewDescription = billingRows.length > 0 ? "将按银行账单金额生成还款交易：" : "将按以下金额拆分生成还款交易：";
  const save = () => {
    if (saving) return;
    setSaving(true);
    if (!settle(props, { amount, currency, sourceAccountId })) setSaving(false);
  };
  const footer = <SettlementFooter saving={saving} onCancel={props.onClose} onSave={save} />;
  return (
    <Drawer open={props.open} title="记录账期结算" width={SETTLEMENT_DRAWER_WIDTH} footer={footer} onClose={props.onClose}>
      <div className="space-y-4">
        <SelectField label="还款来源（可选）" value={sourceAccountId} options={sourceOptions(props.data, props.statement)} onChange={setSourceAccountId} />
        {combined
          ? <StatementSettlementPreview accounts={props.data.accounts} description={previewDescription} rows={previewRows} />
          : billingRows.length > 0
            ? <StatementSettlementPreview accounts={props.data.accounts} description={previewDescription} rows={previewRows} />
            : (
            <>
              <TextField label="主币种结算金额" type="number" inputMode="decimal" min={0} step="0.01" value={amount} onChange={setAmount} />
              <SelectField label="结算币种" value={currency} options={props.data.currencies.map((item) => ({ value: item, label: item }))} onChange={(value) => setCurrency(value as CurrencyCode)} />
            </>
          )}
      </div>
    </Drawer>
  );
}

function StatementSettlementPreview(props: {
  readonly accounts: readonly AppData["accounts"][number][];
  readonly description: string;
  readonly rows: readonly StatementAccountCurrencyTotal[];
}) {
  if (props.rows.length === 0) return <EmptyState>该账期暂无应还金额，暂不能结算。</EmptyState>;
  return (
    <div className="space-y-2">
      <p className="text-sm text-(--color-text-secondary)">{props.description}</p>
      {props.rows.map((row) => (
        <div key={`${row.accountId}:${row.currency}`} className="row-card flex justify-between gap-3 p-3 text-sm">
          <span className="truncate">{accountName(props.accounts, row.accountId)}</span>
          <span>{money(row.amount, row.currency)}</span>
        </div>
      ))}
    </div>
  );
}

function settlementPreviewRows(data: AppData, statement: CreditCardStatement, billingRows: readonly StatementAccountCurrencyTotal[]): readonly StatementAccountCurrencyTotal[] {
  return billingRows.length > 0 ? billingRows : statementAccountCurrencyTotals(data, statement).filter((row) => row.amount > 0);
}

function SettlementFooter(props: { readonly saving: boolean; readonly onCancel: () => void; readonly onSave: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button disabled={props.saving} onClick={props.onCancel}>取消</Button>
      <Button variant="primary" loading={props.saving} onClick={props.onSave}>保存</Button>
    </div>
  );
}

function SettlementSummary({ statement }: { readonly statement: CreditCardStatement }) {
  if (isCombinedStatement(statement)) {
    return <div className="row-card mt-3 p-3 text-sm">已结算：已拆分 {statementSettlementTransactionIds(statement).length} 笔还款</div>;
  }
  return (
    <div className="row-card mt-3 p-3 text-sm">
      已结算：{money(statement.settlementAmount ?? 0, statement.settlementCurrency ?? statement.primaryCurrency)}
      {statement.settledAt && <span className="ml-2 text-xs text-(--color-text-secondary)">{new Date(statement.settledAt).toLocaleDateString("zh-CN")}</span>}
    </div>
  );
}

function TransactionRow({ accountName, transaction }: { readonly accountName?: string; readonly transaction: Transaction }) {
  return (
    <div className="row-card flex justify-between gap-3 p-2 text-sm">
      <span className="truncate">{accountName ? `${accountName} · ` : ""}{transaction.note || "信用卡消费"}</span>
      <span>{money(statementTransactionDisplayAmount(transaction), transaction.currency)}</span>
    </div>
  );
}

function StatementAdjustmentRow({ accountName, adjustment }: { readonly accountName?: string; readonly adjustment: CreditCardStatementAdjustment }) {
  return (
    <div className="row-card flex justify-between gap-3 p-2 text-sm">
      <span className="truncate">{accountName ? `${accountName} · ` : ""}{adjustment.note || "历史消费补差"}</span>
      <span>{money(adjustment.amount, adjustment.currency)}</span>
    </div>
  );
}

function TotalSection(props: { readonly title: string; readonly rows: readonly { readonly currency: CurrencyCode; readonly amount: number }[]; readonly emptyText?: string }) {
  if (props.rows.length === 0) {
    return props.emptyText ? <EmptyState>{props.emptyText}</EmptyState> : null;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-(--color-text-secondary)">{props.title}</p>
      <div className="grid gap-2">{props.rows.map((row) => <TotalRow key={row.currency} currency={row.currency} amount={row.amount} />)}</div>
    </div>
  );
}

function TotalRow(props: { readonly currency: CurrencyCode; readonly amount: number }) {
  return <div className="row-card flex justify-between p-3 text-sm"><span>{props.currency}</span><span>{money(props.amount, props.currency)}</span></div>;
}

function settle(
  props: Parameters<typeof SettlementDrawer>[0],
  draft: { readonly amount: string; readonly currency: CurrencyCode; readonly sourceAccountId: string },
): boolean {
  try {
    props.setData(settleStatement(props.data, props.statement.id, draft.sourceAccountId, Number(draft.amount), draft.currency));
    props.setStatus({ tone: "success", text: "账期已结算" });
    props.onClose();
    return true;
  } catch (error) {
    props.setStatus({ tone: "error", text: error instanceof Error ? error.message : "结算失败" });
    return false;
  }
}

function revoke(props: Parameters<typeof StatementPanel>[0], setConfirmOpen: (open: boolean) => void) {
  try {
    props.setData(revokeStatementSettlement(props.data, props.statement.id));
    props.setStatus({ tone: "success", text: "已撤销结算" });
    setConfirmOpen(false);
  } catch (error) {
    props.setStatus({ tone: "error", text: error instanceof Error ? error.message : "撤销失败" });
  }
}

function removeStatement(props: Parameters<typeof StatementPanel>[0], setDeleteOpen: (open: boolean) => void) {
  try {
    props.setData(deleteStatement(props.data, props.statement.id));
    props.setStatus({ tone: "success", text: "账期已删除" });
    setDeleteOpen(false);
  } catch (error) {
    props.setStatus({ tone: "error", text: error instanceof Error ? error.message : "账期删除失败" });
  }
}

function statusClass(paid: boolean): string {
  const common = "rounded-md px-2 py-1 text-xs font-medium";
  return paid ? `${common} bg-(--color-success-soft) text-(--color-success)` : `${common} bg-(--color-warning-soft) text-(--color-warning)`;
}

function dateRange(start: string, end: string): string {
  return `${new Date(start).toLocaleDateString("zh-CN")} - ${new Date(end).toLocaleDateString("zh-CN")}`;
}

function sourceOptions(data: AppData, statement: CreditCardStatement) {
  const statementAccountIdSet = new Set(statementAccountIds(statement));
  return [
    { value: "", label: "未记录" },
    ...data.accounts.filter((item) => !statementAccountIdSet.has(item.id)).map((item) => ({ value: item.id, label: item.name })),
  ];
}

function statementGenerateOptions(accounts: readonly AppData["accounts"][number][]) {
  const monthLabel = statementGenerateMonthLabel();
  return [
    ...(accounts.length >= 2 ? [{ value: COMBINED_GENERATE_TARGET, label: "合并账单" }] : []),
    ...accounts.map((account) => ({ value: account.id, label: `${account.name} ${monthLabel}账单` })),
  ];
}

function statementGenerateMonthLabel(date = new Date()): string {
  return `${date.getMonth() + 1}月`;
}

function statementTransactionDisplayAmount(transaction: Transaction): number {
  return transaction.kind === "refund" ? -transaction.amount : transaction.amount;
}

interface BillingEditorRowState {
  readonly billingId?: string;
  readonly accountId: string;
  readonly amount: string;
  readonly note: string;
}

function initialBillingRows(statement: CreditCardStatement): readonly BillingEditorRowState[] {
  const billingAmounts = statementBillingAmounts(statement);
  return statementAccountIds(statement).map((accountId) => {
    const amount = billingAmounts.find((item) => item.accountId === accountId && item.currency === BANK_BILLING_CURRENCY);
    return newBillingEditorRow(accountId, amount);
  });
}

function newBillingEditorRow(accountId: string, amount?: CreditCardStatementBillingAmount): BillingEditorRowState {
  return {
    billingId: amount?.id,
    accountId,
    amount: amount ? numberInputValue(amount.amount) : "",
    note: amount?.note ?? "银行账单出账金额",
  };
}

function billingInputsFromRows(rows: readonly BillingEditorRowState[]): readonly StatementBillingAmountInput[] {
  return rows.flatMap((row) => {
    const amount = Number(row.amount || "0");
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error("银行出账金额不能小于 0");
    }
    if (amount === 0) {
      return [];
    }
    return [{
      id: row.billingId,
      accountId: row.accountId,
      amount,
      currency: BANK_BILLING_CURRENCY,
      note: row.note,
    }];
  });
}

interface AdjustmentEditorRowState {
  readonly key: string;
  readonly adjustmentId?: string;
  readonly accountId: string;
  readonly currency: CurrencyCode;
  readonly statementAmount: string;
  readonly note: string;
}

function initialAdjustmentRows(data: AppData, statement: CreditCardStatement): readonly AdjustmentEditorRowState[] {
  const recordedTotals = accountCurrencyTotalMap(statementAccountCurrencyTransactionTotals(data, statement));
  const adjustmentTotals = new Map<string, { readonly id?: string; readonly amount: number; readonly note: string }>();
  for (const adjustment of statementAdjustments(statement)) {
    const key = accountCurrencyKey(adjustment.accountId, adjustment.currency);
    const current = adjustmentTotals.get(key);
    adjustmentTotals.set(key, {
      id: current?.id ?? adjustment.id,
      amount: (current?.amount ?? 0) + adjustment.amount,
      note: current?.note ?? adjustment.note,
    });
  }
  const keys = [...new Set([...recordedTotals.keys(), ...adjustmentTotals.keys()])];
  const rows = keys.map((key) => {
    const [accountId, currency] = splitAccountCurrencyKey(key);
    const adjustment = adjustmentTotals.get(key);
    return newAdjustmentEditorRow(accountId, currency, numberInputValue((recordedTotals.get(key) ?? 0) + (adjustment?.amount ?? 0)), adjustment?.id, adjustment?.note);
  });
  return rows.length > 0 ? rows : [newAdjustmentEditorRowForAccount(data.accounts, statementAccountIds(statement)[0] ?? statement.accountId, statement.primaryCurrency)];
}

function newAdjustmentEditorRowForAccount(
  accounts: readonly AppData["accounts"][number][],
  accountId: string,
  fallbackCurrency: CurrencyCode,
): AdjustmentEditorRowState {
  return newAdjustmentEditorRow(accountId, supportedAccountCurrencies(accounts, accountId)[0] ?? fallbackCurrency);
}

function newAdjustmentEditorRow(
  accountId: string,
  currency: CurrencyCode,
  statementAmount = "",
  adjustmentId?: string,
  note = "历史消费补差",
): AdjustmentEditorRowState {
  adjustmentRowCounter += 1;
  return { key: `adjustment-row-${adjustmentRowCounter}`, adjustmentId, accountId, currency, statementAmount, note };
}

function normalizeAdjustmentRowCurrency(row: AdjustmentEditorRowState, accounts: readonly AppData["accounts"][number][]): AdjustmentEditorRowState {
  const currencies = supportedAccountCurrencies(accounts, row.accountId);
  return currencies.includes(row.currency) ? row : { ...row, currency: currencies[0] ?? row.currency };
}

function adjustmentCurrencyOptions(accounts: readonly AppData["accounts"][number][], accountId: string) {
  return supportedAccountCurrencies(accounts, accountId).map((currency) => ({ value: currency, label: currency }));
}

function supportedAccountCurrencies(accounts: readonly AppData["accounts"][number][], accountId: string): readonly CurrencyCode[] {
  const account = accounts.find((item) => item.id === accountId);
  return account ? accountCurrencyOptions(account) : [];
}

function adjustmentInputsFromRows(rows: readonly AdjustmentEditorRowState[], recordedTotals: ReadonlyMap<string, number>): readonly StatementAdjustmentInput[] {
  const inputs: StatementAdjustmentInput[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (!row.accountId || !row.currency) {
      throw new Error("补差项需要选择信用卡和币种");
    }
    const statementAmount = Number(row.statementAmount || "0");
    if (!Number.isFinite(statementAmount) || statementAmount < 0) {
      throw new Error("银行账单总额不能小于 0");
    }
    const key = accountCurrencyKey(row.accountId, row.currency);
    const adjustmentAmount = roundMoney(statementAmount - (recordedTotals.get(key) ?? 0));
    if (adjustmentAmount < 0) {
      throw new Error("银行账单总额不能小于已记录消费");
    }
    if (adjustmentAmount === 0) {
      continue;
    }
    if (seen.has(key)) {
      throw new Error("同一信用卡和币种只能保留一项补差");
    }
    seen.add(key);
    inputs.push({
      id: row.adjustmentId,
      accountId: row.accountId,
      amount: adjustmentAmount,
      currency: row.currency,
      note: row.note,
    });
  }
  return inputs;
}

function accountCurrencyTotalMap(rows: readonly StatementAccountCurrencyTotal[]): ReadonlyMap<string, number> {
  return new Map(rows.map((row) => [accountCurrencyKey(row.accountId, row.currency), row.amount]));
}

function accountCurrencyKey(accountId: string, currency: CurrencyCode): string {
  return `${accountId}\u0000${currency}`;
}

function splitAccountCurrencyKey(key: string): readonly [string, CurrencyCode] {
  const [accountId, currency] = key.split("\u0000");
  return [accountId ?? "", currency ?? ""];
}

function statementAccountOptions(accounts: readonly AppData["accounts"][number][], statement: CreditCardStatement) {
  const accountIds = new Set(statementAccountIds(statement));
  return accounts.filter((account) => accountIds.has(account.id)).map((account) => ({ value: account.id, label: account.name }));
}

function numberInputValue(amount: number): string {
  const rounded = roundMoney(amount);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2);
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function combinedAccountOptions(accounts: readonly AppData["accounts"][number][]) {
  return accounts.map((account) => ({ value: account.id, label: `${account.name} · 账单日 ${account.statementDay ?? "未设置"}` }));
}

function defaultCombinedAccountIds(accounts: readonly AppData["accounts"][number][]): readonly string[] {
  const grouped = new Map<number, readonly string[]>();
  accounts.forEach((account) => {
    if (!account.statementDay) return;
    grouped.set(account.statementDay, [...(grouped.get(account.statementDay) ?? []), account.id]);
  });
  return [...grouped.values()].sort((left, right) => right.length - left.length)[0] ?? accounts.slice(0, 2).map((account) => account.id);
}

function statementAccountName(accounts: readonly AppData["accounts"][number][], statement: CreditCardStatement): string {
  const names = statementAccountIds(statement).map((id) => accountName(accounts, id));
  return names.length > 1 ? names.join(" / ") : names[0] ?? "信用卡账期";
}

function accountName(accounts: readonly AppData["accounts"][number][], accountId: string): string {
  return accounts.find((account) => account.id === accountId)?.name ?? "信用卡";
}
