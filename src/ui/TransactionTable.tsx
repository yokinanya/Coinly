import { memo, useMemo, useState } from "react";
import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import type { AppData, Transaction } from "../domain/types";
import { dateOnly, money } from "./format";
import { TRANSACTION_KIND_LABELS } from "./labels";
import { Button, Checkbox, Select } from "./components";
import { EmptyState } from "./common";
import { visibleSelectedIds } from "./transactionSelection";

const DEFAULT_PAGE_SIZE = 50;
const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;

interface TransactionTableProps {
  readonly data: AppData;
  readonly transactions: readonly Transaction[];
  readonly accounts: Record<string, string>;
  readonly categories: Record<string, string>;
  readonly selectedIds: readonly string[];
  readonly setSelectedIds: (ids: readonly string[]) => void;
  readonly onEdit: (transaction: Transaction) => void;
  readonly onRefund: (transaction: Transaction) => void;
  readonly onDelete: (transaction: Transaction) => void;
}

interface Filters {
  readonly currency: string;
  readonly accountId: string;
  readonly categoryId: string;
  readonly kind: string;
}

export function TransactionTable(props: TransactionTableProps) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(1);
  const rows = useMemo(() => filteredRows(sortByOccurredAt(props.transactions), filters), [filters, props.transactions]);
  const pageRows = useMemo(() => currentPageRows(rows, page, pageSize), [page, pageSize, rows]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const activeFilters = hasActiveFilters(filters);
  return (
    <div className="panel overflow-hidden">
      <TableFilters data={props.data} filters={filters} setFilters={(value) => updateFilters(value, setFilters, setPage, props, rows)} />
      <RowsTable {...props} rows={pageRows} emptyAction={activeFilters ? { label: "清空筛选", onClick: () => clearFilters(setFilters, setPage, props.setSelectedIds) } : undefined} />
      <TablePager page={page} pages={pages} pageSize={pageSize} total={rows.length} setPage={setPage} setPageSize={setPageSize} />
    </div>
  );
}

const EMPTY_FILTERS: Filters = { currency: "", accountId: "", categoryId: "", kind: "" };

function TableFilters(props: {
  readonly data: AppData;
  readonly filters: Filters;
  readonly setFilters: (filters: Filters) => void;
}) {
  return (
    <div className="grid gap-2 border-b border-(--color-border) p-3 sm:grid-cols-4">
      <Select value={props.filters.currency} options={currencyOptions(props.data)} onChange={(value) => props.setFilters({ ...props.filters, currency: String(value) })} />
      <Select value={props.filters.accountId} options={entityOptions(props.data.accounts, "全部账户")} onChange={(value) => props.setFilters({ ...props.filters, accountId: String(value) })} />
      <Select value={props.filters.categoryId} options={entityOptions(props.data.categories, "全部分类")} onChange={(value) => props.setFilters({ ...props.filters, categoryId: String(value) })} />
      <Select value={props.filters.kind} options={kindOptions()} onChange={(value) => props.setFilters({ ...props.filters, kind: String(value) })} />
    </div>
  );
}

function RowsTable(props: TransactionTableProps & { readonly rows: readonly Transaction[]; readonly emptyAction?: { readonly label: string; readonly onClick: () => void } }) {
  if (props.rows.length === 0) {
    return <div className="p-3"><EmptyState action={props.emptyAction}>{props.emptyAction ? "没有符合条件的交易。" : "暂无交易。"}</EmptyState></div>;
  }
  return (
    <>
      <DesktopRowsTable {...props} />
      <MobileRowsList {...props} />
    </>
  );
}

function DesktopRowsTable(props: TransactionTableProps & { readonly rows: readonly Transaction[] }) {
  return (
    <div className="hidden overflow-x-auto md:block">
      <table className="w-full min-w-220 border-collapse text-sm">
        <thead className="bg-(--color-surface-muted) text-left text-xs text-(--color-text-secondary)">
          <tr>{HEADERS.map((header) => <th key={header} className="px-3 py-2 font-semibold">{header}</th>)}</tr>
        </thead>
        <tbody>{props.rows.map((row) => <TransactionRow key={row.id} {...props} row={row} />)}</tbody>
      </table>
    </div>
  );
}

