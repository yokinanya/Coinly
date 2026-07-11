import { ListFilter } from "lucide-react";
import { useMemo, useState } from "react";
import { buildReportIndex, type MonthlyTrend } from "../domain/analytics";
import type { AppData, CurrencyCode } from "../domain/types";
import { Button } from "./components";
import { money } from "./format";
import { PageHeader, SectionPanel } from "./common";
import { FadeIn } from "./motion";

const TREND_MONTHS = 6;
const CHART_LEFT = 20;
const CHART_TOP = 18;
const CHART_WIDTH = 280;
const CHART_HEIGHT = 124;
const CHART_BASELINE = CHART_TOP + CHART_HEIGHT;

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
  const groups = trendGroups(rows);
  const [mode, setMode] = useState<TrendMode>("both");
  return (
    <SectionPanel title="月度趋势">
      {rows.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <TrendModeButton active={mode === "both"} onClick={() => setMode("both")}>收入 + 支出</TrendModeButton>
          <TrendModeButton active={mode === "income"} onClick={() => setMode("income")}>仅收入</TrendModeButton>
          <TrendModeButton active={mode === "expense"} onClick={() => setMode("expense")}>仅支出</TrendModeButton>
        </div>
      )}
      {rows.length === 0
        ? <p className="text-sm text-(--color-text-secondary)">暂无可统计流水。</p>
        : <div className="grid gap-4 xl:grid-cols-2">{groups.map((group) => <FadeIn key={group.currency}><TrendChart group={group} mode={mode} /></FadeIn>)}</div>}
    </SectionPanel>
  );
}

function TrendChart(props: { readonly group: TrendGroup; readonly mode: TrendMode }) {
  const points = props.group.rows;
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const { incomePoints, expensePoints, stackedIncomeArea, stackedExpenseArea, incomeLine, expenseLine } = useMemo(() => {
    const max = stackedMax(points, props.mode);
    const income = chartPoints(points, max, "income", props.mode);
    const expense = chartPoints(points, max, "expense", props.mode);
    return {
      incomePoints: income,
      expensePoints: expense,
      stackedIncomeArea: props.mode === "expense" ? "" : chartArea(income),
      stackedExpenseArea: props.mode === "income" ? "" : chartStackedArea(points, income, expense, max, props.mode),
      incomeLine: props.mode === "expense" ? "" : chartLine(income),
      expenseLine: props.mode === "income" ? "" : chartLine(expense),
    };
  }, [points, props.mode]);
  const hovered = hoveredIndex === null ? undefined : points[hoveredIndex];
  const hoverX = hoveredIndex === null ? undefined : incomePoints[hoveredIndex]?.x ?? expensePoints[hoveredIndex]?.x;
  return (
    <div className="row-card space-y-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="font-medium text-(--color-text)">{props.group.currency}</h3>
          <p className="text-xs text-(--color-text-secondary)">最近 {points.length} 个月{trendModeLabel(props.mode)}趋势</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-(--color-text-secondary)">
          {props.mode !== "expense" && <Legend tone="success" label="收入" />}
          {props.mode !== "income" && <Legend tone="danger" label="支出" />}
        </div>
      </div>
      <div className="relative">
      <svg
        viewBox="0 0 320 180"
        className="h-44 w-full overflow-visible"
        onMouseLeave={() => setHoveredIndex(null)}
        onMouseMove={(event) => setHoveredIndex(pointerToIndex(event, points.length))}
      >
        <GridLines />
        {stackedIncomeArea && <path d={stackedIncomeArea} fill="color-mix(in srgb, var(--color-success) 18%, transparent)" />}
        {stackedExpenseArea && <path d={stackedExpenseArea} fill="color-mix(in srgb, var(--color-coral) 14%, transparent)" />}
        {incomeLine && <path d={incomeLine} fill="none" stroke="var(--color-success)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {expenseLine && <path d={expenseLine} fill="none" stroke="var(--color-coral)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />}
        {props.mode !== "expense" && incomePoints.map((point, index) => <circle key={`income-${props.group.currency}-${point.label}`} cx={point.x} cy={point.y} r="3.5" fill="var(--color-success)" aria-label={`${point.label} 收入 ${money(points[index]?.income ?? 0, props.group.currency)}`} />)}
        {props.mode !== "income" && expensePoints.map((point, index) => <circle key={`expense-${props.group.currency}-${point.label}`} cx={point.x} cy={point.y} r="3.5" fill="var(--color-coral)" aria-label={`${point.label} 支出 ${money(points[index]?.expense ?? 0, props.group.currency)}`} />)}
        {hoverX !== undefined && <line x1={hoverX} y1={CHART_TOP} x2={hoverX} y2={CHART_BASELINE} stroke="var(--color-text-secondary)" strokeDasharray="4 4" strokeWidth="1" />}
        {incomePoints.map((point) => <text key={`label-${props.group.currency}-${point.label}`} x={point.x} y="170" textAnchor="middle" className="fill-(--color-text-secondary) text-[10px]">{point.label.slice(5)}</text>)}
      </svg>
      {hovered && hoverX !== undefined && <TrendTooltip currency={props.group.currency} mode={props.mode} point={hovered} x={hoverX} />}
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <MetricCard label="最新收入" value={money(points.at(-1)?.income ?? 0, props.group.currency)} tone="success" />
        <MetricCard label="最新支出" value={money(points.at(-1)?.expense ?? 0, props.group.currency)} tone="danger" />
      </div>
    </div>
  );
}

function Legend(props: { readonly tone: "success" | "danger"; readonly label: string }) {
  return <span className="inline-flex items-center gap-1"><span className={`h-2.5 w-2.5 rounded-full ${props.tone === "success" ? "bg-(--color-success)" : "bg-(--color-coral)"}`} />{props.label}</span>;
}

