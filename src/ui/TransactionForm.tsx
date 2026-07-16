import { useRef, useState } from "react";
import { TRANSACTION_KINDS } from "../domain/constants";
import { accountCurrencyOptions, currencyForAccount } from "../domain/recurring";
import type { AppData, CurrencyCode, TransactionDraft, TransactionKind } from "../domain/types";
import { CheckableTagList, DateField, SelectField, TextAreaField, TextField } from "./common";
import type { FormOption } from "./common";
import { ACCOUNT_KIND_LABELS, TRANSACTION_KIND_LABELS } from "./labels";
import { Button } from "./components";

type TransactionFieldName = "accountId" | "amount" | "currency" | "relatedAccountId" | "targetAmount" | "targetCurrency";
type FieldErrors = Partial<Record<TransactionFieldName, string>>;
const ERROR_FIELD_ORDER: readonly TransactionFieldName[] = ["accountId", "amount", "currency", "relatedAccountId", "targetAmount", "targetCurrency"];

export function TransactionForm(props: {
  readonly data: AppData;
  readonly draft: TransactionDraft;
  readonly submitLabel: string;
  readonly onChange: (draft: TransactionDraft) => void;
  readonly onSubmit: () => void;
  readonly onCancel?: () => void;
  readonly embedded?: boolean;
  readonly submitting?: boolean;
}) {
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const formRef = useRef<HTMLFormElement>(null);
  const update = (patch: Partial<TransactionDraft>) => props.onChange({ ...props.draft, ...patch });
  const updateField = (field: TransactionFieldName, patch: Partial<TransactionDraft>) => {
    setFieldErrors((current) => withoutError(current, field));
    update(patch);
  };
  const submit = () => {
    const errors = validateDraftFields(props.draft);
    setFieldErrors(errors);
    const firstError = firstErrorField(errors);
    if (firstError) {
      focusField(formRef, firstError);
      return;
    }
    props.onSubmit();
  };
  const accountOptions = props.data.accounts.map((item) => option(item.id, `${item.name} · ${ACCOUNT_KIND_LABELS[item.kind]}`));
  const selectedAccount = props.data.accounts.find((item) => item.id === props.draft.accountId);
  const className = props.embedded ? "grid gap-5 md:grid-cols-2" : "panel mx-auto grid max-w-3xl gap-5 p-4 sm:p-5 md:grid-cols-2";
  return (
    <form
      ref={formRef}
      className={className}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <TransactionKindPicker value={props.draft.kind} onChange={(kind) => changeKind(kind, props.data, props.draft, props.onChange, setFieldErrors)} />
      <TextField className="text-lg font-semibold tabular-nums" required fieldName="amount" error={fieldErrors.amount} label="金额" type="number" inputMode="decimal" min={0} step="0.01" value={props.draft.amount} onChange={(amount) => updateField("amount", { amount: Number(amount) })} />
      <SelectField required fieldName="currency" error={fieldErrors.currency} label="币种" value={props.draft.currency} options={currencyOptions(selectedAccount)} onChange={(currency) => updateField("currency", { currency: currency as CurrencyCode })} />
      <SelectField required fieldName="accountId" error={fieldErrors.accountId} label={accountLabel(props.draft.kind)} value={props.draft.accountId} options={accountOptions} onChange={(accountId) => changeAccount(accountId, props.data, props.draft, props.onChange, setFieldErrors)} />
      {showsCategory(props.draft.kind) && <SelectField label="分类" value={props.draft.categoryId ?? ""} options={categoryOptions(props.data, props.draft.kind)} onChange={(categoryId) => update({ categoryId: categoryId || undefined })} />}
      {props.draft.kind === "transfer" && <TransferFields data={props.data} draft={props.draft} errors={fieldErrors} updateField={updateField} />}
      {props.draft.kind === "credit_payment" && <PaymentSourceField data={props.data} draft={props.draft} update={update} />}
      <DateField label="日期" value={props.draft.occurredAt} onChange={(occurredAt) => update({ occurredAt })} />
      <details className="group rounded-md border border-(--color-border) bg-(--color-surface-muted) md:col-span-2" open={Boolean(props.draft.tagIds.length || props.draft.note)}>
        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-(--color-text-secondary) marker:hidden">
          标签与备注
          <span className="float-right text-(--color-text-muted) group-open:rotate-180" aria-hidden="true">⌄</span>
        </summary>
        <div className="grid gap-4 border-t border-(--color-border) p-3">
          <TagPicker data={props.data} selected={props.draft.tagIds} onChange={(tagIds) => update({ tagIds })} />
          <TextAreaField label="备注" value={props.draft.note} onChange={(note) => update({ note })} />
        </div>
      </details>
      {!props.embedded && (
        <div className="sticky bottom-[calc(var(--safe-bottom)+4.25rem)] z-10 -mx-4 -mb-4 flex flex-wrap gap-2 border-t border-(--color-border) bg-(--color-surface) p-4 sm:-mx-5 sm:-mb-5 sm:p-5 md:static md:mx-0 md:mb-0 md:border-0 md:bg-transparent md:p-0 md:col-span-2">
          <Button className="w-full sm:w-auto" variant="primary" htmlType="submit" loading={props.submitting} disabled={props.submitting}>{props.submitLabel}</Button>
          {props.onCancel && <Button onClick={props.onCancel}>取消</Button>}
        </div>
      )}
    </form>
  );
}

