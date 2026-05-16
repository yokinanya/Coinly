import { TRANSACTION_KINDS } from "../domain/constants";
import type { AppData, CurrencyCode, TransactionDraft, TransactionKind } from "../domain/types";
import { CheckableTagList, DateField, SelectField, TextAreaField, TextField } from "./common";
import type { FormOption } from "./common";
import { ACCOUNT_KIND_LABELS, TRANSACTION_KIND_LABELS } from "./labels";
import { Button } from "./metis";

export function TransactionForm(props: {
  readonly data: AppData;
  readonly draft: TransactionDraft;
  readonly submitLabel: string;
  readonly onChange: (draft: TransactionDraft) => void;
  readonly onSubmit: () => void;
  readonly onCancel?: () => void;
  readonly embedded?: boolean;
}) {
  const update = (patch: Partial<TransactionDraft>) => props.onChange({ ...props.draft, ...patch });
  const accountOptions = props.data.accounts.map((item) => option(item.id, `${item.name} · ${ACCOUNT_KIND_LABELS[item.kind]}`));
  const className = props.embedded ? "grid gap-5 md:grid-cols-2" : "panel grid gap-4 p-4 md:grid-cols-2";
  return (
    <div className={className}>
      <SelectField label="类型" value={props.draft.kind} options={kindOptions()} onChange={(value) => updateKind(value as TransactionKind, props.draft, props.onChange)} />
      <SelectField label={accountLabel(props.draft.kind)} value={props.draft.accountId} options={accountOptions} onChange={(accountId) => update({ accountId })} />
      <TextField label="金额" type="number" value={props.draft.amount} onChange={(amount) => update({ amount: Number(amount) })} />
      <SelectField label="币种" value={props.draft.currency} options={currencyOptions(props.data)} onChange={(currency) => update({ currency: currency as CurrencyCode })} />
      {showsCategory(props.draft.kind) && <SelectField label="分类" value={props.draft.categoryId ?? ""} options={categoryOptions(props.data, props.draft.kind)} onChange={(categoryId) => update({ categoryId: categoryId || undefined })} />}
      {props.draft.kind === "transfer" && <TransferFields data={props.data} draft={props.draft} update={update} />}
      {props.draft.kind === "credit_payment" && <PaymentSourceField data={props.data} draft={props.draft} update={update} />}
      <DateField label="日期" value={props.draft.occurredAt} showTime onChange={(occurredAt) => update({ occurredAt })} />
      <TagPicker data={props.data} selected={props.draft.tagIds} onChange={(tagIds) => update({ tagIds })} />
      <div className="md:col-span-2">
        <TextAreaField label="备注" value={props.draft.note} onChange={(note) => update({ note })} />
      </div>
      {!props.embedded && (
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button variant="primary" onClick={props.onSubmit}>{props.submitLabel}</Button>
          {props.onCancel && <Button onClick={props.onCancel}>取消</Button>}
        </div>
      )}
    </div>
  );
}

function TransferFields(props: {
  readonly data: AppData;
  readonly draft: TransactionDraft;
  readonly update: (patch: Partial<TransactionDraft>) => void;
}) {
  return (
    <>
      <SelectField label="目标账户" value={props.draft.relatedAccountId ?? ""} options={accountOptionsWithEmpty(props.data, "未选择")} onChange={(relatedAccountId) => props.update({ relatedAccountId: relatedAccountId || undefined })} />
      <TextField label="转入金额" type="number" value={props.draft.targetAmount ?? props.draft.amount} onChange={(targetAmount) => props.update({ targetAmount: Number(targetAmount) })} />
      <SelectField label="转入币种" value={props.draft.targetCurrency ?? props.draft.currency} options={currencyOptions(props.data)} onChange={(targetCurrency) => props.update({ targetCurrency: targetCurrency as CurrencyCode })} />
    </>
  );
}

function PaymentSourceField(props: {
  readonly data: AppData;
  readonly draft: TransactionDraft;
  readonly update: (patch: Partial<TransactionDraft>) => void;
}) {
  return <SelectField label="还款来源账户（可选）" value={props.draft.relatedAccountId ?? ""} options={accountOptionsWithEmpty(props.data, "未记录")} onChange={(relatedAccountId) => props.update({ relatedAccountId: relatedAccountId || undefined })} />;
}

function TagPicker(props: {
  readonly data: AppData;
  readonly selected: readonly string[];
  readonly onChange: (tagIds: readonly string[]) => void;
}) {
  return (
    <div className="md:col-span-2">
      <CheckableTagList label="标签" selected={props.selected} options={entityOptions(props.data.tags)} onChange={props.onChange} />
    </div>
  );
}

function updateKind(kind: TransactionKind, draft: TransactionDraft, onChange: (draft: TransactionDraft) => void) {
  const categoryId = showsCategory(kind) ? draft.categoryId : undefined;
  const targetAmount = kind === "transfer" ? draft.targetAmount ?? draft.amount : undefined;
  const targetCurrency = kind === "transfer" ? draft.targetCurrency ?? draft.currency : undefined;
  const refundOfTransactionId = kind === "refund" ? draft.refundOfTransactionId : undefined;
  onChange({ ...draft, kind, categoryId, targetAmount, targetCurrency, refundOfTransactionId });
}

function categoryOptions(data: AppData, kind: TransactionKind): readonly FormOption[] {
  const direction = kind === "refund" ? "expense" : kind;
  const rows = data.categories.filter((item) => item.direction === direction);
  return [option("", "未选择"), ...rows.map((item) => option(item.id, item.name))];
}

function accountOptionsWithEmpty(data: AppData, label: string): readonly FormOption[] {
  return [option("", label), ...data.accounts.map((item) => option(item.id, item.name))];
}

function entityOptions(items: readonly { readonly id: string; readonly name: string }[]): readonly FormOption[] {
  return items.map((item) => option(item.id, item.name));
}

function kindOptions(): readonly FormOption[] {
  return TRANSACTION_KINDS.map((kind) => option(kind, TRANSACTION_KIND_LABELS[kind]));
}

function currencyOptions(data: AppData): readonly FormOption[] {
  return data.currencies.map((currency) => option(currency, currency));
}

function option(value: string, label: string): FormOption {
  return { value, label };
}

function showsCategory(kind: TransactionKind): boolean {
  return kind === "income" || kind === "expense" || kind === "refund";
}

function accountLabel(kind: TransactionKind): string {
  return kind === "credit_payment" ? "还款目标信用卡" : "账户";
}
