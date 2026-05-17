import type { ReportIndex, TagSummary } from "../domain/analytics";
import type { AppData } from "../domain/types";
import { money } from "./format";
import type { ReactNode } from "react";

export function StatsSummary({ data, report }: { readonly data: AppData; readonly report: ReportIndex }) {
  const currencyRows = report.currencySummary;
  const categoryRows = report.categorySummary;
  const categories = Object.fromEntries(data.categories.map((item) => [item.id, item.name]));
  const tags = Object.fromEntries(data.tags.map((item) => [item.id, item.name]));
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <StatsPanel title="币种汇总">
        {currencyRows.map((row) => (
          <div key={row.currency} className="row-card grid grid-cols-3 gap-2 p-3 text-sm">
            <span>{row.currency}</span>
            <span>收入 {money(row.income, row.currency)}</span>
            <span>支出 {money(row.expense, row.currency)}</span>
          </div>
        ))}
      </StatsPanel>
      <StatsPanel title="分类支出">
        {categoryRows.map((row) => (
          <div key={`${row.categoryId}:${row.currency}`} className="row-card flex items-center justify-between p-3 text-sm">
            <span>{categories[row.categoryId]}</span>
            <span>{money(row.amount, row.currency)}</span>
          </div>
        ))}
      </StatsPanel>
      <StatsPanel title="标签排行">
        {report.tagSummary.map((row) => (
          <div key={`${row.tagId}:${row.currency}`} className="row-card flex justify-between p-3 text-sm">
            <span>{tagName(tags, row)}</span>
            <span>{money(row.amount, row.currency)}</span>
          </div>
        ))}
      </StatsPanel>
    </div>
  );
}

function StatsPanel(props: { readonly title: string; readonly children: ReactNode }) {
  return (
    <div className="panel p-4">
      <h2 className="font-semibold">{props.title}</h2>
      <div className="mt-3 space-y-3">
        {props.children}
      </div>
    </div>
  );
}

function tagName(tags: Record<string, string>, row: TagSummary): string {
  return tags[row.tagId] ?? "未命名标签";
}
