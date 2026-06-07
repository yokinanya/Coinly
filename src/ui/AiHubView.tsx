import { Camera, Check, Pencil, Sparkles, Tags } from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { AnalysisScope } from "../ai/context";
import { resolveAiModelCapabilities } from "../ai/modelCapabilities";
import { createAiProvider } from "../ai/provider";
import { validateCategoryTagSuggestion, validateTransactionDraft, validateTransactionDrafts, type CategoryTagSuggestion } from "../ai/validation";
import { createId, createTransaction } from "../domain/factory";
import { upsertTransaction, validateTransactionDraft as validateDraft } from "../domain/operations";
import type { AppData, Transaction, TransactionDraft } from "../domain/types";
import { ErrorBanner, MessageBanner, PageHeader, SelectField } from "./common";
import type { FormOption, StatusMessage } from "./common";
import { Button, Checkbox, Input, Tabs, Upload } from "./components";
import { money } from "./format";
import { TRANSACTION_KIND_LABELS } from "./labels";
import { MarkdownContent } from "./MarkdownContent";
import { Message } from "./toastApi";
import { TransactionForm } from "./TransactionForm";
import { draftFromTransaction } from "./transactionDraft";
import { runAiAnalysis } from "./analysisActions";
import { withRecentEntry } from "./entryDraftMemory";

const ANALYSIS_SCOPE_OPTIONS: readonly FormOption[] = [
  { value: "current-month", label: "本月" },
  { value: "last-3-months", label: "近 3 个月" },
  { value: "last-6-months", label: "近 6 个月" },
  { value: "year-to-date", label: "今年" },
];

const ASK_EXAMPLES = ["这个月餐饮花了多少？", "近 3 个月支出最高的分类是什么？", "有哪些交易缺少分类？"] as const;

interface AiHubViewProps {
  readonly data: AppData;
  readonly setData: (data: AppData) => void;
}

interface CandidateRow {
  readonly id: string;
  readonly draft?: TransactionDraft;
  readonly selected: boolean;
  readonly editing: boolean;
  readonly errors: readonly string[];
}

interface SuggestionRow {
  readonly transaction: Transaction;
  readonly selected: boolean;
  readonly suggestion?: CategoryTagSuggestion;
  readonly errors: readonly string[];
}

type AiTone = "idle" | "loading" | "success" | "error";

export function AiHubView(props: AiHubViewProps) {
  const [activeKey, setActiveKey] = useState("entry");
  return (
    <section className="space-y-5">
      <PageHeader title="AI" />
      <Tabs
        activeKey={activeKey}
        onChange={setActiveKey}
        items={[
          { key: "entry", label: <TabLabel icon={<Sparkles size={16} />} text="AI 记账" />, children: <AiEntryPanel data={props.data} setData={props.setData} /> },
          { key: "analysis", label: <TabLabel icon={<Sparkles size={16} />} text="AI 分析" />, children: <AiAnalysisPanel data={props.data} /> },
          { key: "ask", label: <TabLabel icon={<Sparkles size={16} />} text="AI 问账" />, children: <AiAskPanel data={props.data} /> },
          { key: "suggest", label: <TabLabel icon={<Tags size={16} />} text="智能补全" />, children: <AiSuggestionPanel data={props.data} setData={props.setData} /> },
        ]}
      />
    </section>
  );
}

function TabLabel(props: { readonly icon: ReactNode; readonly text: string }) {
  return <span className="inline-flex items-center gap-2">{props.icon}{props.text}</span>;
}

