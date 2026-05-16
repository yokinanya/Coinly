import { reportEntries, summarizeByCategory, summarizeByCurrency } from "../domain/analytics";
import type { ReportEntry } from "../domain/analytics";
import type { AppData } from "../domain/types";
import { money } from "./format";
import type { ReactNode } from "react";

export function StatsSummary({ data }: { readonly data: AppData }) {
  const scoped = currentMonthData(data);
  const scopedEntries = currentMonthEntries(data);
  const currencyRows = summarizeByCurrency(scopedEntries);
  const categoryRows = summarizeByCategory(scoped, scopedEntries);
  const categories = Object.fromEntries(data.categories.map((item) => [item.id, item.name]));
  const tagRows = tagSummary(data, scopedEntries);
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
        {tagRows.map((row) => (
          <div key={`${row.name}:${row.currency}`} className="row-card flex justify-between p-3 text-sm">
            <span>{row.name}</span>
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

function currentMonthData(data: AppData): AppData {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return { ...data, transactions: data.transactions.filter((item) => item.occurredAt >= start && item.occurredAt < end) };
}

function currentMonthEntries(data: AppData) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
  return reportEntries(data).filter((item) => item.occurredAt >= start && item.occurredAt < end);
}

function tagSummary(data: AppData, entries: readonly ReportEntry[]) {
  return data.tags.flatMap((tag) => {
    const rows = summarizeByCurrency(entries.filter((item) => item.kind === "expense" && item.tagIds.includes(tag.id)));
    return rows.map((row) => ({ name: tag.name, currency: row.currency, amount: row.expense }));
  }).filter((row) => row.amount > 0);
}
