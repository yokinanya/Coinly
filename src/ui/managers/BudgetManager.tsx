import { useState } from "react";
import { buildReportIndex } from "../../domain/analytics";
import type { ReportEntry } from "../../domain/analytics";
import { budgetPeriodRange, createBase, spendingForBudgetPeriodEntries, upsertEntity } from "../../domain/operations";
import type { Budget } from "../../domain/types";
import { ConfirmDialog, EmptyState, MultiSelectField } from "../common";
import { money } from "../format";
import { BUDGET_PERIOD_LABELS } from "../labels";
import { Button } from "../components";
import { removeEntity, requireName, requirePositive, runUpdate } from "./managerActions";
import { Field, ManagerDialog, SelectField } from "./ManagerCommon";
import type { ManagerProps } from "./ManagerCommon";

export function BudgetManager({ data, setData, setMessage }: ManagerProps) {
  const defaultCurrency = data.currencies[0] ?? "CNY";
  const [draft, setDraft] = useState<Budget>(() => defaultBudget(defaultCurrency));
  const [pending, setPending] = useState<Budget>();
  const [open, setOpen] = useState(false);
  const openNewBudget = () => editBudget(defaultBudget(defaultCurrency), setDraft, setOpen);
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
        <Button variant="primary" onClick={openNewBudget}>新建</Button>
      </div>
      <BudgetCards data={data} onCreate={openNewBudget} onEdit={(budget) => editBudget(budget, setDraft, setOpen)} onDelete={setPending} />
      <ManagerDialog open={open} title="预算" onClose={() => setOpen(false)} onSave={save}>
        <Field label="名称" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
        <Field label="金额" type="number" inputMode="decimal" min={0} step="0.01" value={draft.amount} onChange={(amount) => setDraft({ ...draft, amount: Number(amount) })} />
        <SelectField label="币种" value={draft.currency} options={data.currencies} onChange={(currency) => setDraft({ ...draft, currency: currency as Budget["currency"] })} />
        <SelectField label="周期" value={draft.period} options={["monthly", "yearly"]} labels={BUDGET_PERIOD_LABELS} onChange={(period) => setDraft({ ...draft, period: period as Budget["period"] })} />
        <MultiSelectField
          label="预算分类"
          description="这些分类的支出会计入预算。"
          values={draft.categoryIds}
          options={expenseCategoryOptions(data.categories)}
          onChange={(categoryIds) => setDraft({ ...draft, categoryIds })}
        />
        <MultiSelectField
          label="冲正分类"
          description="这些分类的收入会抵扣预算，例如出售闲置。"
          values={draft.offsetCategoryIds ?? []}
          options={incomeCategoryOptions(data.categories)}
          onChange={(offsetCategoryIds) => setDraft({ ...draft, offsetCategoryIds })}
        />
      </ManagerDialog>
      <ConfirmDialog open={Boolean(pending)} title="确认删除" description={pending ? `确认删除“${pending.name}”？删除后不会影响历史交易。` : ""} onCancel={() => setPending(undefined)} onConfirm={remove} />
    </section>
  );
}

function BudgetCards(props: {
  readonly data: ManagerProps["data"];
  readonly onCreate: () => void;
  readonly onEdit: (budget: Budget) => void;
  readonly onDelete: (budget: Budget) => void;
}) {
  const report = buildReportIndex(props.data);
  if (props.data.budgets.length === 0) return <EmptyState action={{ label: "新建预算", onClick: props.onCreate }}>暂无预算。</EmptyState>;
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
  const percent = Math.min(100, Math.round((spent / props.budget.amount) * 100));
  return (
    <article className="panel flex min-h-44 flex-col justify-between gap-4 p-4">
      <BudgetSummary budget={props.budget} spent={spent} percent={percent} />
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
}) {
  const [start, end] = budgetPeriodRange(props.budget);
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h2 className="truncate font-semibold">{props.budget.name}</h2>
        <span className="text-sm text-(--color-text-secondary)">{BUDGET_PERIOD_LABELS[props.budget.period]}</span>
      </div>
      <div className="mt-3 h-2 rounded bg-(--color-surface-muted)">
        <div className="h-2 rounded bg-(--color-accent)" style={{ width: `${props.percent}%` }} />
      </div>
      <p className="mt-2 text-sm">{money(props.spent, props.budget.currency)} / {money(props.budget.amount, props.budget.currency)}</p>
      <p className="mt-1 text-xs text-(--color-text-secondary)">{dateRange(start, end)}</p>
    </div>
  );
}

function defaultBudget(currency: Budget["currency"]): Budget {
  return { ...createBase(), name: "月度预算", amount: 1000, currency, categoryIds: [], tagIds: [], offsetCategoryIds: [], period: "monthly" };
}

function editBudget(budget: Budget, setDraft: (budget: Budget) => void, setOpen: (open: boolean) => void) {
  setDraft(budget);
  setOpen(true);
}

function dateRange(start: string, end: string): string {
  return `${new Date(start).toLocaleDateString("zh-CN")} - ${new Date(end).toLocaleDateString("zh-CN")}`;
}

function expenseCategoryOptions(categories: readonly { readonly id: string; readonly name: string; readonly direction: "income" | "expense" }[]) {
  return categories.filter((category) => category.direction === "expense").map((category) => ({ value: category.id, label: category.name }));
}

function incomeCategoryOptions(categories: readonly { readonly id: string; readonly name: string; readonly direction: "income" | "expense" }[]) {
  return categories.filter((category) => category.direction === "income").map((category) => ({ value: category.id, label: category.name }));
}