function TrendModeButton(props: { readonly active: boolean; readonly onClick: () => void; readonly children: string }) {
  return <Button className={props.active ? "border-(--color-accent) bg-(--color-accent-soft) text-(--color-accent)" : undefined} onClick={props.onClick}>{props.children}</Button>;
}

function TrendTooltip(props: { readonly currency: CurrencyCode; readonly mode: TrendMode; readonly point: MonthlyTrend; readonly x: number }) {
  const left = Math.min(Math.max(props.x / 320 * 100, 12), 88);
  return (
    <div className="pointer-events-none absolute top-2 -translate-x-1/2 rounded-md border border-(--color-border) bg-(--color-surface) px-3 py-2 text-xs shadow-sm" style={{ left: `${left}%` }}>
      <div className="font-medium text-(--color-text)">{props.point.month}</div>
      {props.mode !== "expense" && <div className="text-(--color-success)">收入：{money(props.point.income, props.currency)}</div>}
      {props.mode !== "income" && <div className="text-(--color-coral)">支出：{money(props.point.expense, props.currency)}</div>}
    </div>
  );
}

function MetricCard(props: { readonly label: string; readonly value: string; readonly tone: "success" | "danger" }) {
  return (
    <div className="rounded-md bg-(--color-surface-muted) px-3 py-2">
      <div className="text-xs text-(--color-text-secondary)">{props.label}</div>
      <div className={props.tone === "success" ? "font-semibold text-(--color-success)" : "font-semibold text-(--color-coral)"}>{props.value}</div>
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

interface TrendGroup {
  readonly currency: CurrencyCode;
  readonly rows: readonly MonthlyTrend[];
}

type TrendMode = "both" | "income" | "expense";

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
          <span className="block h-full rounded bg-(--color-coral) transition-[width] duration-300" style={{ width }} />
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

function trendGroups(rows: readonly MonthlyTrend[]): readonly TrendGroup[] {
  const groups = rows.reduce<Map<CurrencyCode, MonthlyTrend[]>>((result, row) => {
    result.set(row.currency, [...(result.get(row.currency) ?? []), row]);
    return result;
  }, new Map());
  return [...groups.entries()].map(([currency, groupRows]) => ({
    currency,
    rows: [...groupRows].sort((left, right) => left.month.localeCompare(right.month)),
  }));
}

function chartPoints(rows: readonly MonthlyTrend[], max: number, key: "income" | "expense", mode: TrendMode) {
  const step = rows.length > 1 ? CHART_WIDTH / (rows.length - 1) : 0;
  return rows.map((row, index) => ({
    x: CHART_LEFT + step * index,
    y: CHART_TOP + CHART_HEIGHT - ((stackedValue(row, key, mode) / max) * CHART_HEIGHT),
    label: row.month,
  }));
}

function chartLine(points: readonly { readonly x: number; readonly y: number }[]): string {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function chartArea(points: readonly { readonly x: number; readonly y: number }[]): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `M ${first.x} ${CHART_BASELINE} L ${first.x} ${first.y} ${points.slice(1).map((point) => `L ${point.x} ${point.y}`).join(" ")} L ${last.x} ${CHART_BASELINE} Z`;
}

function chartStackedArea(
  rows: readonly MonthlyTrend[],
  incomePoints: readonly { readonly x: number; readonly y: number }[],
  expensePoints: readonly { readonly x: number; readonly y: number }[],
  max: number,
  mode: TrendMode,
): string {
  if (mode !== "both") return chartArea(mode === "income" ? incomePoints : expensePoints);
  if (rows.length === 0) return "";
  const topPoints = rows.map((row, index) => ({
    x: expensePoints[index]?.x ?? incomePoints[index]?.x ?? CHART_LEFT,
    y: CHART_TOP + CHART_HEIGHT - (((row.income + row.expense) / max) * CHART_HEIGHT),
  }));
  const bottomPoints = incomePoints.slice().reverse();
  const first = topPoints[0];
  const last = bottomPoints[0];
  return `M ${first.x} ${CHART_BASELINE} L ${topPoints.map((point, index) => `${index === 0 ? point.x : `L ${point.x}`} ${point.y}`).join(" ")} L ${last.x} ${last.y} ${bottomPoints.slice(1).map((point) => `L ${point.x} ${point.y}`).join(" ")} Z`;
}

function GridLines() {
  return (
    <g stroke="var(--color-border)" strokeWidth="1">
      <line x1="20" y1="18" x2="300" y2="18" />
      <line x1="20" y1="60" x2="300" y2="60" />
      <line x1="20" y1="101" x2="300" y2="101" />
      <line x1="20" y1="142" x2="300" y2="142" />
    </g>
  );
}

function pointerToIndex(event: React.MouseEvent<SVGSVGElement>, length: number): number | null {
  if (length === 0) return null;
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 320;
  const step = length > 1 ? CHART_WIDTH / (length - 1) : CHART_WIDTH;
  const index = Math.round((x - CHART_LEFT) / step);
  return Math.min(Math.max(index, 0), length - 1);
}

function trendModeLabel(mode: TrendMode): string {
  if (mode === "income") return "收入";
  if (mode === "expense") return "支出";
  return "收入 / 支出";
}

function stackedMax(rows: readonly MonthlyTrend[], mode: TrendMode): number {
  if (mode === "income") return Math.max(...rows.map((row) => row.income), 1);
  if (mode === "expense") return Math.max(...rows.map((row) => row.expense), 1);
  return Math.max(...rows.map((row) => row.income + row.expense), 1);
}

function stackedValue(row: MonthlyTrend, key: "income" | "expense", mode: TrendMode): number {
  if (mode !== "both") return row[key];
  if (key === "income") return row.income;
  return row.income + row.expense;
}
