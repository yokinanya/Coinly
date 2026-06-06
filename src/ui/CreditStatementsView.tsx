import { useState } from "react";
import { createStatementForAccount } from "../domain/operations";
import { deleteStatement, revokeStatementSettlement, settleStatement, statementDetails } from "../domain/statements";
import type { AppData, CreditCardStatement, CurrencyCode, Transaction } from "../domain/types";
import { ConfirmDialog, EmptyState, MessageBanner, SelectField, TextField } from "./common";
import type { StatusMessage } from "./common";
import { money } from "./format";
import { Button, Drawer } from "./components";
import { AnimatedRow } from "./managers/ManagerCommon";

const DETAIL_DRAWER_WIDTH = 520;
const SETTLEMENT_DRAWER_WIDTH = 440;
const CREDIT_STATEMENTS_DRAWER_WIDTH = 760;

export function CreditStatementsView(props: {
  readonly data: AppData;
  readonly setData: (data: AppData) => void;
  readonly onBack: () => void;
}) {
  const creditAccounts = props.data.accounts.filter((account) => account.kind === "credit");
  const [status, setStatus] = useState<StatusMessage>();
  const [creatingAccountId, setCreatingAccountId] = useState<string>();
  const createStatement = (accountId: string) => {
    if (creatingAccountId) return;
    const account = creditAccounts.find((item) => item.id === accountId);
    if (!account) return;
    setCreatingAccountId(accountId);
    try {
      props.setData(createStatementForAccount(props.data, account));
      setStatus({ tone: "success", text: "账期已生成" });
    } catch (error) {
      setStatus({ tone: "error", text: error instanceof Error ? error.message : "账期生成失败" });
    } finally {
      setCreatingAccountId(undefined);
    }
  };
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-(--color-text)">信用卡账期</h1>
          <p className="mt-1 text-sm text-(--color-text-secondary)">生成、查看并结算信用卡账期。</p>
        </div>
        <Button onClick={props.onBack}>返回明细</Button>
      </div>
      <StatementStatusMessage status={status} />
      <StatementActions creditAccounts={creditAccounts} creatingAccountId={creatingAccountId} onCreate={createStatement} />
      <StatementGrid data={props.data} setData={props.setData} setStatus={setStatus} />
      {creditAccounts.length === 0 && <EmptyState>暂无信用卡账户。</EmptyState>}
    </section>
  );
}

export function CreditStatementsDrawer(props: {
  readonly open: boolean;
  readonly data: AppData;
  readonly setData: (data: AppData) => void;
  readonly onClose: () => void;
}) {
  return (
    <Drawer open={props.open} title="信用卡账期" width={CREDIT_STATEMENTS_DRAWER_WIDTH} onClose={props.onClose}>
      <CreditStatementsView data={props.data} setData={props.setData} onBack={props.onClose} />
    </Drawer>
  );
}

function StatementStatusMessage({ status }: { readonly status?: StatusMessage }) {
  if (!status?.text) return null;
  return <AnimatedRow><MessageBanner message={status.text} tone={status.tone} /></AnimatedRow>;
}

function StatementActions(props: {
  readonly creditAccounts: readonly AppData["accounts"][number][];
  readonly creatingAccountId?: string;
  readonly onCreate: (accountId: string) => void;
}) {
  if (props.creditAccounts.length === 0) return null;
  return (
    <div className="panel flex flex-wrap gap-2 p-4">
      {props.creditAccounts.map((account) => (
        <Button key={account.id} loading={props.creatingAccountId === account.id} disabled={Boolean(props.creatingAccountId)} onClick={() => props.onCreate(account.id)}>
          生成 {account.name} 本期账单
        </Button>
      ))}
    </div>
  );
}

function StatementGrid(props: {
  readonly data: AppData;
  readonly setData: (data: AppData) => void;
  readonly setStatus: (status: StatusMessage) => void;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {props.data.statements.map((statement) => (
        <AnimatedRow key={statement.id}>
          <StatementPanel data={props.data} statement={statement} setData={props.setData} setStatus={props.setStatus} />
        </AnimatedRow>
      ))}
    </div>
  );
}

