import { Camera, ChevronDown, Pencil, Sparkles } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { createAiProvider } from "../ai/provider";
import { resolveAiModelCapabilities } from "../ai/modelCapabilities";
import { validateTransactionDraft } from "../ai/validation";
import { createTransaction } from "../domain/factory";
import { upsertTransaction, validateTransactionDraft as validateDraft } from "../domain/operations";
import type { AppData, TransactionDraft } from "../domain/types";
import { ErrorBanner, MessageBanner, PageHeader, SectionPanel, SuccessBanner } from "./common";
import type { StatusMessage } from "./common";
import { money } from "./format";
import { TRANSACTION_KIND_LABELS } from "./labels";
import { Button, Input, Upload } from "./components";
import { Message } from "./toastApi";
import { TransactionForm } from "./TransactionForm";
import { initialTransactionDraft } from "./transactionDraft";

interface EntryViewProps {
  readonly data: AppData;
  readonly setData: (data: AppData) => void;
  readonly setStatus: (status: StatusMessage) => void;
}

export function EntryView(props: EntryViewProps) {
  const [draft, setDraft] = useState(() => initialDraft(props.data));
  const [candidate, setCandidate] = useState<TransactionDraft>();
  const [candidateEditing, setCandidateEditing] = useState(false);
  const [candidateMessage, setCandidateMessage] = useState<AiState>({ tone: "idle", text: "" });
  const [aiText, setAiText] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const saveDraft = () => saveTransactionDraft({ props, draft, saving, setDraft, setMessage, setSaving });
  const saveCandidate = () => saveCandidateDraft({
    props,
    candidate,
    saving,
    setAiText,
    setCandidate,
    setCandidateEditing,
    setCandidateMessage,
    setDraft,
    setMessage,
    setSaving,
  });
  const replaceCandidate = (next: TransactionDraft) => {
    setCandidate(next);
    setCandidateMessage({ tone: "idle", text: "" });
  };

  return (
    <section className="space-y-5">
      <PageHeader title="记账" />
      <div className="space-y-4">
        <AiPanel data={props.data} text={aiText} setText={setAiText} setCandidate={(value) => receiveCandidate({ value, setCandidate, setCandidateEditing, setCandidateMessage })} />
        {candidate && (
          <CandidatePanel
            data={props.data}
            value={candidate}
            editing={candidateEditing}
            message={candidateMessage}
            saving={saving}
            onChange={replaceCandidate}
            onEdit={() => setCandidateEditing((value) => !value)}
            onSave={saveCandidate}
            onCancel={() => discardCandidate({ setCandidate, setCandidateEditing, setCandidateMessage })}
          />
        )}
        <ErrorBanner message={message.includes("失败") || message.includes("请先") ? message : ""} />
        <SuccessBanner message={message && !message.includes("失败") && !message.includes("请先") ? message : ""} />
        <ManualEntryPanel open={manualOpen} setOpen={setManualOpen}>
          <TransactionForm data={props.data} draft={draft} onChange={setDraft} onSubmit={saveDraft} submitLabel="保存交易" submitting={saving} />
        </ManualEntryPanel>
      </div>
    </section>
  );
}

function AiPanel(props: {
  readonly data: AppData;
  readonly text: string;
  readonly setText: (value: string) => void;
  readonly setCandidate: (draft: TransactionDraft) => void;
}) {
  const [state, setState] = useState<AiState>({ tone: "idle", text: "" });
  const pending = state.tone === "loading";
  const supportsVision = props.data.aiSettings ? resolveAiModelCapabilities(props.data.aiSettings).supportsVision : false;
  const parseText = () => runAi(() => createAiProvider(props.data.aiSettings).parseText(props.text, props.data), props, setState);
  const parseImage = (file: File) => {
    runAi(() => createAiProvider(props.data.aiSettings).parseImage(file, props.data), props, setState);
    return Upload.LIST_IGNORE;
  };
  return (
    <div className="panel space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-[var(--color-text)]">AI 记账</h2>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">输入一句话或上传截图，确认后再写入账本。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button loading={pending} disabled={pending} onClick={parseText}><Sparkles size={16} />解析文本</Button>
          <Upload accept="image/*" beforeUpload={parseImage} disabled={!supportsVision} maxCount={1} showUploadList={false}>
            <Button loading={pending} disabled={pending || !supportsVision} icon={<Camera size={16} />}>解析图片</Button>
          </Upload>
        </div>
      </div>
      <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={props.text} onChange={(value) => props.setText(String(value))} placeholder="例如：星巴克 38 元，餐饮，今天下午" />
      <AiMessage state={state} />
      {!supportsVision && <p className="text-xs text-[var(--color-text-secondary)]">当前 AI 模型不支持图片解析，请在设置中更换多模态模型或手动开启图片能力。</p>}
    </div>
  );
}

