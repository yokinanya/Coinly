import { BarChart3, ReceiptText } from "lucide-react";
import { useMemo, useState } from "react";
import { deleteTransaction, upsertTransaction } from "../domain/operations";
import { bumpVersion, createTransaction } from "../domain/factory";
import type { AppData, Transaction, TransactionDraft } from "../domain/types";
import { AnalysisDrawer } from "./AnalysisView";
import { ConfirmDialog, ErrorBanner, PageHeader } from "./common";
import { CreditStatementsDrawer } from "./CreditStatementsView";
import { dateOnly, money } from "./format";
import { TRANSACTION_KIND_LABELS } from "./labels";
import { Button, Checkbox, Drawer, Table } from "./metis";
import { TransactionForm } from "./TransactionForm";
import { draftFromTransaction } from "./transactionDraft";

export function TransactionsView(props: { readonly data: AppData; readonly setData: (data: AppData) => void }) {
  const [editing, setEditing] = useState<Transaction>();
  const [refunding, setRefunding] = useState<TransactionDraft>();
  const [deleting, setDeleting] = useState<Transaction>();
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [statementsOpen, setStatementsOpen] = useState(false);
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

  return (
    <section className="space-y-5">
      <PageHeader
        title="明细"
        actions={(
          <>
            <Button onClick={() => setAnalysisOpen(true)}><BarChart3 size={16} />分析</Button>
            <Button onClick={() => setStatementsOpen(true)}><ReceiptText size={16} />账期</Button>
            <Button variant="danger" disabled={selectedIds.length === 0} onClick={() => setBatchConfirmOpen(true)}>批量删除 {selectedIds.length || ""}</Button>
          </>
        )}
      />
      <ErrorBanner message={message} />
      <EditorDrawer
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
        description={`确认删除选中的 ${selectedIds.length} 条交易？`}
        onCancel={() => setBatchConfirmOpen(false)}
        onConfirm={() => deleteSelectedIds(props, selectedIds, setSelectedIds, setBatchConfirmOpen)}
      />
      <AnalysisDrawer open={analysisOpen} data={props.data} onClose={() => setAnalysisOpen(false)} />
      <CreditStatementsDrawer open={statementsOpen} data={props.data} setData={props.setData} onClose={() => setStatementsOpen(false)} />
    </section>
  );
}

function EditorDrawer(props: {
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
    <Drawer open={Boolean(props.value)} title="编辑交易" width={520} footer={footer} onClose={props.onCancel}>
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
    </Drawer>
  );
}

function currentDraft(
  transaction: Transaction | undefined,
  draftState: { readonly id: string; readonly draft: TransactionDraft } | undefined,
): TransactionDraft | undefined {
  if (!transaction) return undefined;
  return draftState?.id === transaction.id ? draftState.draft : draftFromTransaction(transaction);
}

function TransactionTable(props: {
  readonly data: AppData;
  readonly transactions: readonly Transaction[];
  readonly accounts: Record<string, string>;
  readonly categories: Record<string, string>;
  readonly selectedIds: readonly string[];
  readonly setSelectedIds: (ids: readonly string[]) => void;
  readonly onEdit: (transaction: Transaction) => void;
  readonly onRefund: (transaction: Transaction) => void;
  readonly onDelete: (transaction: Transaction) => void;
}) {
  return (
    <Table
      pagination={false}
      dataSource={[...props.transactions]}
      rowKey="id"
      scroll={{ x: 880 }}
      locale={{ emptyText: "暂无交易" }}
      columns={transactionColumns(props)}
    />
  );
}

function transactionColumns(props: {
  readonly data: AppData;
  readonly transactions: readonly Transaction[];
  readonly accounts: Record<string, string>;
  readonly categories: Record<string, string>;
  readonly selectedIds: readonly string[];
  readonly setSelectedIds: (ids: readonly string[]) => void;
  readonly onEdit: (transaction: Transaction) => void;
  readonly onRefund: (transaction: Transaction) => void;
  readonly onDelete: (transaction: Transaction) => void;
}) {
  return [
    {
      title: <Checkbox checked={allSelected(props.transactions, props.selectedIds)} onChange={(checked) => toggleAll(props.transactions, checked, props.setSelectedIds)} />,
      width: 56,
      render: (_value: unknown, row: Transaction) => (
        <Checkbox checked={props.selectedIds.includes(row.id)} onChange={(checked) => toggleOne(props.selectedIds, row.id, checked, props.setSelectedIds)} />
      ),
    },
    { title: "日期", dataIndex: "occurredAt", width: 110, render: (value: string) => dateOnly(value) },
    {
      title: "金额",
      dataIndex: "currency",
      width: 140,
      filter: {
        items: props.data.currencies.map((currency) => ({ label: currency, value: currency })),
        onFilter: (value: unknown, row: Transaction) => row.currency === value,
      },
      render: (_value: string, row: Transaction) => money(row.amount, row.currency),
    },
    {
      title: "账户",
      dataIndex: "accountId",
      width: 160,
      filter: {
        items: props.data.accounts.map((account) => ({ label: account.name, value: account.id })),
        onFilter: (value: unknown, row: Transaction) => row.accountId === value,
      },
      render: (value: string) => props.accounts[value] ?? "-",
    },
    {
      title: "分类",
      dataIndex: "categoryId",
      width: 160,
      filter: {
        items: props.data.categories.map((category) => ({ label: category.name, value: category.id })),
        onFilter: (value: unknown, row: Transaction) => row.categoryId === value,
      },
      render: (value?: string) => props.categories[value ?? ""] ?? "-",
    },
    {
      title: "类型",
      dataIndex: "kind",
      width: 120,
      filter: {
        items: Object.entries(TRANSACTION_KIND_LABELS).map(([value, label]) => ({ label, value })),
        onFilter: (value: unknown, row: Transaction) => row.kind === value,
      },
      render: (value: Transaction["kind"]) => TRANSACTION_KIND_LABELS[value],
    },
    { title: "备注", dataIndex: "note", render: (_value: string, row: Transaction) => row.note || "-" },
    {
      title: "操作",
      width: 210,
      render: (_value: unknown, row: Transaction) => (
        <span className="flex gap-2">
          <Button onClick={() => props.onEdit(row)}>编辑</Button>
          {row.kind === "expense" && <Button onClick={() => props.onRefund(row)}>退款</Button>}
          <Button variant="danger" onClick={() => props.onDelete(row)}>删除</Button>
        </span>
      ),
    },
  ];
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

function allSelected(transactions: readonly Transaction[], selectedIds: readonly string[]): boolean {
  return transactions.length > 0 && transactions.every((transaction) => selectedIds.includes(transaction.id));
}

function toggleAll(
  transactions: readonly Transaction[],
  checked: boolean,
  setSelectedIds: (ids: readonly string[]) => void,
): void {
  setSelectedIds(checked ? transactions.map((transaction) => transaction.id) : []);
}

function toggleOne(
  selectedIds: readonly string[],
  id: string,
  checked: boolean,
  setSelectedIds: (ids: readonly string[]) => void,
): void {
  if (checked) {
    setSelectedIds(selectedIds.includes(id) ? selectedIds : [...selectedIds, id]);
    return;
  }
  setSelectedIds(selectedIds.filter((item) => item !== id));
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
