import { ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { deleteTransaction, upsertTransaction } from "../domain/operations";
import { bumpVersion, createTransaction } from "../domain/factory";
import type { AppData, Transaction, TransactionDraft } from "../domain/types";
import { ConfirmDialog, ErrorBanner, PageHeader } from "./common";
import { TRANSACTION_KIND_LABELS } from "./labels";
import { Button, Drawer, Modal } from "./components";
import { TransactionTable } from "./TransactionTable";
import { TransactionForm } from "./TransactionForm";
import { visibleSelectedCount, visibleSelectedIds } from "./transactionSelection";
import { draftFromTransaction } from "./transactionDraft";
import { VIEW_PATHS, type ViewId } from "./appRoutes";

export function TransactionsView(props: { readonly data: AppData; readonly setData: (data: AppData) => void; readonly setViewId: (id: ViewId) => void }) {
  const [editing, setEditing] = useState<Transaction>();
  const [refunding, setRefunding] = useState<TransactionDraft>();
  const [deleting, setDeleting] = useState<Transaction>();
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false);
  const [message, setMessage] = useState("");
  const accounts = Object.fromEntries(props.data.accounts.map((item) => [item.id, item.name]));
  const categories = Object.fromEntries(props.data.categories.map((item) => [item.id, item.name]));
  const locationSearch = window.location.search;
  const statsFilter = useMemo(() => filterFromUrl(locationSearch), [locationSearch]);
  const filteredTransactions = useMemo(() => {
    return props.data.transactions.filter((transaction) => matchesStatsFilter(transaction, statsFilter));
  }, [props.data.transactions, statsFilter]);
  const selectedVisibleCount = visibleSelectedCount(selectedIds, filteredTransactions);

  return (
    <section className="space-y-5">
      <PageHeader
        title="明细"
        actions={(
          <>
            <Button onClick={() => openStatements(props.setViewId)}><ReceiptText size={16} />账期</Button>
            <Button variant="danger" disabled={selectedVisibleCount === 0} onClick={() => setBatchConfirmOpen(true)}>批量删除 {selectedVisibleCount || ""}</Button>
          </>
        )}
      />
      <ErrorBanner message={message} />
      <EditorModal
        data={props.data}
        value={editing}
        onCancel={() => setEditing(undefined)}
        onSave={(draft) => editing && saveTransaction({ props, original: editing, draft, setEditing, setMessage })}
      />
      <RefundDrawer
        data={props.data}
        draft={refunding}
        onCancel={() => setRefunding(undefined)}
        onSave={(draft) => saveRefund({ props, draft, setRefunding, setMessage })}
      />
      <TransactionTable
        data={props.data}
        transactions={filteredTransactions}
        accounts={accounts}
        categories={categories}
        selectedIds={selectedIds}
        setSelectedIds={setSelectedIds}
        onEdit={setEditing}
        onRefund={(transaction) => setRefunding(refundDraftFromTransaction(transaction))}
        onDelete={setDeleting}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="删除交易"
        description={`确认删除“${deleting?.note || (deleting ? TRANSACTION_KIND_LABELS[deleting.kind] : "")}”？`}
        onCancel={() => setDeleting(undefined)}
        onConfirm={() => deleteSelected(props, deleting, setDeleting)}
      />
      <ConfirmDialog
        open={batchConfirmOpen}
        title="批量删除交易"
        description={`确认删除选中的 ${selectedVisibleCount} 条交易？`}
        onCancel={() => setBatchConfirmOpen(false)}
        onConfirm={() => deleteSelectedIds(props, visibleSelectedIds(selectedIds, filteredTransactions), setSelectedIds, setBatchConfirmOpen)}
      />
    </section>
  );
}

function openStatements(setViewId: (id: ViewId) => void): void {
  window.history.pushState(null, "", VIEW_PATHS.statements);
  setViewId("statements");
}

function EditorModal(props: {
  readonly data: AppData;
  readonly value?: Transaction;
  readonly onCancel: () => void;
  readonly onSave: (value: TransactionDraft) => void;
}) {
  const [draftState, setDraftState] = useState<{ readonly id: string; readonly draft: TransactionDraft }>();
  const editing = props.value;
  const current = currentDraft(editing, draftState);
  const footer = current
    ? <div className="flex justify-end gap-2"><Button onClick={props.onCancel}>取消</Button><Button variant="primary" onClick={() => props.onSave(current)}>保存</Button></div>
    : undefined;
  return (
    <Modal open={Boolean(props.value)} title="编辑交易" width="min(44rem, calc(100vw - 2rem))" footer={footer} onCancel={props.onCancel}>
      {current && editing && (
        <TransactionForm
          embedded
          data={props.data}
          draft={current}
          onChange={(draft) => setDraftState({ id: editing.id, draft })}
          onSubmit={() => props.onSave(current)}
          submitLabel="保存修改"
        />
      )}
    </Modal>
  );
}

