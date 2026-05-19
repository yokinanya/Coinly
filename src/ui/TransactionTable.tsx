import { useMemo, useState } from "react";
import type { AppData, Transaction } from "../domain/types";
import { dateOnly, money } from "./format";
import { TRANSACTION_KIND_LABELS } from "./labels";
import { Button, Checkbox, Table } from "./metis";
import { visibleSelectedIds } from "./transactionSelection";

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [50, 100, 200];

export function TransactionTable(props: {
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
  const [tableState, setTableState] = useState<TableState>();
  const sortedTransactions = useMemo(() => sortByOccurredAt(props.transactions), [props.transactions]);
  const visibleTransactions = tableState?.source === sortedTransactions ? tableState.rows : sortedTransactions;
  const pageTransactions = currentPageRows(visibleTransactions, tableState?.pagination ?? {});

  return (
    <Table
      pagination={{
        defaultPageSize: DEFAULT_PAGE_SIZE,
        showSizeChanger: true,
        pageSizeOptions: PAGE_SIZE_OPTIONS,
        total: sortedTransactions.length,
      }}
      dataSource={sortedTransactions}
      rowKey="id"
      scroll={{ x: 880 }}
      locale={{ emptyText: "暂无交易" }}
      columns={transactionColumns({ ...props, pageTransactions })}
      onChange={(pagination, _filters, _sorter, extra) => {
        setTableState({ source: sortedTransactions, rows: extra.currentDataSource, pagination });
        props.setSelectedIds(visibleSelectedIds(props.selectedIds, extra.currentDataSource));
      }}
    />
  );
}

function sortByOccurredAt(transactions: readonly Transaction[]): readonly Transaction[] {
  return [...transactions].sort((left, right) => {
    return right.occurredAt.localeCompare(left.occurredAt) || right.createdAt.localeCompare(left.createdAt);
  });
}

interface TableState {
  readonly source: readonly Transaction[];
  readonly rows: readonly Transaction[];
  readonly pagination: { readonly current?: number; readonly pageSize?: number };
}

function transactionColumns(props: {
  readonly data: AppData;
  readonly transactions: readonly Transaction[];
  readonly accounts: Record<string, string>;
  readonly categories: Record<string, string>;
  readonly selectedIds: readonly string[];
  readonly pageTransactions: readonly Transaction[];
  readonly setSelectedIds: (ids: readonly string[]) => void;
  readonly onEdit: (transaction: Transaction) => void;
  readonly onRefund: (transaction: Transaction) => void;
  readonly onDelete: (transaction: Transaction) => void;
}) {
  return [
    {
      title: <Checkbox checked={allSelected(props.pageTransactions, props.selectedIds)} onChange={(checked) => toggleAll(props, checked)} />,
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

function currentPageRows(
  rows: readonly Transaction[],
  pagination: { readonly current?: number; readonly pageSize?: number },
): readonly Transaction[] {
  const current = pagination.current ?? 1;
  const pageSize = pagination.pageSize ?? DEFAULT_PAGE_SIZE;
  return rows.slice((current - 1) * pageSize, current * pageSize);
}

function allSelected(transactions: readonly Transaction[], selectedIds: readonly string[]): boolean {
  return transactions.length > 0 && transactions.every((transaction) => selectedIds.includes(transaction.id));
}

function toggleAll(
  props: {
    readonly pageTransactions: readonly Transaction[];
    readonly selectedIds: readonly string[];
    readonly setSelectedIds: (ids: readonly string[]) => void;
  },
  checked: boolean,
): void {
  const pageIds = new Set(props.pageTransactions.map((transaction) => transaction.id));
  if (!checked) {
    props.setSelectedIds(props.selectedIds.filter((id) => !pageIds.has(id)));
    return;
  }
  props.setSelectedIds([...new Set([...props.selectedIds, ...pageIds])]);
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