function StatementPanel(props: {
  readonly data: AppData;
  readonly statement: CreditCardStatement;
  readonly setData: (data: AppData) => void;
  readonly setStatus: (status: StatusMessage) => void;
}) {
  const [detailOpen, setDetailOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const account = props.data.accounts.find((item) => item.id === props.statement.accountId);
  const details = statementDetails(props.data.transactions, props.statement);
  return (
    <div className="panel p-4">
      <StatementSummary accountName={account?.name ?? "信用卡账期"} statement={props.statement} rows={details.totals} details={details.transactions} />
      <StatementButtons statement={props.statement} onDelete={() => setDeleteOpen(true)} onDetail={() => setDetailOpen(true)} onSettle={() => setSettlementOpen(true)} onRevoke={() => setConfirmOpen(true)} />
      <DetailDrawer open={detailOpen} statement={props.statement} transactions={details.transactions} onClose={() => setDetailOpen(false)} />
      <SettlementDrawer data={props.data} statement={props.statement} open={settlementOpen} setData={props.setData} setStatus={props.setStatus} onClose={() => setSettlementOpen(false)} />
      <ConfirmDialog open={confirmOpen} title="撤销结算" description="撤销后会移除该账期对应的还款记录。" onCancel={() => setConfirmOpen(false)} onConfirm={() => revoke(props, setConfirmOpen)} />
      <ConfirmDialog open={deleteOpen} title="删除账期" description="删除后会移除该账期记录；如果账期已结算，也会删除对应还款记录。" onCancel={() => setDeleteOpen(false)} onConfirm={() => removeStatement(props, setDeleteOpen)} />
    </div>
  );
}

function StatementSummary(props: {
  readonly accountName: string;
  readonly statement: CreditCardStatement;
  readonly rows: readonly { readonly currency: CurrencyCode; readonly amount: number }[];
  readonly details: readonly Transaction[];
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{props.accountName}</h2>
          <p className="mt-1 text-sm text-(--color-text-secondary)">{dateRange(props.statement.startAt, props.statement.endAt)}</p>
        </div>
        <span className={statusClass(props.statement.paid)}>{props.statement.paid ? "已结算" : "待结算"}</span>
      </div>
      <div className="mt-3 grid gap-2">{props.rows.map((row) => <TotalRow key={row.currency} currency={row.currency} amount={row.amount} />)}</div>
      <p className="row-card mt-3 p-3 text-xs text-(--color-text-secondary)">账期内消费明细：{props.details.length} 条</p>
      {props.statement.paid && <SettlementSummary statement={props.statement} />}
    </>
  );
}

function StatementButtons(props: {
  readonly statement: CreditCardStatement;
  readonly onDelete: () => void;
  readonly onDetail: () => void;
  readonly onSettle: () => void;
  readonly onRevoke: () => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      <Button onClick={props.onDetail}>查看明细</Button>
      <Button disabled={props.statement.paid} variant="primary" onClick={props.onSettle}>{props.statement.paid ? "已结算" : "记录结算"}</Button>
      {props.statement.paid && <Button variant="danger" onClick={props.onRevoke}>撤销结算</Button>}
      <Button variant="danger" onClick={props.onDelete}>删除账期</Button>
    </div>
  );
}

function DetailDrawer(props: {
  readonly open: boolean;
  readonly statement: CreditCardStatement;
  readonly transactions: readonly Transaction[];
  readonly onClose: () => void;
}) {
  return (
    <Drawer open={props.open} title="账期明细" width={DETAIL_DRAWER_WIDTH} onClose={props.onClose}>
      <p className="mb-3 text-sm text-(--color-text-secondary)">{dateRange(props.statement.startAt, props.statement.endAt)}</p>
      <div className="space-y-2">{props.transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</div>
      {props.transactions.length === 0 && <EmptyState>该账期暂无消费明细。</EmptyState>}
    </Drawer>
  );
}

function SettlementDrawer(props: {
  readonly data: AppData;
  readonly statement: CreditCardStatement;
  readonly open: boolean;
  readonly setData: (data: AppData) => void;
  readonly setStatus: (status: StatusMessage) => void;
  readonly onClose: () => void;
}) {
  const [amount, setAmount] = useState("0");
  const [currency, setCurrency] = useState<CurrencyCode>(props.statement.primaryCurrency);
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [saving, setSaving] = useState(false);
  const save = () => {
    if (saving) return;
    setSaving(true);
    if (!settle(props, { amount, currency, sourceAccountId })) setSaving(false);
  };
  const footer = <SettlementFooter saving={saving} onCancel={props.onClose} onSave={save} />;
  return (
    <Drawer open={props.open} title="记录账期结算" width={SETTLEMENT_DRAWER_WIDTH} footer={footer} onClose={props.onClose}>
      <div className="space-y-4">
        <SelectField label="还款来源（可选）" value={sourceAccountId} options={sourceOptions(props.data, props.statement.accountId)} onChange={setSourceAccountId} />
        <TextField label="主币种结算金额" type="number" value={amount} onChange={setAmount} />
        <SelectField label="结算币种" value={currency} options={props.data.currencies.map((item) => ({ value: item, label: item }))} onChange={(value) => setCurrency(value as CurrencyCode)} />
      </div>
    </Drawer>
  );
}

function SettlementFooter(props: { readonly saving: boolean; readonly onCancel: () => void; readonly onSave: () => void }) {
  return (
    <div className="flex justify-end gap-2">
      <Button disabled={props.saving} onClick={props.onCancel}>取消</Button>
      <Button variant="primary" loading={props.saving} onClick={props.onSave}>保存</Button>
    </div>
  );
}

function SettlementSummary({ statement }: { readonly statement: CreditCardStatement }) {
  return (
    <div className="row-card mt-3 p-3 text-sm">
      已结算：{money(statement.settlementAmount ?? 0, statement.settlementCurrency ?? statement.primaryCurrency)}
      {statement.settledAt && <span className="ml-2 text-xs text-(--color-text-secondary)">{new Date(statement.settledAt).toLocaleDateString("zh-CN")}</span>}
    </div>
  );
}

function TransactionRow({ transaction }: { readonly transaction: Transaction }) {
  return (
    <div className="row-card flex justify-between gap-3 p-2 text-sm">
      <span className="truncate">{transaction.note || "信用卡消费"}</span>
      <span>{money(transaction.amount, transaction.currency)}</span>
    </div>
  );
}

function TotalRow(props: { readonly currency: CurrencyCode; readonly amount: number }) {
  return <div className="row-card flex justify-between p-3 text-sm"><span>{props.currency}</span><span>{money(props.amount, props.currency)}</span></div>;
}

function settle(
  props: Parameters<typeof SettlementDrawer>[0],
  draft: { readonly amount: string; readonly currency: CurrencyCode; readonly sourceAccountId: string },
): boolean {
  try {
    props.setData(settleStatement(props.data, props.statement.id, draft.sourceAccountId, Number(draft.amount), draft.currency));
    props.setStatus({ tone: "success", text: "账期已结算" });
    props.onClose();
    return true;
  } catch (error) {
    props.setStatus({ tone: "error", text: error instanceof Error ? error.message : "结算失败" });
    return false;
  }
}

function revoke(props: Parameters<typeof StatementPanel>[0], setConfirmOpen: (open: boolean) => void) {
  try {
    props.setData(revokeStatementSettlement(props.data, props.statement.id));
    props.setStatus({ tone: "success", text: "已撤销结算" });
    setConfirmOpen(false);
  } catch (error) {
    props.setStatus({ tone: "error", text: error instanceof Error ? error.message : "撤销失败" });
  }
}

function removeStatement(props: Parameters<typeof StatementPanel>[0], setDeleteOpen: (open: boolean) => void) {
  try {
    props.setData(deleteStatement(props.data, props.statement.id));
    props.setStatus({ tone: "success", text: "账期已删除" });
    setDeleteOpen(false);
  } catch (error) {
    props.setStatus({ tone: "error", text: error instanceof Error ? error.message : "账期删除失败" });
  }
}

function statusClass(paid: boolean): string {
  const common = "rounded-md px-2 py-1 text-xs font-medium";
  return paid ? `${common} bg-(--color-success-soft) text-(--color-success)` : `${common} bg-(--color-warning-soft) text-(--color-warning)`;
}

function dateRange(start: string, end: string): string {
  return `${new Date(start).toLocaleDateString("zh-CN")} - ${new Date(end).toLocaleDateString("zh-CN")}`;
}

function sourceOptions(data: AppData, statementAccountId: string) {
  return [
    { value: "", label: "未记录" },
    ...data.accounts.filter((item) => item.id !== statementAccountId).map((item) => ({ value: item.id, label: item.name })),
  ];
}