function AiEntryPanel(props: AiHubViewProps) {
  const [text, setText] = useState("");
  const [state, setState] = useState<{ readonly tone: AiTone; readonly text: string }>({ tone: "idle", text: "" });
  const [rows, setRows] = useState<readonly CandidateRow[]>([]);
  const [saving, setSaving] = useState(false);
  const pending = state.tone === "loading";
  const canParseText = text.trim().length > 0;
  const supportsVision = props.data.aiSettings ? resolveAiModelCapabilities(props.data.aiSettings).supportsVision : false;
  const parseSingle = () => runEntryAi({ task: () => createAiProvider(props.data.aiSettings).parseText(text, props.data), data: props.data, setRows, setState });
  const parseBatch = () => runEntryAiBatch({ task: () => createAiProvider(props.data.aiSettings).parseTextBatch(text, props.data), data: props.data, setRows, setState });
  const parseImage = (file: File) => {
    runEntryAi({ task: () => createAiProvider(props.data.aiSettings).parseImage(file, props.data), data: props.data, setRows, setState });
    return Upload.LIST_IGNORE;
  };
  const saveSelected = () => saveCandidateRows({ ...props, rows, saving, setRows, setSaving, setState });
  return (
    <div className="space-y-4">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-(--color-text)">AI 记账</h2>
          <div className="flex flex-wrap gap-2">
            <Button loading={pending} disabled={pending || !canParseText} onClick={parseSingle}><Sparkles size={16} />解析单笔</Button>
            <Button loading={pending} disabled={pending || !canParseText} onClick={parseBatch}><Sparkles size={16} />批量解析</Button>
            <Upload accept="image/*" beforeUpload={parseImage} disabled={!supportsVision} maxCount={1} showUploadList={false}>
              <Button loading={pending} disabled={pending || !supportsVision} icon={<Camera size={16} />}>解析图片</Button>
            </Upload>
          </div>
        </div>
        <Input.TextArea autoSize={{ minRows: 3, maxRows: 8 }} value={text} onChange={(value) => setText(String(value))} placeholder="星巴克 38 元，餐饮，今天下午" />
        <AiMessage state={state} />
        {!supportsVision && <p className="text-xs text-(--color-text-secondary)">当前模型未开启图片能力。</p>}
      </section>
      {rows.length > 0 && <CandidateList data={props.data} rows={rows} saving={saving} setRows={setRows} onSave={saveSelected} />}
    </div>
  );
}

function CandidateList(props: {
  readonly data: AppData;
  readonly rows: readonly CandidateRow[];
  readonly saving: boolean;
  readonly setRows: (rows: readonly CandidateRow[]) => void;
  readonly onSave: () => void;
}) {
  const validSelected = props.rows.filter((row) => row.selected && row.draft && row.errors.length === 0).length;
  return (
    <section className="panel space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-(--color-text)">识别结果</h2>
        <div className="flex gap-2">
          <Button disabled={validSelected === 0} onClick={() => props.setRows(props.rows.map((row) => ({ ...row, selected: Boolean(row.draft) && row.errors.length === 0 })))}>全选有效</Button>
          <Button variant="primary" loading={props.saving} disabled={validSelected === 0 || props.saving} onClick={props.onSave}><Check size={16} />保存选中 {validSelected}</Button>
        </div>
      </div>
      <div className="space-y-3">
        {props.rows.map((row, index) => <CandidateCard key={row.id} data={props.data} index={index} row={row} setRows={props.setRows} rows={props.rows} />)}
      </div>
    </section>
  );
}

function CandidateCard(props: { readonly data: AppData; readonly rows: readonly CandidateRow[]; readonly row: CandidateRow; readonly index: number; readonly setRows: (rows: readonly CandidateRow[]) => void }) {
  const row = props.row;
  const replace = (next: CandidateRow) => props.setRows(props.rows.map((item) => item.id === row.id ? next : item));
  return (
    <div className="row-card space-y-3 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <Checkbox checked={row.selected} disabled={!row.draft || row.errors.length > 0} onChange={(selected) => replace({ ...row, selected })} />
          <div className="min-w-0">
            <div className="font-semibold text-(--color-text)">候选 {props.index + 1}</div>
            {row.draft && <CandidateSummary data={props.data} draft={row.draft} />}
            {row.errors.length > 0 && <p className="mt-2 text-sm text-(--color-error)">{row.errors.join("；")}</p>}
          </div>
        </div>
        {row.draft && <Button onClick={() => replace({ ...row, editing: !row.editing })}><Pencil size={16} />{row.editing ? "收起" : "编辑"}</Button>}
      </div>
      {row.draft && row.editing && (
        <div className="border-t border-(--color-border) pt-3">
          <TransactionForm embedded data={props.data} draft={row.draft} onChange={(draft) => replace({ ...row, draft, errors: [] })} onSubmit={() => replace({ ...row, editing: false })} submitLabel="更新候选" />
        </div>
      )}
    </div>
  );
}

