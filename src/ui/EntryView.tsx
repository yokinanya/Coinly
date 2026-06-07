import { useState } from "react";
import { createTransaction } from "../domain/factory";
import { upsertTransaction, validateTransactionDraft as validateDraft } from "../domain/operations";
import type { AppData, TransactionDraft } from "../domain/types";
import { MessageBanner, PageHeader } from "./common";
import type { StatusMessage } from "./common";
import { Message } from "./toastApi";
import { TransactionForm } from "./TransactionForm";
import { initialEntryDraft, withRecentEntry } from "./entryDraftMemory";
import { useAutoDismissStatus } from "./useAutoDismissMessage";

interface EntryViewProps {
  readonly data: AppData;
  readonly setData: (data: AppData) => void;
}

export function EntryView(props: EntryViewProps) {
  const [draft, setDraft] = useState(() => initialEntryDraft(props.data));
  const [message, setMessage] = useState<StatusMessage>();
  const [saving, setSaving] = useState(false);
  useAutoDismissStatus(message, () => setMessage(undefined));
  const saveDraft = () => saveTransactionDraft({ props, draft, saving, setDraft, setMessage, setSaving });

  return (
    <section className="space-y-5">
      <PageHeader title="记账" />
      {message?.text && <MessageBanner message={message.text} tone={message.tone} />}
      <TransactionForm data={props.data} draft={draft} onChange={setDraft} onSubmit={saveDraft} submitLabel="保存交易" submitting={saving} />
    </section>
  );
}

function saveTransactionDraft(options: {
  readonly props: EntryViewProps;
  readonly draft: TransactionDraft;
  readonly saving: boolean;
  readonly setDraft: (draft: TransactionDraft) => void;
  readonly setMessage: (value: StatusMessage) => void;
  readonly setSaving: (value: boolean) => void;
}) {
  if (options.saving) return;
  options.setSaving(true);
  const result = validateDraft(options.props.data, options.draft);
  if (!result.valid) {
    const text = result.errors.join("；");
    options.setMessage({ tone: "error", text });
    Message.error(text);
    options.setSaving(false);
    return;
  }
  const updated = withRecentEntry(upsertTransaction(options.props.data, createTransaction(options.draft)), options.draft);
  options.props.setData(updated);
  options.setDraft(initialEntryDraft(updated));
  options.setMessage({ tone: "success", text: "交易已保存" });
  Message.success("交易已保存");
  window.setTimeout(() => options.setSaving(false), 200);
}