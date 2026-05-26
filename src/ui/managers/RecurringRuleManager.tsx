import { useState } from "react";
import { RECURRING_INTERVALS } from "../../domain/constants";
import { createBase, upsertEntity } from "../../domain/operations";
import { accountCurrencyOptions, currencyForAccount, defaultNextRunAt, earliestAllowedStartAt, validateRecurringRule } from "../../domain/recurring";
import type { Account, AppData, CurrencyCode, RecurringRule } from "../../domain/types";
import { ConfirmDialog, DateField, EmptyState, TextAreaField } from "../common";
import { money } from "../format";
import { ACCOUNT_KIND_LABELS, RECURRING_INTERVAL_LABELS } from "../labels";
import { Button, List, Switch } from "../components";
import { removeEntity, requireName, requirePositive, runUpdate } from "./managerActions";
import { Field, ManagerDrawer, SelectField } from "./ManagerCommon";
import type { ManagerProps } from "./ManagerCommon";

export function RecurringRuleManager({ data, setData, setMessage }: ManagerProps) {
  const account = data.accounts[0];
  const [draft, setDraft] = useState<RecurringRule>(() => defaultRecurring(account?.id ?? "", account?.currency ?? "CNY"));
  const [dateTouched, setDateTouched] = useState(false);
  const [pending, setPending] = useState<RecurringRule>();
  const [open, setOpen] = useState(false);
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
    <section className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => createRule(account, setDraft, setDateTouched, setOpen)}>新建</Button>
      </div>
      <RecurringList rules={data.recurringRules} onEdit={(rule) => editRule(rule, setDraft, setDateTouched, setOpen)} onDelete={setPending} />
      <ManagerDrawer open={open} title="订阅规则" contentClassName="space-y-6 py-1" onClose={() => setOpen(false)} onSave={save}>
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
        <Field label="金额" value={draft.transaction.amount} onChange={(amount) => setDraft({ ...draft, transaction: { ...draft.transaction, amount: Number(amount) } })} />
        <SelectField label="分类" value={draft.transaction.categoryId ?? ""} options={categoryOptions(data)} labels={categoryLabels(data)} onChange={(categoryId) => setDraft({ ...draft, transaction: { ...draft.transaction, categoryId: categoryId || undefined } })} />
        <div className="py-0.5">
          <TextAreaField label="备注" value={draft.transaction.note} onChange={(note) => setDraft({ ...draft, transaction: { ...draft.transaction, note } })} />
        </div>
        <label className="flex items-center gap-2 pt-2 text-sm"><Switch checked={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} />启用</label>
      </ManagerDrawer>
      <ConfirmDialog open={Boolean(pending)} title="确认删除" description={pending ? `确认删除“${pending.name}”？已生成的历史交易不会被删除。` : ""} onCancel={() => setPending(undefined)} onConfirm={remove} />
    </section>
  );
}

function RecurringList(props: {
  readonly rules: readonly RecurringRule[];
  readonly onEdit: (rule: RecurringRule) => void;
  readonly onDelete: (rule: RecurringRule) => void;
}) {
  if (props.rules.length === 0) return <EmptyState>暂无订阅规则。</EmptyState>;
  return (
    <List
      bordered
      dataSource={[...props.rules]}
      rowKey="id"
      renderItem={(rule) => <RecurringRow rule={rule} onEdit={props.onEdit} onDelete={props.onDelete} />}
    />
  );
}

function RecurringRow(props: {
  readonly rule: RecurringRule;
  readonly onEdit: (rule: RecurringRule) => void;
  readonly onDelete: (rule: RecurringRule) => void;
}) {
  return (
    <List.Item
      actions={[
        <Button key="edit" onClick={() => props.onEdit(props.rule)}>编辑</Button>,
        <Button key="delete" variant="danger" onClick={() => props.onDelete(props.rule)}>删除</Button>,
      ]}
    >
      <List.Item.Meta
        title={props.rule.name}
        description={`${RECURRING_INTERVAL_LABELS[props.rule.interval]} · ${new Date(props.rule.nextRunAt).toLocaleDateString("zh-CN")} · ${money(props.rule.transaction.amount, props.rule.transaction.currency)}`}
      />
    </List.Item>
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
  setOpen: (open: boolean) => void,
): void {
  setDraft(defaultRecurring(account.id, account.currency));
  setDateTouched(false);
  setOpen(true);
}

function editRule(
  rule: RecurringRule,
  setDraft: (rule: RecurringRule) => void,
  setDateTouched: (touched: boolean) => void,
  setOpen: (open: boolean) => void,
): void {
  setDraft(rule);
  setDateTouched(true);
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