function AiAnalysisPanel(props: { readonly data: AppData }) {
  const [scope, setScope] = useState<AnalysisScope>("current-month");
  const [aiText, setAiText] = useState("");
  const [aiError, setAiError] = useState("");
  const [pending, setPending] = useState(false);
  const run = () => runAiAnalysis({ data: props.data, scope, setAiText, setAiError, setPending });
  return (
    <section className="max-w-3xl space-y-4">
      <div className="grid gap-4 sm:grid-cols-[minmax(12rem,18rem)_auto] sm:items-end">
        <SelectField label="分析范围" value={scope} options={ANALYSIS_SCOPE_OPTIONS} onChange={(value) => setScope(value as AnalysisScope)} />
        <Button variant="primary" loading={pending} disabled={pending} onClick={run}><Sparkles size={16} />分析账单</Button>
      </div>
      <ErrorBanner message={aiError} />
      {aiText && <MarkdownContent content={aiText} />}
    </section>
  );
}

function AiAskPanel(props: { readonly data: AppData }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const ask = () => {
    if (!question.trim()) return;
    setPending(true);
    setError("");
    Promise.resolve()
      .then(() => createAiProvider(props.data.aiSettings).ask(question, props.data))
      .then(setAnswer)
      .catch((error: unknown) => setError(error instanceof Error ? error.message : "AI 问账失败"))
      .finally(() => setPending(false));
  };
  return (
    <section className="max-w-3xl space-y-4">
      <div className="flex flex-wrap gap-2">
        {ASK_EXAMPLES.map((example) => <Button key={example} variant="ghost" onClick={() => setQuestion(example)}>{example}</Button>)}
      </div>
      <Input.TextArea autoSize={{ minRows: 3, maxRows: 7 }} value={question} onChange={(value) => setQuestion(String(value))} placeholder="这个月餐饮花了多少？" />
      <div className="flex justify-end">
        <Button variant="primary" loading={pending} disabled={pending || !question.trim()} onClick={ask}><Sparkles size={16} />提问</Button>
      </div>
      <ErrorBanner message={error} />
      {answer && <MarkdownContent content={answer} />}
    </section>
  );
}

function AiSuggestionPanel(props: AiHubViewProps) {
  const targets = useMemo(() => props.data.transactions.filter(needsSuggestion).slice(0, 20), [props.data.transactions]);
  const [rows, setRows] = useState<readonly SuggestionRow[]>([]);
  const [state, setState] = useState<{ readonly tone: AiTone; readonly text: string }>({ tone: "idle", text: "" });
  const [saving, setSaving] = useState(false);
  const pending = state.tone === "loading";
  const generate = () => generateSuggestions({ ...props, targets, setRows, setState });
  const apply = () => applySuggestions({ ...props, rows, saving, setRows, setSaving, setState });
  const selected = rows.filter((row) => row.selected && row.suggestion).length;
  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-(--color-text)">智能补全</h2>
        <div className="flex gap-2">
          <Button loading={pending} disabled={pending || targets.length === 0} onClick={generate}><Sparkles size={16} />生成建议</Button>
          <Button variant="primary" loading={saving} disabled={selected === 0 || saving} onClick={apply}><Check size={16} />应用选中 {selected}</Button>
        </div>
      </div>
      <AiMessage state={state} />
      {targets.length === 0 && <p className="text-sm text-(--color-text-secondary)">暂无需要补全的交易。</p>}
      {rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row) => <SuggestionCard key={row.transaction.id} data={props.data} row={row} rows={rows} setRows={setRows} />)}
        </div>
      )}
    </section>
  );
}

function SuggestionCard(props: { readonly data: AppData; readonly row: SuggestionRow; readonly rows: readonly SuggestionRow[]; readonly setRows: (rows: readonly SuggestionRow[]) => void }) {
  const row = props.row;
  const replace = (next: SuggestionRow) => props.setRows(props.rows.map((item) => item.transaction.id === row.transaction.id ? next : item));
  return (
    <div className="row-card flex items-start justify-between gap-3 p-3">
      <div className="flex min-w-0 items-start gap-3">
        <Checkbox checked={row.selected} disabled={!row.suggestion || row.errors.length > 0} onChange={(selected) => replace({ ...row, selected })} />
        <div className="min-w-0 text-sm">
          <div className="font-semibold text-(--color-text)">{row.transaction.note || TRANSACTION_KIND_LABELS[row.transaction.kind]}</div>
          <div className="mt-1 text-(--color-text-secondary)">{money(row.transaction.amount, row.transaction.currency)} · {new Date(row.transaction.occurredAt).toLocaleDateString("zh-CN")}</div>
          {row.suggestion && <div className="mt-2 text-(--color-text-secondary)">{suggestionText(props.data, row.suggestion)}</div>}
          {row.errors.length > 0 && <div className="mt-2 text-(--color-error)">{row.errors.join("；")}</div>}
        </div>
      </div>
      {row.suggestion && <span className="text-xs text-(--color-text-muted)">{Math.round(row.suggestion.confidence * 100)}%</span>}
    </div>
  );
}

