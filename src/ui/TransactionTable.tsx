import { memo, useMemo, useState } from "react";
import { Pencil, RotateCcw, SlidersHorizontal, Trash2 } from "lucide-react";
import type { AppData, Transaction } from "../domain/types";
import { dateOnly, money } from "./format";
import { TRANSACTION_KIND_LABELS } from "./labels";
import { Button, Checkbox, Input, Select } from "./components";
import { EmptyState } from "./common";
import { visibleSelectedIds } from "./transactionSelection";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100, 200] as const;

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
  readonly query: string;
  readonly currency: string;
  readonly accountId: string;
  readonly categoryId: string;
  readonly tagId: string;
  readonly kind: string;
}

export function TransactionTable(props: TransactionTableProps) {
  const [filters, setFilters] = useState<Filters>(() => filtersFromUrl(window.location.search));
  const [pageSize, setPageSize] = useState(() => pageSizeFromUrl(window.location.search));
  const [page, setPage] = useState(() => pageFromUrl(window.location.search));
  const [advancedOpen, setAdvancedOpen] = useState(() => hasAdvancedFilters(filtersFromUrl(window.location.search)));
  const rows = useMemo(() => filteredRows(sortByOccurredAt(props.transactions), filters, props.accounts, props.categories), [filters, props.accounts, props.categories, props.transactions]);
  const pageRows = useMemo(() => currentPageRows(rows, page, pageSize), [page, pageSize, rows]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const activeFilters = hasActiveFilters(filters);
  const applyFilters = (value: Filters) => updateFilters(value, setFilters, setPage, props, pageSize);
  const changePage = (value: number) => {
    setPage(value);
    syncTableUrl(filters, value, pageSize);
  };
  const changePageSize = (value: number) => {
    setPageSize(value);
    setPage(1);
    syncTableUrl(filters, 1, value);
  };
  return (
    <div className="panel overflow-hidden">
      <TableFilters data={props.data} filters={filters} advancedOpen={advancedOpen} setAdvancedOpen={setAdvancedOpen} setFilters={applyFilters} />
      <RowsTable {...props} rows={pageRows} emptyAction={activeFilters ? { label: "清空筛选", onClick: () => clearFilters(setFilters, setPage, props.setSelectedIds, pageSize) } : undefined} />
      <TablePager page={page} pages={pages} pageSize={pageSize} total={rows.length} setPage={changePage} setPageSize={changePageSize} />
    </div>
  );
}

const EMPTY_FILTERS: Filters = { query: "", currency: "", accountId: "", categoryId: "", tagId: "", kind: "" };

function TableFilters(props: {
  readonly data: AppData;
  readonly filters: Filters;
  readonly advancedOpen: boolean;
  readonly setAdvancedOpen: (open: boolean) => void;
  readonly setFilters: (filters: Filters) => void;
}) {
  const advancedCount = advancedFilterCount(props.filters);
  return (
    <div className="space-y-3 border-b border-(--color-border) p-3">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
        <Input name="transaction-search" autoComplete="off" value={props.filters.query} placeholder="搜索备注、账户、分类、金额…" aria-label="搜索交易" onChange={(query) => props.setFilters({ ...props.filters, query: String(query) })} />
        <Button aria-expanded={props.advancedOpen} aria-controls="transaction-advanced-filters" onClick={() => props.setAdvancedOpen(!props.advancedOpen)}>
          <SlidersHorizontal size={16} aria-hidden="true" />筛选{advancedCount > 0 ? ` ${advancedCount}` : ""}
        </Button>
      </div>
      {props.advancedOpen && (
        <div id="transaction-advanced-filters" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          <Select aria-label="按币种筛选" value={props.filters.currency} options={currencyOptions(props.data)} onChange={(value) => props.setFilters({ ...props.filters, currency: String(value) })} />
          <Select aria-label="按账户筛选" value={props.filters.accountId} options={entityOptions(props.data.accounts, "全部账户")} onChange={(value) => props.setFilters({ ...props.filters, accountId: String(value) })} />
          <Select aria-label="按分类筛选" value={props.filters.categoryId} options={entityOptions(props.data.categories, "全部分类")} onChange={(value) => props.setFilters({ ...props.filters, categoryId: String(value) })} />
          <Select aria-label="按标签筛选" value={props.filters.tagId} options={entityOptions(props.data.tags, "全部标签")} onChange={(value) => props.setFilters({ ...props.filters, tagId: String(value) })} />
          <Select aria-label="按类型筛选" value={props.filters.kind} options={kindOptions()} onChange={(value) => props.setFilters({ ...props.filters, kind: String(value) })} />
        </div>
      )}
      <FilterSummary data={props.data} filters={props.filters} clear={() => props.setFilters(EMPTY_FILTERS)} />
    </div>
  );
}

function FilterSummary(props: { readonly data: AppData; readonly filters: Filters; readonly clear: () => void }) {
  const labels = activeFilterLabels(props.data, props.filters);
  if (labels.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-(--color-text-secondary)">
      <span>正在筛选</span>
      {labels.map((label) => <span key={label} className="rounded bg-(--color-surface-muted) px-2 py-1 text-(--color-text)">{label}</span>)}
      <Button className="min-h-8 px-2 text-xs" variant="ghost" onClick={props.clear}>清空</Button>
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
    <div className="grid min-w-0 gap-2 p-2 md:hidden">
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
      <td className="px-3 py-2"><Checkbox ariaLabel={`选择交易 ${row.note || TRANSACTION_KIND_LABELS[row.kind]}`} checked={selected} onChange={(checked) => toggleOne(props.selectedIds, row.id, checked, props.setSelectedIds)} /></td>
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
    <article className={`row-card min-w-0 overflow-hidden p-2.5 ${selected ? "border-(--color-accent) bg-(--color-accent-soft)" : ""}`}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <Checkbox ariaLabel={`选择交易 ${row.note || TRANSACTION_KIND_LABELS[row.kind]}`} checked={selected} onChange={(checked) => toggleOne(props.selectedIds, row.id, checked, props.setSelectedIds)} />
            <span className="min-w-0 truncate text-xs text-(--color-text-secondary)">{dateOnly(row.occurredAt)} · {TRANSACTION_KIND_LABELS[row.kind]}</span>
          </div>
          <div className="mt-1 truncate text-sm font-medium" title={row.note || undefined}>{row.note || "无备注"}</div>
        </div>
        <div className="max-w-34 shrink-0 truncate text-right font-semibold tabular-nums">{money(row.amount, row.currency)}</div>
      </div>
      <div className="mt-2 flex min-w-0 gap-3 text-xs text-(--color-text-secondary)">
        <span className="min-w-0 truncate">账户：{props.accounts[row.accountId] ?? "-"}</span>
        <span className="min-w-0 truncate">分类：{props.categories[row.categoryId ?? ""] ?? "-"}</span>
      </div>
      <div className="mt-1 flex flex-nowrap justify-end gap-1">
        <CompactActionButton compact label="编辑" icon={<Pencil size={16} />} onClick={() => props.onEdit(row)} />
        {row.kind === "expense" && <CompactActionButton compact label="退款" icon={<RotateCcw size={16} />} onClick={() => props.onRefund(row)} />}
        <CompactActionButton compact label="删除" icon={<Trash2 size={16} />} variant="danger" onClick={() => props.onDelete(row)} />
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
  readonly compact?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <Button
      className={`shrink-0 whitespace-nowrap ${props.compact ? "ui-button-compact h-8 w-8 min-w-8 px-0" : "min-w-0 gap-1 px-2 text-xs"}`}
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
      <div className="flex items-center gap-2">
        <span className="w-28 shrink-0">
          <Select value={String(props.pageSize)} options={PAGE_SIZE_OPTIONS.map((value) => ({ value: String(value), label: `${value} / 页` }))} onChange={(value) => props.setPageSize(Number(value))} />
        </span>
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
  pageSize: number,
): void {
  const nextRows = filteredRows(sortByOccurredAt(props.transactions), filters, props.accounts, props.categories);
  setFilters(filters);
  setPage(1);
  props.setSelectedIds(visibleSelectedIds(props.selectedIds, nextRows));
  syncTableUrl(filters, 1, pageSize);
}

function clearFilters(setFilters: (filters: Filters) => void, setPage: (page: number) => void, setSelectedIds: (ids: readonly string[]) => void, pageSize: number): void {
  setFilters(EMPTY_FILTERS);
  setPage(1);
  setSelectedIds([]);
  syncTableUrl(EMPTY_FILTERS, 1, pageSize);
}

function hasActiveFilters(filters: Filters): boolean {
  return Boolean(filters.query.trim() || hasAdvancedFilters(filters));
}

function hasAdvancedFilters(filters: Filters): boolean {
  return advancedFilterCount(filters) > 0;
}

function advancedFilterCount(filters: Filters): number {
  return [filters.currency, filters.accountId, filters.categoryId, filters.tagId, filters.kind].filter(Boolean).length;
}

function sortByOccurredAt(transactions: readonly Transaction[]): readonly Transaction[] {
  return [...transactions].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt) || right.createdAt.localeCompare(left.createdAt));
}