function MobileRowsList(props: TransactionTableProps & { readonly rows: readonly Transaction[] }) {
  return (
    <div className="grid min-w-0 gap-3 p-3 md:hidden">
      {props.rows.map((row) => <TransactionCard key={row.id} {...props} row={row} />)}
    </div>
  );
}

const HEADERS = ["", "日期", "金额", "账户", "分类", "类型", "备注", "操作"] as const;

const TransactionRow = memo(function TransactionRow(props: TransactionTableProps & { readonly row: Transaction; readonly rows: readonly Transaction[] }) {
  const row = props.row;
  const selected = props.selectedIds.includes(row.id);
  return (
    <tr className={`border-t border-(--color-border) transition hover:bg-(--color-surface-muted) ${selected ? "bg-(--color-accent-soft)" : ""}`}>
      <td className="px-3 py-2"><Checkbox checked={selected} onChange={(checked) => toggleOne(props.selectedIds, row.id, checked, props.setSelectedIds)} /></td>
      <td className="px-3 py-2">{dateOnly(row.occurredAt)}</td>
      <td className="px-3 py-2 tabular-nums">{money(row.amount, row.currency)}</td>
      <td className="px-3 py-2">{props.accounts[row.accountId] ?? "-"}</td>
      <td className="px-3 py-2">{props.categories[row.categoryId ?? ""] ?? "-"}</td>
      <td className="px-3 py-2">{TRANSACTION_KIND_LABELS[row.kind]}</td>
      <td className="max-w-64 truncate px-3 py-2" title={row.note || undefined}>{row.note || "-"}</td>
      <td className="px-3 py-2"><RowActions row={row} edit={props.onEdit} refund={props.onRefund} remove={props.onDelete} /></td>
    </tr>
  );
});

const TransactionCard = memo(function TransactionCard(props: TransactionTableProps & { readonly row: Transaction; readonly rows: readonly Transaction[] }) {
  const row = props.row;
  const selected = props.selectedIds.includes(row.id);
  return (
    <article className={`row-card min-w-0 overflow-hidden p-3 ${selected ? "border-(--color-accent) bg-(--color-accent-soft)" : ""}`}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Checkbox checked={selected} onChange={(checked) => toggleOne(props.selectedIds, row.id, checked, props.setSelectedIds)} />
            <span className="min-w-0 truncate text-xs text-(--color-text-secondary)">{dateOnly(row.occurredAt)} · {TRANSACTION_KIND_LABELS[row.kind]}</span>
          </div>
          <div className="mt-2 line-clamp-2 wrap-break-word text-sm font-medium" title={row.note || undefined}>{row.note || "无备注"}</div>
        </div>
        <div className="max-w-34 shrink-0 truncate text-right font-semibold tabular-nums">{money(row.amount, row.currency)}</div>
      </div>
      <div className="mt-3 grid min-w-0 gap-1 text-xs text-(--color-text-secondary)">
        <span className="truncate">账户：{props.accounts[row.accountId] ?? "-"}</span>
        <span className="truncate">分类：{props.categories[row.categoryId ?? ""] ?? "-"}</span>
      </div>
      <div className="mt-3 flex flex-nowrap gap-2 border-t border-(--color-border) pt-3">
        <CompactActionButton label="编辑" icon={<Pencil size={14} />} onClick={() => props.onEdit(row)} />
        {row.kind === "expense" && <CompactActionButton label="退款" icon={<RotateCcw size={14} />} onClick={() => props.onRefund(row)} />}
        <CompactActionButton label="删除" icon={<Trash2 size={14} />} variant="danger" onClick={() => props.onDelete(row)} />
      </div>
    </article>
  );
});