function CandidateSummary(props: { readonly data: AppData; readonly draft: TransactionDraft }) {
  const account = props.data.accounts.find((item) => item.id === props.draft.accountId)?.name ?? "未匹配账户";
  const category = props.data.categories.find((item) => item.id === props.draft.categoryId)?.name ?? "未选择";
  const tags = props.draft.tagIds.map((id) => props.data.tags.find((item) => item.id === id)?.name).filter(Boolean).join("，") || "无标签";
  return <div className="mt-1 truncate text-sm text-(--color-text-secondary)" title={`${account} · ${category} · ${tags}`}>{TRANSACTION_KIND_LABELS[props.draft.kind]} · {money(props.draft.amount, props.draft.currency)} · {account} · {category} · {tags}</div>;
}

function AiMessage(props: { readonly state: { readonly tone: AiTone; readonly text: string } }) {
  const tone = props.state.tone === "idle" || props.state.tone === "loading" ? "info" : props.state.tone;
  return <MessageBanner message={props.state.text} tone={tone as StatusMessage["tone"]} />;
}

function runEntryAi(options: {
  readonly task: () => Promise<TransactionDraft>;
  readonly data: AppData;
  readonly setRows: (rows: readonly CandidateRow[]) => void;
  readonly setState: (state: { readonly tone: AiTone; readonly text: string }) => void;
}) {
  options.setState({ tone: "loading", text: "AI 正在解析输入" });
  Promise.resolve()
    .then(options.task)
    .then((candidate) => {
      const result = validateTransactionDraft(candidate, options.data);
      if (!result.valid || !result.draft) throw new Error(result.errors.join("；"));
      options.setRows([candidateRow(result.draft)]);
      options.setState({ tone: "success", text: "已生成识别结果，请确认后保存" });
    })
    .catch((error: unknown) => options.setState({ tone: "error", text: error instanceof Error ? error.message : "AI 解析失败" }));
}

function runEntryAiBatch(options: {
  readonly task: () => Promise<readonly TransactionDraft[]>;
  readonly data: AppData;
  readonly setRows: (rows: readonly CandidateRow[]) => void;
  readonly setState: (state: { readonly tone: AiTone; readonly text: string }) => void;
}) {
  options.setState({ tone: "loading", text: "AI 正在批量解析输入" });
  Promise.resolve()
    .then(options.task)
    .then((candidates) => {
      const rows = validateTransactionDrafts(candidates, options.data).map((result) => result.draft ? candidateRow(result.draft) : invalidCandidateRow(result.errors));
      options.setRows(rows);
      const validCount = rows.filter((row) => row.draft && row.errors.length === 0).length;
      options.setState({ tone: validCount > 0 ? "success" : "error", text: `已解析 ${validCount} 笔有效候选` });
    })
    .catch((error: unknown) => options.setState({ tone: "error", text: error instanceof Error ? error.message : "AI 批量解析失败" }));
}

function saveCandidateRows(options: AiHubViewProps & {
  readonly rows: readonly CandidateRow[];
  readonly saving: boolean;
  readonly setRows: (rows: readonly CandidateRow[]) => void;
  readonly setSaving: (saving: boolean) => void;
  readonly setState: (state: { readonly tone: AiTone; readonly text: string }) => void;
}) {
  if (options.saving) return;
  options.setSaving(true);
  const selected = options.rows.filter((row): row is CandidateRow & { readonly draft: TransactionDraft } => row.selected && Boolean(row.draft) && row.errors.length === 0);
  let updated = options.data;
  const savedIds = new Set<string>();
  const errors: string[] = [];
  for (const row of selected) {
    const result = validateDraft(updated, row.draft);
    if (!result.valid) {
      errors.push(result.errors.join("；"));
      continue;
    }
    updated = withRecentEntry(upsertTransaction(updated, createTransaction(row.draft)), row.draft);
    savedIds.add(row.id);
  }
  if (updated !== options.data) options.setData(updated);
  options.setRows(options.rows.filter((row) => !savedIds.has(row.id)));
  const text = errors.length > 0 ? `部分候选保存失败：${errors.join("；")}` : `已保存 ${selected.length} 笔交易`;
  options.setState({ tone: errors.length > 0 ? "error" : "success", text });
  Message[errors.length > 0 ? "error" : "success"](text);
  window.setTimeout(() => options.setSaving(false), 200);
}

