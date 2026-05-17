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
        ? <p className="text-sm text-[var(--color-text-secondary)]">暂无可统计流水。</p>
        : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map((row) => <FadeIn key={`${row.month}:${row.currency}`}><TrendBar row={row} /></FadeIn>)}</div>}
    </SectionPanel>
  );
}

function TrendBar(props: { readonly row: MonthlyTrend }) {
  const max = Math.max(props.row.income, props.row.expense, 1);
  return (
    <div className="row-card space-y-2 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-[var(--color-text)]">{props.row.month} / {props.row.currency}</span>
        <span className="text-[var(--color-text-secondary)]">原币</span>
      </div>
      <Bar label="收入" value={props.row.income} max={max} currency={props.row.currency} tone="success" />
      <Bar label="支出" value={props.row.expense} max={max} currency={props.row.currency} tone="danger" />
    </div>
  );
}

function Bar(props: { readonly label: string; readonly value: number; readonly max: number; readonly currency: CurrencyCode; readonly tone: "success" | "danger" }) {
  const width = `${Math.max(4, (props.value / props.max) * 100)}%`;
  const color = props.tone === "success" ? "bg-[var(--color-success)]" : "bg-[var(--color-error)]";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-[var(--color-text-secondary)]">
        <span>{props.label}</span>
        <span>{money(props.value, props.currency)}</span>
      </div>
      <div className="h-2 rounded bg-[var(--color-surface-muted)]">
        <div className={`h-2 rounded ${color}`} style={{ width }} />
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
  return (
    <SectionPanel title={props.title}>
      {props.rows.length === 0
        ? <p className="text-sm text-[var(--color-text-secondary)]">{props.emptyText}</p>
        : <div className="grid gap-2">{props.rows.map((row) => <FadeIn key={`${row.id}:${row.currency}`}><RankButton row={row} onFilter={props.onFilter} /></FadeIn>)}</div>}
    </SectionPanel>
  );
}

interface RankRow {
  readonly id: string;
  readonly label: string;
  readonly currency: CurrencyCode;
  readonly amount: number;
}

function RankButton(props: { readonly row: RankRow; readonly onFilter: (row: RankRow) => void }) {
  return (
    <button className="row-card flex items-center justify-between gap-3 p-3 text-left text-sm" onClick={() => props.onFilter(props.row)}>
      <span>
        <span className="block font-medium text-[var(--color-text)]">{props.row.label}</span>
        <span className="text-xs text-[var(--color-text-secondary)]">{props.row.currency}</span>
      </span>
      <span className="flex items-center gap-2 text-[var(--color-text)]">
        {money(props.row.amount, props.row.currency)}
        <ListFilter size={16} />
      </span>
    </button>
  );
}
