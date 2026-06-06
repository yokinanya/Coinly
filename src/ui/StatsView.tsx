import { ListFilter } from "lucide-react";
import { buildReportIndex, type MonthlyTrend } from "../domain/analytics";
import type { AppData, CurrencyCode } from "../domain/types";
import { money } from "./format";
import { PageHeader, SectionPanel } from "./common";
import { FadeIn } from "./motion";

const TREND_MONTHS = 6;

export function StatsView(props: { readonly data: AppData; readonly onFilter: (filter: StatsFilter) => void }) {
  const report = buildReportIndex(props.data, { trendMonths: TREND_MONTHS });
  const categories = Object.fromEntries(props.data.categories.map((item) => [item.id, item.name]));
  const tags = Object.fromEntries(props.data.tags.map((item) => [item.id, item.name]));
  return (
    <section className="space-y-5">
      <PageHeader title="统计" />
      <TrendSection rows={report.monthlyTrends} />
      <RankSection
        title="本月分类支出"
        emptyText="本月暂无分类支出"
        rows={report.categorySummary.map((item) => ({ id: item.categoryId, label: categories[item.categoryId] ?? "未命名分类", currency: item.currency, amount: item.amount }))}
        onFilter={(row) => props.onFilter({ categoryId: row.id, currency: row.currency })}
      />
      <RankSection
        title="本月标签支出"
        emptyText="本月暂无标签支出"
        rows={report.tagSummary.map((item) => ({ id: item.tagId, label: tags[item.tagId] ?? "未命名标签", currency: item.currency, amount: item.amount }))}
        onFilter={(row) => props.onFilter({ tagId: row.id, currency: row.currency })}
      />
    </section>
  );
}

export interface StatsFilter {
  readonly categoryId?: string;
  readonly tagId?: string;
  readonly currency?: CurrencyCode;
}

function TrendSection({ rows }: { readonly rows: readonly MonthlyTrend[] }) {
  return (
    <SectionPanel title="月度趋势">
      {rows.length === 0
        ? <p className="text-sm text-(--color-text-secondary)">暂无可统计流水。</p>
        : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <FadeIn key={`${row.month}:${row.currency}`}><TrendBar row={row} /></FadeIn>)}</div>}
    </SectionPanel>
  );
}

function TrendBar(props: { readonly row: MonthlyTrend }) {
  const max = Math.max(props.row.income, props.row.expense, 1);
  return (
    <div className="row-card space-y-2 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-(--color-text)">{props.row.month} / {props.row.currency}</span>
        <span className="text-(--color-text-secondary)">原币</span>
      </div>
      <Bar label="收入" value={props.row.income} max={max} currency={props.row.currency} tone="success" />
      <Bar label="支出" value={props.row.expense} max={max} currency={props.row.currency} tone="danger" />
    </div>
  );
}

function Bar(props: { readonly label: string; readonly value: number; readonly max: number; readonly currency: CurrencyCode; readonly tone: "success" | "danger" }) {
  const width = `${Math.max(4, (props.value / props.max) * 100)}%`;
  const color = props.tone === "success" ? "bg-(--color-success)" : "bg-(--color-error)";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-(--color-text-secondary)">
        <span>{props.label}</span>
        <span>{money(props.value, props.currency)}</span>
      </div>
      <div className="h-2 rounded bg-(--color-surface-muted)">
        <div className={`h-2 rounded transition-[width] duration-300 ${color}`} style={{ width }} />
      </div>
    </div>
  );
}

function RankSection(props: {
  readonly title: string;
  readonly emptyText: string;
  readonly rows: readonly RankRow[];
  readonly onFilter: (row: RankRow) => void;
}) {
  const groups = rankGroups(props.rows);
  return (
    <SectionPanel title={props.title}>
      {props.rows.length === 0
        ? <p className="text-sm text-(--color-text-secondary)">{props.emptyText}</p>
        : (
          <div className="grid gap-4 xl:grid-cols-2">
            {groups.map((group) => <RankGroup key={group.currency} group={group} onFilter={props.onFilter} />)}
          </div>
        )}
    </SectionPanel>
  );
}

interface RankRow {
  readonly id: string;
  readonly label: string;
  readonly currency: CurrencyCode;
  readonly amount: number;
}

interface RankGroupData {
  readonly currency: CurrencyCode;
  readonly total: number;
  readonly rows: readonly RankRow[];
}

function RankGroup(props: { readonly group: RankGroupData; readonly onFilter: (row: RankRow) => void }) {
  return (
    <div className="row-card overflow-hidden bg-(--color-surface)">
      <div className="flex items-center justify-between gap-3 border-b border-(--color-border) px-4 py-3">
        <span className="text-sm font-semibold text-(--color-text)">{props.group.currency}</span>
        <span className="text-sm font-semibold tabular-nums text-(--color-text)">{money(props.group.total, props.group.currency)}</span>
      </div>
      <div className="divide-y divide-(--color-border)">
        {props.group.rows.map((row, index) => (
          <FadeIn key={`${row.id}:${row.currency}`}>
            <RankButton
              max={props.group.rows[0]?.amount ?? 1}
              rank={index + 1}
              row={row}
              total={props.group.total}
              onFilter={props.onFilter}
            />
          </FadeIn>
        ))}
      </div>
    </div>
  );
}

function RankButton(props: {
  readonly row: RankRow;
  readonly rank: number;
  readonly max: number;
  readonly total: number;
  readonly onFilter: (row: RankRow) => void;
}) {
  const percent = props.total > 0 ? Math.round((props.row.amount / props.total) * 100) : 0;
  const width = `${Math.max(4, (props.row.amount / Math.max(props.max, 1)) * 100)}%`;
  return (
    <button className="motion-press grid w-full gap-2 px-4 py-3 text-left text-sm hover:bg-(--color-surface-muted)" onClick={() => props.onFilter(props.row)}>
      <span className="flex min-w-0 items-center justify-between gap-4">
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded bg-(--color-surface-muted) text-xs font-semibold text-(--color-text-secondary)">{props.rank}</span>
          <span className="truncate font-medium text-(--color-text)">{props.row.label}</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 font-semibold tabular-nums text-(--color-text)">
          {money(props.row.amount, props.row.currency)}
          <ListFilter size={15} className="text-(--color-text-muted)" />
        </span>
      </span>
      <span className="grid grid-cols-[minmax(0,1fr)_3rem] items-center gap-3">
        <span className="h-2 overflow-hidden rounded bg-(--color-surface-muted)">
          <span className="block h-full rounded bg-(--color-error) transition-[width] duration-300" style={{ width }} />
        </span>
        <span className="text-right text-xs tabular-nums text-(--color-text-secondary)">{percent}%</span>
      </span>
    </button>
  );
}

function rankGroups(rows: readonly RankRow[]): readonly RankGroupData[] {
  const groups = rows.reduce<Map<CurrencyCode, RankRow[]>>((result, row) => {
    result.set(row.currency, [...(result.get(row.currency) ?? []), row]);
    return result;
  }, new Map());
  return [...groups.entries()].map(([currency, groupRows]) => ({
    currency,
    rows: groupRows,
    total: groupRows.reduce((total, row) => total + row.amount, 0),
  }));
}
