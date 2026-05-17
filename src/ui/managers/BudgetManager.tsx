import { useState } from "react";
import { buildReportIndex } from "../../domain/analytics";
import type { ReportEntry } from "../../domain/analytics";
import { budgetPeriodRange, createBase, foreignBudgetSpendingEntries, spendingForBudgetPeriodEntries, upsertEntity } from "../../domain/operations";
import type { Budget } from "../../domain/types";
import { ConfirmDialog, EmptyState } from "../common";
import { money } from "../format";
import { BUDGET_PERIOD_LABELS } from "../labels";
import { Button } from "../metis";
import { removeEntity, requireName, requirePositive, runUpdate } from "./managerActions";
import { Field, ManagerDrawer, SelectField } from "./ManagerCommon";
import type { ManagerProps } from "./ManagerCommon";

export function BudgetManager({ data, setData, setMessage }: ManagerProps) {
  const defaultCurrency = data.currencies[0] ?? "CNY";
  const [draft, setDraft] = useState<Budget>(() => defaultBudget(defaultCurrency));
  const [pending, setPending] = useState<Budget>();
  const [open, setOpen] = useState(false);
  const save = () => runUpdate(() => {
    requireName(draft.name);
    requirePositive(draft.amount);
    setData(upsertEntity(data, "budgets", { ...draft, updatedAt: new Date().toISOString() }));
  }, setMessage) && setOpen(false);
  const remove = () => {
    if (!pending) return;
    removeEntity({ data, setData, setMessage, key: "budgets", id: pending.id });
    setPending(undefined);
  };

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => editBudget(defaultBudget(defaultCurrency), setDraft, setOpen)}>新建</Button>
      </div>
      <BudgetCards data={data} onEdit={(budget) => editBudget(budget, setDraft, setOpen)} onDelete={setPending} />
      <ManagerDrawer open={open} title="预算" onClose={() => setOpen(false)} onSave={save}>
        <Field label="名称" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
        <Field label="金额" value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount: Number(amount) })} />
        <SelectField label="币种" value={draft.currency} options={data.currencies} onChange={(currency) => setDraft({ ...draft, currency: currency as Budget["currency"] })} />
        <SelectField label="周期" value={draft.period} options={["monthly", "yearly"]} labels={BUDGET_PERIOD_LABELS} onChange={(period) => setDraft({ ...draft, period: period as Budget["period"] })} />
      </ManagerDrawer>
      <ConfirmDialog open={Boolean(pending)} title="确认删除" description={pending ? `确认删除“${pending.name}”？删除后不会影响历史交易。` : ""} onCancel={() => setPending(undefined)} onConfirm={remove} />
    </section>
  );
}

function BudgetCards(props: {
  readonly data: ManagerProps["data"];
  readonly onEdit: (budget: Budget) => void;
  readonly onDelete: (budget: Budget) => void;
}) {
  const report = buildReportIndex(props.data);
  if (props.data.budgets.length === 0) return <EmptyState>暂无预算。</EmptyState>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {props.data.budgets.map((budget) => (
        <BudgetCard
          key={budget.id}
          budget={budget}
          entries={report.entries}
          onEdit={props.onEdit}
          onDelete={props.onDelete}
        />
      ))}
    </div>
  );
}

function BudgetCard(props: {
  readonly budget: Budget;
  readonly entries: readonly ReportEntry[];
  readonly onEdit: (budget: Budget) => void;
  readonly onDelete: (budget: Budget) => void;
}) {
  const spent = spendingForBudgetPeriodEntries(props.entries, props.budget);
  const foreign = foreignBudgetSpendingEntries(props.entries, props.budget);
  const percent = Math.min(100, Math.round((spent / props.budget.amount) * 100));
  return (
    <article className="panel flex min-h-44 flex-col justify-between gap-4 p-4">
      <BudgetSummary budget={props.budget} spent={spent} percent={percent} foreignCount={foreign.length} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => props.onEdit(props.budget)}>编辑</Button>
        <Button variant="danger" onClick={() => props.onDelete(props.budget)}>删除</Button>
      </div>
    </article>
  );
}

function BudgetSummary(props: {
  readonly budget: Budget;
  readonly spent: number;
  readonly percent: number;
  readonly foreignCount: number;
}) {
  const [start, end] = budgetPeriodRange(props.budget);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="truncate font-semibold">{props.budget.name}</h2>
        <span className="text-sm text-[var(--color-text-secondary)]">{BUDGET_PERIOD_LABELS[props.budget.period]}</span>
      </div>
      <div className="mt-3 h-2 rounded bg-[var(--color-surface-muted)]">
        <div className="h-2 rounded bg-[var(--color-accent)]" style={{ width: `${props.percent}%` }} />
      </div>
      <p className="mt-2 text-sm">{money(props.spent, props.budget.currency)} / {money(props.budget.amount, props.budget.currency)}</p>
      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">{dateRange(start, end)}</p>
      {props.foreignCount > 0 && <p className="mt-2 text-xs text-[var(--color-warning)]">异币种支出 {props.foreignCount} 条</p>}
    </div>
  );
}

function defaultBudget(currency: Budget["currency"]): Budget {
  return { ...createBase(), name: "月度预算", amount: 1000, currency, categoryIds: [], tagIds: [], period: "monthly" };
}

function editBudget(budget: Budget, setDraft: (budget: Budget) => void, setOpen: (open: boolean) => void) {
  setDraft(budget);
  setOpen(true);
}

function dateRange(start: string, end: string): string {
  return `${new Date(start).toLocaleDateString("zh-CN")} - ${new Date(end).toLocaleDateString("zh-CN")}`;
}