function currentDraft(
  transaction: Transaction | undefined,
  draftState: { readonly id: string; readonly draft: TransactionDraft } | undefined,
): TransactionDraft | undefined {
  if (!transaction) return undefined;
  return draftState?.id === transaction.id ? draftState.draft : draftFromTransaction(transaction);
}

function RefundDrawer(props: {
  readonly data: AppData;
  readonly draft?: TransactionDraft;
  readonly onCancel: () => void;
  readonly onSave: (value: TransactionDraft) => void;
}) {
  const [draftState, setDraftState] = useState<{ readonly id?: string; readonly draft: TransactionDraft }>();
  const current = currentRefundDraft(props.draft, draftState);
  const footer = current
    ? <div className="flex justify-end gap-2"><Button onClick={props.onCancel}>取消</Button><Button variant="primary" onClick={() => props.onSave(current)}>保存退款</Button></div>
    : undefined;
  return (
    <Drawer open={Boolean(props.draft)} title="记录退款" width={520} footer={footer} onClose={props.onCancel}>
      {current && <TransactionForm embedded data={props.data} draft={current} onChange={(draft) => setDraftState({ id: props.draft?.refundOfTransactionId, draft })} onSubmit={() => props.onSave(current)} submitLabel="保存退款" />}
    </Drawer>
  );
}

function currentRefundDraft(
  draft: TransactionDraft | undefined,
  draftState: { readonly id?: string; readonly draft: TransactionDraft } | undefined,
): TransactionDraft | undefined {
  if (!draft) return undefined;
  if (draftState && draftState.id === draft.refundOfTransactionId) {
    return draftState.draft;
  }
  return draft;
}

function refundDraftFromTransaction(transaction: Transaction): TransactionDraft {
  return {
    kind: "refund",
    accountId: transaction.accountId,
    amount: transaction.amount,
    currency: transaction.currency,
    occurredAt: new Date().toISOString(),
    categoryId: transaction.categoryId,
    tagIds: transaction.tagIds,
    note: transaction.note ? `退款：${transaction.note}` : "退款",
    refundOfTransactionId: transaction.id,
  };
}

interface UrlFilter {
  readonly categoryId?: string;
  readonly tagId?: string;
  readonly currency?: string;
}

function filterFromUrl(search: string): UrlFilter {
  const params = new URLSearchParams(search);
  return {
    categoryId: params.get("categoryId") ?? undefined,
    tagId: params.get("tagId") ?? undefined,
    currency: params.get("currency") ?? undefined,
  };
}

function matchesStatsFilter(transaction: Transaction, filter: UrlFilter): boolean {
  if (filter.currency && transaction.currency !== filter.currency) return false;
  if (filter.categoryId && transaction.categoryId !== filter.categoryId) return false;
  if (filter.tagId && !transaction.tagIds.includes(filter.tagId)) return false;
  return true;
}

function saveTransaction(options: {
  readonly props: { readonly data: AppData; readonly setData: (data: AppData) => void };
  readonly original: Transaction;
  readonly draft: TransactionDraft;
  readonly setEditing: (value: undefined) => void;
  readonly setMessage: (value: string) => void;
}) {
  try {
    const transaction = { ...options.original, ...options.draft, updatedAt: new Date().toISOString() };
    options.props.setData(upsertTransaction(options.props.data, transaction));
    options.setEditing(undefined);
    options.setMessage("");
  } catch (error) {
    options.setMessage(error instanceof Error ? error.message : "交易保存失败");
  }
}

function saveRefund(options: {
  readonly props: { readonly data: AppData; readonly setData: (data: AppData) => void };
  readonly draft: TransactionDraft;
  readonly setRefunding: (value: undefined) => void;
  readonly setMessage: (value: string) => void;
}) {
  try {
    options.props.setData(upsertTransaction(options.props.data, createTransaction(options.draft)));
    options.setRefunding(undefined);
    options.setMessage("");
  } catch (error) {
    options.setMessage(error instanceof Error ? error.message : "退款保存失败");
  }
}

function deleteSelected(
  props: { readonly data: AppData; readonly setData: (data: AppData) => void },
  transaction: Transaction | undefined,
  setDeleting: (value: undefined) => void,
) {
  if (!transaction) return;
  props.setData(deleteTransaction(props.data, transaction.id));
  setDeleting(undefined);
}

function deleteSelectedIds(
  props: { readonly data: AppData; readonly setData: (data: AppData) => void },
  ids: readonly string[],
  setSelectedIds: (value: readonly string[]) => void,
  setBatchConfirmOpen: (value: boolean) => void,
) {
  const idSet = new Set(ids);
  props.setData(bumpVersion({
    ...props.data,
    transactions: props.data.transactions.filter((transaction) => !idSet.has(transaction.id)),
  }));
  setSelectedIds([]);
  setBatchConfirmOpen(false);
}