interface AiState {
  readonly tone: "idle" | "loading" | "success" | "error";
  readonly text: string;
}

function AiMessage(props: { readonly state: AiState }) {
  const tone = props.state.tone === "idle" || props.state.tone === "loading" ? "info" : props.state.tone;
  return <MessageBanner message={props.state.text} tone={tone} />;
}

function CandidatePanel(props: {
  readonly data: AppData;
  readonly value: TransactionDraft;
  readonly editing: boolean;
  readonly message: AiState;
  readonly saving: boolean;
  readonly onChange: (draft: TransactionDraft) => void;
  readonly onEdit: () => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <SectionPanel title="识别结果">
      <CandidateSummary data={props.data} value={props.value} />
      <AiMessage state={props.message} />
      {props.editing && (
        <div className="mt-4 border-t border-[var(--color-border)] pt-4">
          <TransactionForm embedded data={props.data} draft={props.value} onChange={props.onChange} onSubmit={props.onSave} submitLabel="保存识别结果" />
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <Button variant="primary" loading={props.saving} disabled={props.saving} onClick={props.onSave}>保存</Button>
        <Button onClick={props.onEdit}><Pencil size={16} />{props.editing ? "收起详情" : "编辑详情"}</Button>
        <Button onClick={props.onCancel}>放弃</Button>
      </div>
    </SectionPanel>
  );
}

function CandidateSummary(props: { readonly data: AppData; readonly value: TransactionDraft }) {
  const account = props.data.accounts.find((item) => item.id === props.value.accountId)?.name ?? "未匹配账户";
  const category = props.data.categories.find((item) => item.id === props.value.categoryId)?.name ?? "未选择";
  const tags = props.value.tagIds
    .map((id) => props.data.tags.find((item) => item.id === id)?.name)
    .filter(Boolean)
    .join("，") || "无标签";
  return (
    <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <CandidateItem label="类型" value={TRANSACTION_KIND_LABELS[props.value.kind]} />
      <CandidateItem label="金额" value={money(props.value.amount, props.value.currency)} />
      <CandidateItem label="账户" value={account} />
      <CandidateItem label="分类" value={category} />
      <CandidateItem label="日期" value={new Date(props.value.occurredAt).toLocaleString("zh-CN")} />
      <CandidateItem label="标签" value={tags} />
      <CandidateItem label="备注" value={props.value.note || "无备注"} />
    </div>
  );
}

function CandidateItem(props: { readonly label: string; readonly value: string }) {
  return (
    <div className="row-card min-w-0 p-3">
      <div className="text-xs text-[var(--color-text-secondary)]">{props.label}</div>
      <div className="mt-1 truncate font-medium text-[var(--color-text)]">{props.value}</div>
    </div>
  );
}

function ManualEntryPanel(props: {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly children: ReactNode;
}) {
  return (
    <section className="panel overflow-hidden">
      <button className="flex w-full items-center justify-between gap-3 p-4 text-left" type="button" onClick={() => props.setOpen(!props.open)}>
        <span>
          <span className="block font-semibold text-[var(--color-text)]">手工记账</span>
          <span className="mt-1 block text-xs text-[var(--color-text-secondary)]">AI 不适合时再展开填写完整表单。</span>
        </span>
        <ChevronDown className={props.open ? "rotate-180 transition" : "transition"} size={18} />
      </button>
      {props.open && <div className="border-t border-[var(--color-border)] p-4">{props.children}</div>}
    </section>
  );
}

function saveTransactionDraft(options: {
  readonly props: EntryViewProps;
  readonly draft: TransactionDraft;
  readonly saving: boolean;
  readonly setDraft: (draft: TransactionDraft) => void;
  readonly setMessage: (value: string) => void;
  readonly setSaving: (value: boolean) => void;
}) {
  if (options.saving) return;
  options.setSaving(true);
  const result = validateDraft(options.props.data, options.draft);
  if (!result.valid) {
    options.setMessage(result.errors.join("；"));
    Message.error(result.errors.join("；"));
    options.setSaving(false);
    return;
  }
  const updated = withRecentEntry(upsertTransaction(options.props.data, createTransaction(options.draft)), options.draft);
  options.props.setData(updated);
  options.setDraft(initialDraft(updated));
  options.setMessage("交易已保存");
  Message.success("交易已保存");
  window.setTimeout(() => options.setSaving(false), 200);
}

function saveCandidateDraft(options: {
  readonly props: EntryViewProps;
  readonly candidate: TransactionDraft | undefined;
  readonly saving: boolean;
  readonly setAiText: (value: string) => void;
  readonly setCandidate: (draft: TransactionDraft | undefined) => void;
  readonly setCandidateEditing: (value: boolean) => void;
  readonly setCandidateMessage: (state: AiState) => void;
  readonly setDraft: (draft: TransactionDraft) => void;
  readonly setMessage: (value: string) => void;
  readonly setSaving: (value: boolean) => void;
}) {
  if (options.saving || !options.candidate) return;
  options.setSaving(true);
  const result = validateDraft(options.props.data, options.candidate);
  if (!result.valid) {
    options.setCandidateMessage({ tone: "error", text: result.errors.join("；") });
    options.setSaving(false);
    return;
  }
  const updated = withRecentEntry(upsertTransaction(options.props.data, createTransaction(options.candidate)), options.candidate);
  options.props.setData(updated);
  options.setDraft(initialDraft(updated));
  options.setAiText("");
  options.setCandidate(undefined);
  options.setCandidateEditing(false);
  options.setCandidateMessage({ tone: "success", text: "识别结果已保存" });
  options.setMessage("识别结果已保存");
  Message.success("识别结果已保存");
  window.setTimeout(() => options.setSaving(false), 200);
}

function initialDraft(data: AppData): TransactionDraft {
  const firstAccount = data.accounts[0];
  const recent = data.uiSettings?.recentEntry;
  const account = data.accounts.find((item) => item.id === recent?.accountId) ?? firstAccount;
  const categoryId = validExpenseCategoryId(data, recent?.categoryId);
  return {
    ...initialTransactionDraft(account?.id ?? "", recent?.currency ?? account?.currency ?? "CNY"),
    categoryId,
    tagIds: recent?.tagIds ?? [],
  };
}

function validExpenseCategoryId(data: AppData, categoryId?: string): string | undefined {
  const category = data.categories.find((item) => item.id === categoryId);
  return category?.direction === "expense" ? category.id : undefined;
}

function recentEntry(draft: TransactionDraft) {
  return {
    accountId: draft.accountId,
    currency: draft.currency,
    categoryId: draft.categoryId,
    tagIds: draft.tagIds,
  };
}

function withRecentEntry(data: AppData, draft: TransactionDraft): AppData {
  return {
    ...data,
    uiSettings: {
      ...data.uiSettings,
      theme: data.uiSettings?.theme ?? "system",
      recentEntry: recentEntry(draft),
    },
  };
}

function runAi(
  task: () => Promise<TransactionDraft>,
  props: Pick<Parameters<typeof AiPanel>[0], "data" | "setCandidate">,
  setState: (state: AiState) => void,
) {
  setState({ tone: "loading", text: "AI 正在解析输入" });
  Promise.resolve()
    .then(task)
    .then((candidate) => validateAiCandidate(candidate, props, setState))
    .catch((error: unknown) => {
      const text = error instanceof Error ? error.message : "AI 解析失败";
      setState({ tone: "error", text });
    });
}

function validateAiCandidate(
  candidate: TransactionDraft,
  props: Pick<Parameters<typeof AiPanel>[0], "data" | "setCandidate">,
  setState: (state: AiState) => void,
) {
  setState({ tone: "loading", text: "AI 候选正在校验" });
  const result = validateTransactionDraft(candidate, props.data);
  if (!result.valid || !result.draft) throw new Error(result.errors.join("；"));
  props.setCandidate(result.draft);
  setState({ tone: "success", text: "已生成识别结果，请确认后保存" });
}

function receiveCandidate(options: {
  readonly value: TransactionDraft;
  readonly setCandidate: (draft: TransactionDraft) => void;
  readonly setCandidateEditing: (value: boolean) => void;
  readonly setCandidateMessage: (state: AiState) => void;
}) {
  options.setCandidate(options.value);
  options.setCandidateEditing(false);
  options.setCandidateMessage({ tone: "idle", text: "" });
}

function discardCandidate(options: {
  readonly setCandidate: (draft: TransactionDraft | undefined) => void;
  readonly setCandidateEditing: (value: boolean) => void;
  readonly setCandidateMessage: (state: AiState) => void;
}) {
  options.setCandidate(undefined);
  options.setCandidateEditing(false);
  options.setCandidateMessage({ tone: "idle", text: "" });
}
