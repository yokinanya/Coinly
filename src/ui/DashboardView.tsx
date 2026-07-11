import { ArrowDownRight, ArrowUpRight, Plus } from "lucide-react";
import { memo, useMemo } from "react";
import { buildReportIndex, type CurrencySummary, type ReportEntry } from "../domain/analytics";
import { budgetPeriodRange, spendingForBudgetPeriodEntries } from "../domain/operations";
import type { AppData, Budget, RecurringRule, Transaction } from "../domain/types";
import { PageHeader } from "./common";
import { dateOnly, money } from "./format";
import { TRANSACTION_KIND_LABELS } from "./labels";
import { Button } from "./components";

const RECENT_LIMIT = 6;

interface AccountActivityRow {
  readonly accountId: string;
  readonly accountName: string;
  readonly currency: string;
  readonly net: number;
  readonly count: number;
}

export function DashboardView({ data, onNavigate }: { readonly data: AppData; readonly setData: (data: AppData) => void; readonly onNavigate?: (id: "entry" | "budget") => void }) {
  const report = useMemo(() => buildReportIndex(data), [data]);
  const pendingRecurring = useMemo(() => data.recurringRules.filter((rule) => rule.enabled), [data.recurringRules]);
  const recentTransactions = useMemo(() => recentTransactionRows(data.transactions), [data.transactions]);
  const accountActivity = useMemo(() => accountActivityRows(data, currentMonthTransactions(data.transactions)), [data]);

  return (
    <section className="space-y-4">
      <PageHeader title="概览" actions={onNavigate && <Button variant="primary" onClick={() => onNavigate("entry")}><Plus size={16} aria-hidden="true" />记一笔</Button>} />
      <MonthlyOverview rows={report.currencySummary} transactionCount={report.currentMonthEntries.length} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <RecentTransactions rows={recentTransactions} onEntry={() => onNavigate?.("entry")} />
        <AccountActivityPanel rows={accountActivity} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <BudgetPanel data={data} entries={report.entries} onBudget={() => onNavigate?.("budget")} />
        <RecurringPanel rules={pendingRecurring} />
      </div>
    </section>
  );
}

function MonthlyOverview(props: { readonly rows: readonly CurrencySummary[]; readonly transactionCount: number }) {
  return (
    <section className="panel overflow-hidden" aria-labelledby="monthly-overview-title">
      <div className="flex items-center justify-between gap-3 border-b border-(--color-border) px-4 py-3">
        <div>
          <h2 id="monthly-overview-title" className="font-semibold">本月收支</h2>
          <p className="mt-0.5 text-xs text-(--color-text-secondary)">{props.transactionCount} 笔流水</p>
        </div>
        <span className="rounded-full bg-(--color-accent-soft) px-2.5 py-1 text-xs font-semibold text-(--color-accent)">按原币种</span>
      </div>
      {props.rows.length === 0
        ? <div className="px-4 py-8 text-sm text-(--color-text-secondary)">本月暂无收支，记下第一笔后会在这里汇总。</div>
        : (
          <div className="divide-y divide-(--color-border)">
            {props.rows.map((row) => <CurrencyOverview key={row.currency} row={row} />)}
          </div>
        )}
    </section>
  );
}

function CurrencyOverview(props: { readonly row: CurrencySummary }) {
  const net = props.row.income - props.row.expense;
  return (
    <div className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-center">
      <div className="min-w-0">
        <div className="text-xs font-semibold text-(--color-text-muted)">{props.row.currency} 净额</div>
        <div className={`mt-1 truncate text-2xl font-semibold tabular-nums ${net >= 0 ? "text-(--color-success)" : "text-(--color-coral)"}`}>{money(net, props.row.currency)}</div>
      </div>
      <OverviewMetric icon={<ArrowUpRight size={16} aria-hidden="true" />} label="收入" value={money(props.row.income, props.row.currency)} tone="success" />
      <OverviewMetric icon={<ArrowDownRight size={16} aria-hidden="true" />} label="支出" value={money(props.row.expense, props.row.currency)} tone="expense" />
    </div>
  );
}

