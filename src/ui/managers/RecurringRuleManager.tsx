import { CalendarDays, Pencil, Plus, Trash2, WalletCards } from "lucide-react";
import { useState } from "react";
import { RECURRING_INTERVALS } from "../../domain/constants";
import { createBase, upsertEntity } from "../../domain/operations";
import { accountCurrencyOptions, currencyForAccount, defaultNextRunAt, earliestAllowedStartAt, validateRecurringRule } from "../../domain/recurring";
import type { Account, AppData, CurrencyCode, RecurringRule } from "../../domain/types";
import { ConfirmDialog, DateField, EmptyState, ErrorBanner, PageHeader, SuccessBanner, TextAreaField } from "../common";
import { money } from "../format";
import { ACCOUNT_KIND_LABELS, RECURRING_INTERVAL_LABELS } from "../labels";
import { summarizeRecurringRules } from "../recurringSummary";
import { Button, Switch } from "../components";
import { removeEntity, requireName, requirePositive, runUpdate } from "./managerActions";
import { AnimatedRow, Field, ManagerDrawer, SelectField } from "./ManagerCommon";
import type { ManagerProps } from "./ManagerCommon";

interface RecurringRuleManagerProps extends ManagerProps {
  readonly message: string;
}

export function RecurringRuleManager({ data, setData, message, setMessage }: RecurringRuleManagerProps) {
  const account = data.accounts[0];
  const [draft, setDraft] = useState<RecurringRule>(() => defaultRecurring(account?.id ?? "", account?.currency ?? "CNY"));
  const [dateTouched, setDateTouched] = useState(false);
  const [pending, setPending] = useState<RecurringRule>();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  if (!account) return <EmptyState>请先创建账户。</EmptyState>;
  const save = () => runUpdate(() => {
    requireName(draft.name);
    requirePositive(draft.transaction.amount);
    validateRecurringRule(data, draft);
    setData(upsertEntity(data, "recurringRules", { ...draft, updatedAt: new Date().toISOString() }));
  }, setMessage) && setOpen(false);
  const remove = () => {
    if (!pending) return;
    removeEntity({ data, setData, setMessage, key: "recurringRules", id: pending.id });
    setPending(undefined);
  };

  return (
    <section className="space-y-5">
      <PageHeader
        title="订阅"
        actions={<Button variant="primary" onClick={() => createRule(account, setDraft, setDateTouched, setEditing, setOpen)}><Plus size={16} aria-hidden="true" />新建订阅</Button>}
      />
      <ErrorBanner message={message.includes("失败") || message.includes("无法") ? message : ""} />
      <SuccessBanner message={message && !message.includes("失败") && !message.includes("无法") ? message : ""} />
      <RecurringSummary rules={data.recurringRules} />
      <RecurringCards
        rules={data.recurringRules}
        accounts={data.accounts}
        onCreate={() => createRule(account, setDraft, setDateTouched, setEditing, setOpen)}
        onEdit={(rule) => editRule(rule, setDraft, setDateTouched, setEditing, setOpen)}
        onDelete={setPending}
      />
      <ManagerDrawer open={open} title={editing ? "编辑订阅" : "新建订阅"} contentClassName="space-y-6 py-1" onClose={() => setOpen(false)} onSave={save}>
        <Field label="名称" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
        <SelectField label="周期" value={draft.interval} options={RECURRING_INTERVALS} labels={RECURRING_INTERVAL_LABELS} onChange={(interval) => setDraft(changeInterval(draft, interval as RecurringRule["interval"], dateTouched))} />
        <div className="py-0.5">
          <DateField
            label="开始日期"
            value={draft.nextRunAt}
            disabledDate={(date) => date.startOf("day").toDate().toISOString() < earliestAllowedStartAt()}
            onChange={(nextRunAt) => {
              setDateTouched(true);
              setDraft({ ...draft, nextRunAt });
            }}
          />
        </div>
        <SelectField label="支付方式" value={draft.transaction.accountId} options={data.accounts.map((item) => item.id)} labels={accountLabels(data.accounts)} onChange={(accountId) => setDraft(changeAccount(draft, data.accounts, accountId))} />
        <SelectField label="支付币种" value={draft.transaction.currency} options={currencyOptions(data.accounts, draft.transaction.accountId)} onChange={(currency) => setDraft({ ...draft, transaction: { ...draft.transaction, currency: currency as CurrencyCode } })} />
        <Field label="金额" type="number" inputMode="decimal" min={0} step="0.01" value={draft.transaction.amount} onChange={(amount) => setDraft({ ...draft, transaction: { ...draft.transaction, amount: Number(amount) } })} />
        <SelectField label="分类" value={draft.transaction.categoryId ?? ""} options={categoryOptions(data)} labels={categoryLabels(data)} onChange={(categoryId) => setDraft({ ...draft, transaction: { ...draft.transaction, categoryId: categoryId || undefined } })} />
        <div className="py-0.5">
          <TextAreaField label="备注" value={draft.transaction.note} onChange={(note) => setDraft({ ...draft, transaction: { ...draft.transaction, note } })} />
        </div>
        <label className="flex items-center gap-2 pt-2 text-sm"><Switch ariaLabel="启用订阅规则" checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} />启用</label>
      </ManagerDrawer>
      <ConfirmDialog open={Boolean(pending)} title="确认删除" description={pending ? `确认删除“${pending.name}”？已生成的历史交易不会被删除。` : ""} onCancel={() => setPending(undefined)} onConfirm={remove} />
    </section>
  );
}