function generateSuggestions(options: AiHubViewProps & {
  readonly targets: readonly Transaction[];
  readonly setRows: (rows: readonly SuggestionRow[]) => void;
  readonly setState: (state: { readonly tone: AiTone; readonly text: string }) => void;
}) {
  options.setState({ tone: "loading", text: "AI 正在生成分类和标签建议" });
  Promise.resolve()
    .then(() => {
      const provider = createAiProvider(options.data.aiSettings);
      return Promise.all(options.targets.map((transaction) => provider.suggestCategoryTag(draftFromTransaction(transaction), options.data)
        .then((value) => {
          const result = validateCategoryTagSuggestion(value, options.data, draftFromTransaction(transaction));
          const hasSuggestion = Boolean(result.suggestion?.categoryId || result.suggestion?.tagIds.length);
          return { transaction, selected: hasSuggestion, suggestion: result.suggestion, errors: result.errors } satisfies SuggestionRow;
        })
        .catch((error: unknown) => ({ transaction, selected: false, suggestion: undefined, errors: [error instanceof Error ? error.message : "AI 建议失败"] } satisfies SuggestionRow))));
    })
    .then((rows) => {
      options.setRows(rows);
      options.setState({ tone: "success", text: `已生成 ${rows.filter((row) => row.suggestion).length} 条建议` });
    })
    .catch((error: unknown) => options.setState({ tone: "error", text: error instanceof Error ? error.message : "AI 建议失败" }));
}

function applySuggestions(options: AiHubViewProps & {
  readonly rows: readonly SuggestionRow[];
  readonly saving: boolean;
  readonly setRows: (rows: readonly SuggestionRow[]) => void;
  readonly setSaving: (saving: boolean) => void;
  readonly setState: (state: { readonly tone: AiTone; readonly text: string }) => void;
}) {
  if (options.saving) return;
  options.setSaving(true);
  const selected = options.rows.filter((row): row is SuggestionRow & { readonly suggestion: CategoryTagSuggestion } => row.selected && Boolean(row.suggestion));
  let updated = options.data;
  for (const row of selected) {
    updated = upsertTransaction(updated, {
      ...row.transaction,
      categoryId: row.suggestion.categoryId ?? row.transaction.categoryId,
      tagIds: row.suggestion.tagIds.length > 0 ? row.suggestion.tagIds : row.transaction.tagIds,
    });
  }
  if (updated !== options.data) options.setData(updated);
  options.setRows(options.rows.filter((row) => !selected.some((applied) => applied.transaction.id === row.transaction.id)));
  const text = `已应用 ${selected.length} 条建议`;
  options.setState({ tone: "success", text });
  Message.success(text);
  window.setTimeout(() => options.setSaving(false), 200);
}

function candidateRow(draft: TransactionDraft): CandidateRow {
  return { id: createId(), draft, selected: true, editing: false, errors: [] };
}

function invalidCandidateRow(errors: readonly string[]): CandidateRow {
  return { id: createId(), selected: false, editing: false, errors };
}

function needsSuggestion(transaction: Transaction): boolean {
  return (transaction.kind === "income" || transaction.kind === "expense" || transaction.kind === "refund") && (!transaction.categoryId || transaction.tagIds.length === 0);
}

function suggestionText(data: AppData, suggestion: CategoryTagSuggestion): string {
  const category = data.categories.find((item) => item.id === suggestion.categoryId)?.name ?? "不改分类";
  const tags = suggestion.tagIds.map((id) => data.tags.find((item) => item.id === id)?.name).filter(Boolean).join("，") || "不改标签";
  return `${category} · ${tags}`;
}