function TransactionKindPicker(props: { readonly value: TransactionKind; readonly onChange: (kind: TransactionKind) => void }) {
  return (
    <fieldset className="md:col-span-2">
      <legend className="label mb-2">类型</legend>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {TRANSACTION_KINDS.map((kind) => {
          const selected = props.value === kind;
          return (
            <button
              key={kind}
              className={`ui-button min-w-0 px-2 ${selected ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)" : "border-(--color-border) bg-(--color-surface) text-(--color-text-secondary)"}`}
              type="button"
              aria-pressed={selected}
              onClick={() => props.onChange(kind)}
            >
              {TRANSACTION_KIND_LABELS[kind]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function TransferFields(props: {
  readonly data: AppData;
  readonly draft: TransactionDraft;
  readonly errors: FieldErrors;
  readonly updateField: (field: TransactionFieldName, patch: Partial<TransactionDraft>) => void;
}) {
  const targetAccount = props.data.accounts.find((item) => item.id === props.draft.relatedAccountId);
  return (
    <>
      <SelectField required fieldName="relatedAccountId" error={props.errors.relatedAccountId} label="目标账户" value={props.draft.relatedAccountId ?? ""} options={accountOptionsWithEmpty(props.data, "未选择")} onChange={(relatedAccountId) => props.updateField("relatedAccountId", transferAccountPatch(props.data, props.draft, relatedAccountId))} />
      <TextField required fieldName="targetAmount" error={props.errors.targetAmount} label="转入金额" type="number" inputMode="decimal" min={0} step="0.01" value={props.draft.targetAmount ?? props.draft.amount} onChange={(targetAmount) => props.updateField("targetAmount", { targetAmount: Number(targetAmount) })} />
      <SelectField required fieldName="targetCurrency" error={props.errors.targetCurrency} label="转入币种" value={props.draft.targetCurrency ?? props.draft.currency} options={currencyOptions(targetAccount)} onChange={(targetCurrency) => props.updateField("targetCurrency", { targetCurrency: targetCurrency as CurrencyCode })} />
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
    <div>
      <CheckableTagList label="标签" selected={props.selected} options={entityOptions(props.data.tags)} onChange={props.onChange} />
    </div>
  );
}

function changeKind(
  kind: TransactionKind,
  data: AppData,
  draft: TransactionDraft,
  onChange: (draft: TransactionDraft) => void,
  setFieldErrors: (errors: FieldErrors) => void,
) {
  setFieldErrors({});
  updateKind(kind, data, draft, onChange);
}

function updateKind(kind: TransactionKind, data: AppData, draft: TransactionDraft, onChange: (draft: TransactionDraft) => void) {
  const categoryId = validCategoryId(data, kind, draft.categoryId);
  const targetAmount = kind === "transfer" ? draft.targetAmount ?? draft.amount : undefined;
  const targetCurrency = kind === "transfer" ? draft.targetCurrency ?? draft.currency : undefined;
  const refundOfTransactionId = kind === "refund" ? draft.refundOfTransactionId : undefined;
  onChange({ ...draft, kind, categoryId, targetAmount, targetCurrency, refundOfTransactionId });
}

function validCategoryId(data: AppData, kind: TransactionKind, categoryId?: string): string | undefined {
  if (!categoryId || !showsCategory(kind)) return undefined;
  return categoryOptions(data, kind).some((option) => option.value === categoryId) ? categoryId : undefined;
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

function currencyOptions(account: AppData["accounts"][number] | undefined): readonly FormOption[] {
  return (account ? accountCurrencyOptions(account) : []).map((currency) => option(currency, currency));
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

function changeAccount(accountId: string, data: AppData, draft: TransactionDraft, onChange: (draft: TransactionDraft) => void, setFieldErrors?: (update: (current: FieldErrors) => FieldErrors) => void): void {
  setFieldErrors?.((current) => withoutError(current, "accountId"));
  const account = data.accounts.find((item) => item.id === accountId);
  onChange({
    ...draft,
    accountId,
    currency: account ? currencyForAccount(account, draft.currency) as CurrencyCode : draft.currency,
  });
}

function validateDraftFields(draft: TransactionDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.accountId) errors.accountId = "请选择账户";
  if (!Number.isFinite(draft.amount) || draft.amount <= 0) errors.amount = "金额必须大于 0";
  if (!draft.currency) errors.currency = "请选择币种";
  if (draft.kind === "transfer") {
    if (!draft.relatedAccountId) errors.relatedAccountId = "请选择目标账户";
    const targetAmount = draft.targetAmount ?? draft.amount;
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) errors.targetAmount = "转入金额必须大于 0";
    if (!draft.targetCurrency && !draft.currency) errors.targetCurrency = "请选择转入币种";
  }
  return errors;
}

function firstErrorField(errors: FieldErrors): TransactionFieldName | undefined {
  return ERROR_FIELD_ORDER.find((field) => Boolean(errors[field]));
}

function focusField(formRef: React.RefObject<HTMLFormElement | null>, field: TransactionFieldName): void {
  window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[data-field-name="${field}"]`)?.focus({ preventScroll: false }));
}

function withoutError(errors: FieldErrors, field: TransactionFieldName): FieldErrors {
  if (!errors[field]) return errors;
  const next = { ...errors };
  delete next[field];
  return next;
}

function transferAccountPatch(
  data: AppData,
  draft: TransactionDraft,
  relatedAccountId: string,
): Partial<TransactionDraft> {
  const account = data.accounts.find((item) => item.id === relatedAccountId);
  return {
    relatedAccountId: relatedAccountId || undefined,
    targetCurrency: account ? currencyForAccount(account, draft.targetCurrency ?? draft.currency) as CurrencyCode : undefined,
  };
}