function RecurringSummary(props: { readonly rules: readonly RecurringRule[] }) {
  const summary = summarizeRecurringRules(props.rules, new Date());
  return (
    <section className="panel grid gap-4 p-4 sm:grid-cols-3" aria-label="订阅概览">
      <SummaryMetric label="启用订阅" value={String(summary.enabledCount)} />
      <SummaryMetric label="未来 30 天" value={`${summary.upcomingCount} 笔`} />
      <div className="min-w-0 sm:border-l sm:border-(--color-border) sm:pl-4">
        <p className="text-xs font-medium text-(--color-text-muted)">预计支出</p>
        {summary.amounts.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-lg font-semibold tabular-nums">
            {summary.amounts.map((item) => <span key={item.currency}>{money(item.amount, item.currency)}</span>)}
          </div>
        ) : <p className="mt-1 text-sm text-(--color-text-secondary)">未来 30 天暂无扣款</p>}
      </div>
    </section>
  );
}

function SummaryMetric(props: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 sm:border-l sm:border-(--color-border) sm:pl-4 first:sm:border-l-0 first:sm:pl-0">
      <p className="text-xs font-medium text-(--color-text-muted)">{props.label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-(--color-text)">{props.value}</p>
    </div>
  );
}

function RecurringCards(props: {
  readonly rules: readonly RecurringRule[];
  readonly accounts: readonly Account[];
  readonly onCreate: () => void;
  readonly onEdit: (rule: RecurringRule) => void;
  readonly onDelete: (rule: RecurringRule) => void;
}) {
  if (props.rules.length === 0) return <EmptyState action={{ label: "新建订阅", onClick: props.onCreate }}>暂无订阅规则。</EmptyState>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {props.rules.map((rule) => (
        <AnimatedRow key={rule.id}>
          <RecurringCard rule={rule} account={props.accounts.find((account) => account.id === rule.transaction.accountId)} onEdit={props.onEdit} onDelete={props.onDelete} />
        </AnimatedRow>
      ))}
    </div>
  );
}