function filteredRows(rows: readonly Transaction[], filters: Filters, accounts: Record<string, string>, categories: Record<string, string>): readonly Transaction[] {
  return rows.filter((row) => matches(row, filters, accounts, categories));
}

function matches(row: Transaction, filters: Filters, accounts: Record<string, string>, categories: Record<string, string>): boolean {
  if (filters.currency && row.currency !== filters.currency) return false;
  if (filters.accountId && row.accountId !== filters.accountId) return false;
  if (filters.categoryId && row.categoryId !== filters.categoryId) return false;
  if (filters.tagId && !row.tagIds.includes(filters.tagId)) return false;
  if (filters.kind && row.kind !== filters.kind) return false;
  if (!matchesQuery(row, filters.query, accounts, categories)) return false;
  return true;
}

function matchesQuery(row: Transaction, query: string, accounts: Record<string, string>, categories: Record<string, string>): boolean {
  const normalized = normalizeSearch(query);
  if (!normalized) return true;
  return [
    row.note,
    accounts[row.accountId] ?? "",
    categories[row.categoryId ?? ""] ?? "",
    row.amount.toString(),
    row.currency,
    TRANSACTION_KIND_LABELS[row.kind],
    row.occurredAt,
  ].some((value) => normalizeSearch(value).includes(normalized));
}

