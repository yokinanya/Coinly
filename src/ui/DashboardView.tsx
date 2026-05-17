import { buildReportIndex, type CurrencySummary } from "../domain/analytics";
import type { AppData } from "../domain/types";
import { PageHeader } from "./common";
import { money } from "./format";
import { StatsSummary } from "./StatsSummary";

export function DashboardView({ data }: { readonly data: AppData; readonly setData: (data: AppData) => void }) {
  const report = buildReportIndex(data);
  const pendingRecurring = data.recurringRules.filter((rule) => rule.enabled);

  return (
    <section className="space-y-5">
      <PageHeader title="首页" />
      <div className="grid gap-4 lg:grid-cols-2">
        <SummaryPanel title="本月收支" rows={report.currencySummary} />
        <div className="panel p-4">
          <h2 className="font-semibold text-[var(--color-text)]">订阅规则</h2>
          <div className="mt-3 space-y-2">
            {pendingRecurring.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">暂无启用的订阅。</p>}
            {pendingRecurring.map((rule) => (
              <div key={rule.id} className="row-card p-3 text-sm">
                <div className="font-medium">{rule.name}</div>
                <div className="text-[var(--color-text-secondary)]">下次：{new Date(rule.nextRunAt).toLocaleDateString("zh-CN")}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <StatsSummary data={data} report={report} />
    </section>
  );
}

function SummaryPanel(props: { readonly title: string; readonly rows: readonly CurrencySummary[] }) {
  return (
    <div className="panel p-4">
      <h2 className="font-semibold text-[var(--color-text)]">{props.title}</h2>
      <div className="mt-3 space-y-3">
        {props.rows.length === 0 && <p className="text-sm text-[var(--color-text-secondary)]">暂无数据。</p>}
        {props.rows.map((row) => (
          <div key={row.currency} className="row-card p-3">
            <div className="text-sm font-medium">{row.currency}</div>
            <div className="mt-1 grid grid-cols-2 gap-2 text-sm">
              <span>收入 {money(row.income, row.currency)}</span>
              <span>支出 {money(row.expense, row.currency)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