function RecurringCard(props: {
  readonly rule: RecurringRule;
  readonly account?: Account;
  readonly onEdit: (rule: RecurringRule) => void;
  readonly onDelete: (rule: RecurringRule) => void;
}) {
  const enabled = props.rule.enabled;
  return (
    <article className={`panel flex min-h-52 flex-col justify-between gap-5 border-l-4 p-4 ${enabled ? "border-l-(--color-accent)" : "border-l-(--color-border) bg-(--color-surface-muted)"}`}>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3">
          <h2 className="min-w-0 truncate font-semibold text-(--color-text)" title={props.rule.name}>{props.rule.name}</h2>
          <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${enabled ? "bg-(--color-accent-soft) text-(--color-on-accent)" : "border border-(--color-border) text-(--color-text-secondary)"}`}>
            {enabled ? "启用" : "已停用"}
          </span>
        </div>
        <p className={`mt-4 text-2xl font-semibold tabular-nums ${enabled ? "text-(--color-text)" : "text-(--color-text-secondary)"}`}>
          {money(props.rule.transaction.amount, props.rule.transaction.currency)}
        </p>
        <div className="mt-4 space-y-2 text-sm text-(--color-text-secondary)">
          <p className="flex items-center gap-2"><CalendarDays size={15} aria-hidden="true" /><span>{RECURRING_INTERVAL_LABELS[props.rule.interval]} · {enabled ? "下次" : "原定"} {new Date(props.rule.nextRunAt).toLocaleDateString("zh-CN")}</span></p>
          <p className="flex items-center gap-2"><WalletCards size={15} aria-hidden="true" /><span className="truncate">{props.account?.name ?? "未知账户"} · {props.rule.transaction.currency}</span></p>
        </div>
      </div>
      <div className="flex justify-end gap-1 border-t border-(--color-border) pt-3">
        <Button className="h-11 min-h-11 w-11 px-0" variant="ghost" aria-label={`编辑${props.rule.name}`} title="编辑" onClick={() => props.onEdit(props.rule)}><Pencil size={16} aria-hidden="true" /></Button>
        <Button className="h-11 min-h-11 w-11 px-0" variant="ghost" aria-label={`删除${props.rule.name}`} title="删除" onClick={() => props.onDelete(props.rule)}><Trash2 size={16} aria-hidden="true" /></Button>
      </div>
    </article>
  );
}

function defaultRecurring(accountId: string, currency: Account["currency"]): RecurringRule {
  const interval: RecurringRule["interval"] = "monthly";
  return {
    ...createBase(),
    name: "订阅",
    enabled: true,
    interval,
    nextRunAt: defaultNextRunAt(interval),
    transaction: { kind: "expense", accountId, amount: 1, currency, occurredAt: new Date().toISOString(), tagIds: [], note: "订阅记账" },
  };
}

function createRule(
  account: Account,
  setDraft: (rule: RecurringRule) => void,
  setDateTouched: (touched: boolean) => void,
  setEditing: (editing: boolean) => void,
  setOpen: (open: boolean) => void,
): void {
  setDraft(defaultRecurring(account.id, account.currency));
  setDateTouched(false);
  setEditing(false);
  setOpen(true);
}

function editRule(
  rule: RecurringRule,
  setDraft: (rule: RecurringRule) => void,
  setDateTouched: (touched: boolean) => void,
  setEditing: (editing: boolean) => void,
  setOpen: (open: boolean) => void,
): void {
  setDraft(rule);
  setDateTouched(true);
  setEditing(true);
  setOpen(true);
}

function accountLabels(accounts: readonly Account[]): Record<string, string> {
  return Object.fromEntries(accounts.map((account) => [
    account.id,
    `${account.name} · ${ACCOUNT_KIND_LABELS[account.kind]}`,
  ]));
}

function categoryOptions(data: AppData): readonly string[] {
  return ["", ...data.categories.filter((item) => item.direction === "expense").map((item) => item.id)];
}

function categoryLabels(data: AppData): Record<string, string> {
  return Object.fromEntries(data.categories.map((category) => [category.id, category.name]));
}

function currencyOptions(
  accounts: readonly Account[],
  accountId: string,
): readonly string[] {
  const account = accounts.find((item) => item.id === accountId);
  return account ? accountCurrencyOptions(account) : [];
}

function changeAccount(rule: RecurringRule, accounts: readonly Account[], accountId: string): RecurringRule {
  const account = accounts.find((item) => item.id === accountId);
  return {
    ...rule,
    transaction: {
      ...rule.transaction,
      accountId,
      currency: account ? currencyForAccount(account, rule.transaction.currency) : rule.transaction.currency,
    },
  };
}

function changeInterval(
  rule: RecurringRule,
  interval: RecurringRule["interval"],
  dateTouched: boolean,
): RecurringRule {
  return {
    ...rule,
    interval,
    nextRunAt: dateTouched ? rule.nextRunAt : defaultNextRunAt(interval),
  };
}