function OverviewMetric(props: { readonly icon: React.ReactNode; readonly label: string; readonly value: string; readonly tone: "success" | "expense" }) {
  return (
    <div className="flex items-center gap-3">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-md ${props.tone === "success" ? "bg-(--color-success-soft) text-(--color-success)" : "bg-(--color-coral-soft) text-(--color-coral)"}`}>{props.icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-(--color-text-secondary)">{props.label}</div>
        <div className="truncate font-semibold tabular-nums">{props.value}</div>
      </div>
    </div>
  );
}

function AccountActivityPanel(props: { readonly rows: readonly AccountActivityRow[] }) {
  return (
    <section className="panel overflow-hidden">
      <PanelTitle title="账户本月流动" />
      <div className="divide-y divide-(--color-border)">
        {props.rows.length === 0 && <EmptyLine text="本月暂无账户流水。" />}
        {props.rows.map((row) => <AccountActivityLine key={`${row.accountId}:${row.currency}`} row={row} />)}
      </div>
    </section>
  );
}

function AccountActivityLine(props: { readonly row: AccountActivityRow }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <div className="truncate font-medium" title={props.row.accountName}>{props.row.accountName}</div>
        <div className="mt-1 text-xs text-(--color-text-secondary)">{props.row.count} 笔 · {props.row.currency}</div>
      </div>
      <div className={`font-semibold tabular-nums ${props.row.net >= 0 ? "text-(--color-success)" : "text-(--color-coral)"}`}>{money(props.row.net, props.row.currency)}</div>
    </div>
  );
}

function RecentTransactions(props: { readonly rows: readonly Transaction[]; readonly onEntry?: () => void }) {
  return (
    <section className="panel overflow-hidden">
      <PanelTitle title="最近交易" />
      <div className="divide-y divide-(--color-border)">
        {props.rows.length === 0 && <EmptyLine text="暂无交易。" action={props.onEntry ? { label: "去记账", onClick: props.onEntry } : undefined} />}
        {props.rows.map((row) => <TransactionLine key={row.id} row={row} />)}
      </div>
    </section>
  );
}

const TransactionLine = memo(function TransactionLine(props: { readonly row: Transaction }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <div className="truncate font-medium" title={props.row.note || TRANSACTION_KIND_LABELS[props.row.kind]}>{props.row.note || TRANSACTION_KIND_LABELS[props.row.kind]}</div>
        <div className="mt-1 text-xs text-(--color-text-secondary)">{dateOnly(props.row.occurredAt)} · {TRANSACTION_KIND_LABELS[props.row.kind]}</div>
      </div>
      <div className={`font-medium tabular-nums ${transactionAmountTone(props.row)}`}>{money(props.row.amount, props.row.currency)}</div>
    </div>
  );
});

function RecurringPanel(props: { readonly rules: readonly RecurringRule[] }) {
  return (
    <section className="panel overflow-hidden">
      <PanelTitle title="订阅提醒" />
      <div className="divide-y divide-(--color-border)">
        {props.rules.length === 0 && <EmptyLine text="暂无启用的订阅。" />}
        {props.rules.slice(0, 6).map((rule) => (
          <div key={rule.id} className="px-4 py-3 text-sm">
            <div className="font-medium">{rule.name}</div>
            <div className="mt-1 text-xs text-(--color-text-secondary)">下次：{new Date(rule.nextRunAt).toLocaleDateString("zh-CN")}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BudgetPanel({ data, entries, onBudget }: { readonly data: AppData; readonly entries: readonly ReportEntry[]; readonly onBudget?: () => void }) {
  return (
    <section className="panel p-4">
      <PanelTitle title="预算进度" compact />
      {data.budgets.length === 0 && <EmptyLine text="暂无预算。" action={onBudget ? { label: "去预算", onClick: onBudget } : undefined} compact />}
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.budgets.slice(0, 6).map((budget) => <BudgetProgress key={budget.id} budget={budget} entries={entries} />)}
      </div>
    </section>
  );
}

const BudgetProgress = memo(function BudgetProgress(props: { readonly budget: Budget; readonly entries: readonly ReportEntry[] }) {
  const spent = spendingForBudgetPeriodEntries(props.entries, props.budget);
  const percent = Math.min(100, Math.round((spent / props.budget.amount) * 100));
  const [start, end] = budgetPeriodRange(props.budget);
  return (
    <div className="row-card p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-medium" title={props.budget.name}>{props.budget.name}</span>
        <span className="text-(--color-text-secondary)">{percent}%</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded bg-(--color-surface)">
        <div className="h-full rounded bg-(--color-accent)" style={{ width: `${percent}%` }} />
      </div>
      <div className="mt-2 flex justify-between gap-3 text-xs text-(--color-text-secondary)">
        <span>{money(spent, props.budget.currency)} / {money(props.budget.amount, props.budget.currency)}</span>
        <span>{dateOnly(start)} - {dateOnly(end)}</span>
      </div>
    </div>
  );
});

function PanelTitle(props: { readonly title: string; readonly compact?: boolean }) {
  return <h2 className={props.compact ? "font-semibold" : "border-b border-(--color-border) px-4 py-3 font-semibold"}>{props.title}</h2>;
}

function EmptyLine(props: { readonly text: string; readonly compact?: boolean; readonly action?: { readonly label: string; readonly onClick: () => void } }) {
  return (
    <div className={`${props.compact ? "py-3" : "px-4 py-6"} space-y-3 text-sm text-(--color-text-secondary)`}>
      <p>{props.text}</p>
      {props.action && <Button onClick={props.action.onClick}>{props.action.label}</Button>}
    </div>
  );
}

function recentTransactionRows(transactions: readonly Transaction[]): readonly Transaction[] {
  return [...transactions].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, RECENT_LIMIT);
}

function transactionAmountTone(transaction: Transaction): string {
  if (transaction.kind === "income" || transaction.kind === "refund") return "text-(--color-success)";
  if (transaction.kind === "expense" || transaction.kind === "credit_payment") return "text-(--color-coral)";
  return "text-(--color-text)";
}

function currentMonthTransactions(transactions: readonly Transaction[]): readonly Transaction[] {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return transactions.filter((transaction) => transaction.occurredAt >= start && transaction.occurredAt < end);
}

function accountActivityRows(data: AppData, transactions: readonly Transaction[]): readonly AccountActivityRow[] {
  const accounts = Object.fromEntries(data.accounts.map((account) => [account.id, account.name]));
  const rows = transactions.reduce<Map<string, AccountActivityRow>>((result, transaction) => {
    const key = `${transaction.accountId}:${transaction.currency}`;
    const current = result.get(key) ?? {
      accountId: transaction.accountId,
      accountName: accounts[transaction.accountId] ?? "未知账户",
      currency: transaction.currency,
      net: 0,
      count: 0,
    };
    result.set(key, {
      ...current,
      net: current.net + signedAccountAmount(transaction),
      count: current.count + 1,
    });
    return result;
  }, new Map());
  return [...rows.values()].sort((left, right) => Math.abs(right.net) - Math.abs(left.net)).slice(0, 6);
}

function signedAccountAmount(transaction: Transaction): number {
  if (transaction.kind === "income" || transaction.kind === "refund") return transaction.amount;
  if (transaction.kind === "expense" || transaction.kind === "credit_payment") return -transaction.amount;
  return -transaction.amount;
}