function RowActions(props: {
  readonly row: Transaction;
  readonly edit: (transaction: Transaction) => void;
  readonly refund: (transaction: Transaction) => void;
  readonly remove: (transaction: Transaction) => void;
}) {
  return (
    <span className="flex flex-nowrap items-center gap-1 whitespace-nowrap">
      <CompactActionButton label="编辑" icon={<Pencil size={14} />} onClick={() => props.edit(props.row)} />
      {props.row.kind === "expense" && <CompactActionButton label="退款" icon={<RotateCcw size={14} />} onClick={() => props.refund(props.row)} />}
      <CompactActionButton label="删除" icon={<Trash2 size={14} />} variant="danger" onClick={() => props.remove(props.row)} />
    </span>
  );
}

function CompactActionButton(props: {
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly variant?: "danger";
  readonly onClick: () => void;
}) {
  return (
    <Button
      className={`min-w-0 gap-1 px-2 text-xs whitespace-nowrap ${props.variant === "danger" ? "shrink-0" : "shrink-0"}`}
      variant={props.variant}
      title={props.label}
      aria-label={props.label}
      onClick={props.onClick}
    >
      {props.icon}
      <span className="hidden xl:inline">{props.label}</span>
    </Button>
  );
}

function TablePager(props: {
  readonly page: number;
  readonly pages: number;
  readonly pageSize: number;
  readonly total: number;
  readonly setPage: (page: number) => void;
  readonly setPageSize: (pageSize: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-(--color-border) p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <span className="text-(--color-text-secondary)">共 {props.total} 条，第 {props.page} / {props.pages} 页</span>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={String(props.pageSize)} options={PAGE_SIZE_OPTIONS.map((value) => ({ value: String(value), label: `${value} / 页` }))} onChange={(value) => props.setPageSize(Number(value))} />
        <Button disabled={props.page <= 1} onClick={() => props.setPage(props.page - 1)}>上一页</Button>
        <Button disabled={props.page >= props.pages} onClick={() => props.setPage(props.page + 1)}>下一页</Button>
      </div>
    </div>
  );
}

function updateFilters(
  filters: Filters,
  setFilters: (filters: Filters) => void,
  setPage: (page: number) => void,
  props: TransactionTableProps,
  currentRows: readonly Transaction[],
): void {
  setFilters(filters);
  setPage(1);
  props.setSelectedIds(visibleSelectedIds(props.selectedIds, currentRows));
}

function clearFilters(setFilters: (filters: Filters) => void, setPage: (page: number) => void, setSelectedIds: (ids: readonly string[]) => void): void {
  setFilters(EMPTY_FILTERS);
  setPage(1);
  setSelectedIds([]);
}

function hasActiveFilters(filters: Filters): boolean {
  return Boolean(filters.currency || filters.accountId || filters.categoryId || filters.kind);
}

function sortByOccurredAt(transactions: readonly Transaction[]): readonly Transaction[] {
  return [...transactions].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.createdAt.localeCompare(left.createdAt));
}

function filteredRows(rows: readonly Transaction[], filters: Filters): readonly Transaction[] {
  return rows.filter((row) => matches(row, filters));
}

function matches(row: Transaction, filters: Filters): boolean {
  if (filters.currency && row.currency !== filters.currency) return false;
  if (filters.accountId && row.accountId !== filters.accountId) return false;
  if (filters.categoryId && row.categoryId !== filters.categoryId) return false;
  if (filters.kind && row.kind !== filters.kind) return false;
  return true;
}

function currentPageRows(rows: readonly Transaction[], page: number, pageSize: number): readonly Transaction[] {
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

function toggleOne(selectedIds: readonly string[], id: string, checked: boolean, setSelectedIds: (ids: readonly string[]) => void): void {
  if (checked) return setSelectedIds(selectedIds.includes(id) ? selectedIds : [...selectedIds, id]);
  setSelectedIds(selectedIds.filter((item) => item !== id));
}

function currencyOptions(data: AppData) {
  return [{ value: "", label: "全部币种" }, ...data.currencies.map((currency) => ({ value: currency, label: currency }))];
}

function entityOptions(items: readonly { readonly id: string; readonly name: string }[], label: string) {
  return [{ value: "", label }, ...items.map((item) => ({ value: item.id, label: item.name }))];
}

function kindOptions() {
  return [{ value: "", label: "全部类型" }, ...Object.entries(TRANSACTION_KIND_LABELS).map(([value, label]) => ({ value, label }))];
}
