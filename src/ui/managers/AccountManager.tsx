import { useState } from "react";
import { ACCOUNT_KINDS } from "../../domain/constants";
import { createBase, upsertEntity, validStatementDay } from "../../domain/operations";
import { accountCurrencyOptions } from "../../domain/recurring";
import type { Account } from "../../domain/types";
import { ConfirmDialog, MultiSelectField } from "../common";
import { ACCOUNT_KIND_LABELS } from "../labels";
import { Button } from "../components";
import { optionalNumber, removeEntity, requireName, runUpdate } from "./managerActions";
import { Field, ManagerDialog, SelectField } from "./ManagerCommon";
import type { ManagerProps } from "./ManagerCommon";

export function AccountManager({ data, setData, setMessage }: ManagerProps) {
  const defaultCurrency = data.currencies[0] ?? "CNY";
  const [draft, setDraft] = useState<Account>(() => defaultAccount(defaultCurrency));
  const [pending, setPending] = useState<Account>();
  const [open, setOpen] = useState(false);
  const save = () => runUpdate(() => {
    requireName(draft.name);
    if (!validStatementDay(draft.statementDay) || !validStatementDay(draft.paymentDueDay)) throw new Error("账单日和还款日必须在 1-31 之间");
    setData(upsertEntity(data, "accounts", { ...draft, updatedAt: new Date().toISOString() }));
  }, setMessage) && setOpen(false);
  const remove = () => {
    if (!pending) return;
    removeEntity({ data, setData, setMessage, key: "accounts", id: pending.id });
    setPending(undefined);
  };

  return (
    <section className="space-y-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => editAccount(defaultAccount(defaultCurrency), setDraft, setOpen)}>新建</Button>
      </div>
      <AccountCards accounts={data.accounts} onEdit={(account) => editAccount(account, setDraft, setOpen)} onDelete={setPending} />
      <ManagerDialog open={open} title="账户" onClose={() => setOpen(false)} onSave={save}>
        <AccountFields data={data} draft={draft} setDraft={setDraft} />
      </ManagerDialog>
      <ConfirmDialog open={Boolean(pending)} title="确认删除" description={pending ? `确认删除“${pending.name}”？有关联交易时会被阻止。` : ""} onCancel={() => setPending(undefined)} onConfirm={remove} />
    </section>
  );
}

function AccountCards(props: {
  readonly accounts: readonly Account[];
  readonly onEdit: (account: Account) => void;
  readonly onDelete: (account: Account) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {props.accounts.map((account) => <AccountCard key={account.id} account={account} onEdit={props.onEdit} onDelete={props.onDelete} />)}
    </div>
  );
}

function AccountCard(props: {
  readonly account: Account;
  readonly onEdit: (account: Account) => void;
  readonly onDelete: (account: Account) => void;
}) {
  return (
    <article className="panel flex min-h-36 flex-col justify-between gap-4 p-4">
      <div className="min-w-0">
        <h2 className="truncate font-semibold text-(--color-text)">{props.account.name}</h2>
        <p className="mt-2 text-sm text-(--color-text-secondary)">{ACCOUNT_KIND_LABELS[props.account.kind]}</p>
        <p className="mt-1 text-sm text-(--color-text-secondary)">{accountCurrencyText(props.account)}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => props.onEdit(props.account)}>编辑</Button>
        <Button variant="danger" onClick={() => props.onDelete(props.account)}>删除</Button>
      </div>
    </article>
  );
}

function AccountFields(props: {
  readonly data: ManagerProps["data"];
  readonly draft: Account;
  readonly setDraft: (account: Account) => void;
}) {
  const { data, draft, setDraft } = props;
  return (
    <>
      <Field label="名称" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} />
      <SelectField label="类型" value={draft.kind} options={ACCOUNT_KINDS} labels={ACCOUNT_KIND_LABELS} onChange={(kind) => setDraft(changeKind(draft, kind as Account["kind"]))} />
      {!isMultiCurrencyAccount(draft) && <SelectField label="币种" value={draft.currency} options={data.currencies} onChange={(currency) => setDraft({ ...draft, currency: currency as Account["currency"] })} />}
      {isMultiCurrencyAccount(draft) && <AccountCurrencyField data={data} draft={draft} setDraft={setDraft} />}
      {draft.kind === "credit" && <StatementDateFields draft={draft} setDraft={setDraft} />}
    </>
  );
}

function AccountCurrencyField(props: {
  readonly data: ManagerProps["data"];
  readonly draft: Account;
  readonly setDraft: (account: Account) => void;
}) {
  return (
    <MultiSelectField
      label="绑定币种"
      values={accountCurrencyOptions(props.draft)}
      options={props.data.currencies.map((currency) => ({ value: currency, label: currency }))}
      onChange={(currencyCodes) => props.setDraft(changeAccountCurrencies(props.draft, currencyCodes))}
    />
  );
}

function StatementDateFields(props: {
  readonly draft: Account;
  readonly setDraft: (account: Account) => void;
}) {
  return (
    <>
      <Field label="账单日" value={props.draft.statementDay ?? ""} onChange={(value) => props.setDraft({ ...props.draft, statementDay: optionalNumber(value) })} />
      <Field label="到期日" value={props.draft.paymentDueDay ?? ""} onChange={(value) => props.setDraft({ ...props.draft, paymentDueDay: optionalNumber(value) })} />
    </>
  );
}

function defaultAccount(currency: Account["currency"]): Account {
  return { ...createBase(), name: "新账户", kind: "other", currency };
}

function changeKind(account: Account, kind: Account["kind"]): Account {
  if (kind === "credit") return { ...account, kind, currencyCodes: accountCurrencyOptions(account) };
  if (kind === "debit") {
    return { id: account.id, createdAt: account.createdAt, updatedAt: account.updatedAt, name: account.name, currency: account.currency, kind, currencyCodes: accountCurrencyOptions(account) };
  }
  return { id: account.id, createdAt: account.createdAt, updatedAt: account.updatedAt, name: account.name, currency: account.currency, kind };
}

function changeAccountCurrencies(account: Account, currencyCodes: readonly string[]): Account {
  const [primaryCurrency] = currencyCodes;
  return { ...account, currency: primaryCurrency ?? account.currency, currencyCodes: currencyCodes as readonly Account["currency"][] };
}

function accountCurrencyText(account: Account): string {
  return isMultiCurrencyAccount(account) ? accountCurrencyOptions(account).join(" / ") : account.currency;
}

function isMultiCurrencyAccount(account: Account): boolean {
  return account.kind === "credit" || account.kind === "debit";
}

function editAccount(account: Account, setDraft: (account: Account) => void, setOpen: (open: boolean) => void) {
  setDraft(account);
  setOpen(true);
}