function activeFilterLabels(data: AppData, filters: Filters): readonly string[] {
  const labels: string[] = [];
  if (filters.query.trim()) labels.push(`搜索：${filters.query.trim()}`);
  if (filters.currency) labels.push(`币种：${filters.currency}`);
  if (filters.accountId) labels.push(`账户：${data.accounts.find((item) => item.id === filters.accountId)?.name ?? filters.accountId}`);
  if (filters.categoryId) labels.push(`分类：${data.categories.find((item) => item.id === filters.categoryId)?.name ?? filters.categoryId}`);
  if (filters.tagId) labels.push(`标签：${data.tags.find((item) => item.id === filters.tagId)?.name ?? filters.tagId}`);
  if (filters.kind) labels.push(`类型：${TRANSACTION_KIND_LABELS[filters.kind as keyof typeof TRANSACTION_KIND_LABELS] ?? filters.kind}`);
  return labels;
}

function normalizeSearch(value: string): string {
  return value.trim().toLowerCase();
}

function currentPageRows(rows: readonly Transaction[], page: number, pageSize: number): readonly Transaction[] {
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

function filtersFromUrl(search: string): Filters {
  const params = new URLSearchParams(search);
  return {
    query: params.get("q") ?? "",
    currency: params.get("currency") ?? "",
    accountId: params.get("accountId") ?? "",
    categoryId: params.get("categoryId") ?? "",
    tagId: params.get("tagId") ?? "",
    kind: params.get("kind") ?? "",
  };
}

function pageFromUrl(search: string): number {
  return positiveInteger(new URLSearchParams(search).get("page"), 1);
}

function pageSizeFromUrl(search: string): number {
  const value = positiveInteger(new URLSearchParams(search).get("pageSize"), DEFAULT_PAGE_SIZE);
  return PAGE_SIZE_OPTIONS.includes(value as (typeof PAGE_SIZE_OPTIONS)[number]) ? value : DEFAULT_PAGE_SIZE;
}

function positiveInteger(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function syncTableUrl(filters: Filters, page: number, pageSize: number): void {
  const params = new URLSearchParams();
  setParam(params, "q", filters.query.trim());
  setParam(params, "currency", filters.currency);
  setParam(params, "accountId", filters.accountId);
  setParam(params, "categoryId", filters.categoryId);
  setParam(params, "tagId", filters.tagId);
  setParam(params, "kind", filters.kind);
  if (page > 1) params.set("page", String(page));
  if (pageSize !== DEFAULT_PAGE_SIZE) params.set("pageSize", String(pageSize));
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
}

function setParam(params: URLSearchParams, key: string, value: string): void {
  if (value) params.set(key, value);
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
