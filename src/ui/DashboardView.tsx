import { memo, useMemo } from "react";
import { buildReportIndex, type CurrencySummary, type ReportEntry } from "../domain/analytics";
import { budgetPeriodRange, spendingForBudgetPeriodEntries } from "../domain/operations";
import type { AppData, Budget, RecurringRule, Transaction } from "../domain/types";
import { PageHeader } from "./common";
import { dateOnly, money } from "./format";
import { TRANSACTION_KIND_LABELS } from "./labels";

const RECENT_LIMIT = 6;

export function DashboardView({ data }: { readonly data: AppData; readonly setData: (data: AppData) => void }) {
  const report = useMemo(() => buildReportIndex(data), [data]);
  const pendingRecurring = useMemo(() => data.recurringRules.filter((rule) => rule.enabled), [data.recurringRules]);
  const recentTransactions = useMemo(() => recentTransactionRows(data.transactions), [data.transactions]);

  return (
    <section className="space-y-4">
      <PageHeader title="首页" />
      <KpiGrid rows={report.currencySummary} transactionCount={report.currentMonthEntries.length} />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <RecentTransactions rows={recentTransactions} />
        <RecurringPanel rules={pendingRecurring} />
      </div>
      <BudgetPanel data={data} entries={report.entries} />
    </section>
  );
}

function KpiGrid(props: { readonly rows: readonly CurrencySummary[]; readonly transactionCount: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <KpiCard label="本月流水" value={`${props.transactionCount} 笔`} />
      {props.rows.length === 0 && <KpiCard label="本月收支" value="暂无" />}
      {props.rows.map((row) => <CurrencyKpiCard key={row.currency} row={row} />)}
    </div>
  );
}

function KpiCard(props: { readonly label: string; readonly value: string; readonly tone?: "success" | "danger" }) {
  const toneClass = props.tone === "success" ? "text-(--color-success)" : props.tone === "danger" ? "text-(--color-error)" : "text-(--color-text)";
  return (
    <div className="panel p-4">
      <div className="text-sm text-(--color-text-secondary)">{props.label}</div>
      <div className={`mt-2 text-2xl font-semibold leading-tight ${toneClass}`}>{props.value}</div>
    </div>
  );
}

function CurrencyKpiCard(props: { readonly row: CurrencySummary }) {
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-(--color-text-secondary)">本月收支</div>
        <div className="rounded bg-(--color-surface-muted) px-2 py-0.5 text-xs font-medium text-(--color-text-secondary)">{props.row.currency}</div>
      </div>
      <div className="mt-3 grid gap-2 text-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="text-(--color-text-secondary)">收入</span>
          <span className="font-semibold text-(--color-success)">{money(props.row.income, props.row.currency)}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-(--color-text-secondary)">支出</span>
          <span className="font-semibold text-(--color-error)">{money(props.row.expense, props.row.currency)}</span>
        </div>
      </div>
    </div>
  );
}

function RecentTransactions(props: { readonly rows: readonly Transaction[] }) {
  return (
    <section className="panel overflow-hidden">
      <PanelTitle title="最近交易" />
      <div className="divide-y divide-(--color-border)">
        {props.rows.length === 0 && <EmptyLine text="暂无交易。" />}
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
      <div className="tabular-nums">{money(props.row.amount, props.row.currency)}</div>
    </div>
  );
});

function RecurringPanel(props: { readonly rules: readonly RecurringRule[] }) {
  return (
    <section className="panel overflow-hidden">
      <PanelTitle title="订阅提醒" />
      <div className="divide-y divide-(--color-border)">
        {props.rules.length === 0 && <EmptyLine text="暂无启用的订阅。" />}
        {props.rules.map((rule) => (
          <div key={rule.id} className="px-4 py-3 text-sm">
            <div className="font-medium">{rule.name}</div>
            <div className="mt-1 text-xs text-(--color-text-secondary)">下次：{new Date(rule.nextRunAt).toLocaleDateString("zh-CN")}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BudgetPanel({ data, entries }: { readonly data: AppData; readonly entries: readonly ReportEntry[] }) {
  return (
    <section className="panel p-4">
      <PanelTitle title="预算进度" compact />
      {data.budgets.length === 0 && <p className="mt-3 text-sm text-(--color-text-secondary)">暂无预算。</p>}
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {data.budgets.map((budget) => <BudgetProgress key={budget.id} budget={budget} entries={entries} />)}
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

function EmptyLine(props: { readonly text: string }) {
  return <p className="px-4 py-6 text-sm text-(--color-text-secondary)">{props.text}</p>;
}

function recentTransactionRows(transactions: readonly Transaction[]): readonly Transaction[] {
  return [...transactions].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt)).slice(0, RECENT_LIMIT);
}
