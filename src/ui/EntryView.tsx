import { Camera, Sparkles } from "lucide-react";
import { useState } from "react";
import { createAiProvider } from "../ai/provider";
import { validateTransactionDraft } from "../ai/validation";
import { createTransaction } from "../domain/factory";
import { upsertTransaction, validateTransactionDraft as validateDraft } from "../domain/operations";
import type { AppData, TransactionDraft } from "../domain/types";
import { ErrorBanner, MessageBanner, SectionPanel, SuccessBanner } from "./common";
import type { StatusMessage } from "./common";
import { money } from "./format";
import { TRANSACTION_KIND_LABELS } from "./labels";
import { Button, Input, Modal, Upload } from "./metis";
import { TransactionForm } from "./TransactionForm";
import { initialTransactionDraft } from "./transactionDraft";

interface EntryDialogProps {
  readonly open: boolean;
  readonly data: AppData;
  readonly setData: (data: AppData) => void;
  readonly setStatus: (status: StatusMessage) => void;
  readonly onClose: () => void;
}

export function EntryDialog(props: EntryDialogProps) {
  const [draft, setDraft] = useState(() => initialDraft(props.data));
  const [candidate, setCandidate] = useState<TransactionDraft>();
  const [aiText, setAiText] = useState("");
  const [message, setMessage] = useState("");
  const saveDraft = () => saveTransactionDraft({ props, draft, setDraft, setMessage });

  return (
    <Modal open={props.open} title="记账" width={1080} footer={null} onCancel={props.onClose}>
      <div className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
          <TransactionForm data={props.data} draft={draft} onChange={setDraft} onSubmit={saveDraft} submitLabel="保存交易" />
          <AiPanel data={props.data} text={aiText} setText={setAiText} setCandidate={setCandidate} />
        </div>
        {candidate && <CandidatePanel value={candidate} onUse={() => applyCandidate({ candidate, setDraft, setCandidate, setMessage, setStatus: props.setStatus })} onCancel={() => setCandidate(undefined)} />}
        <ErrorBanner message={message.includes("失败") || message.includes("请先") ? message : ""} />
        <SuccessBanner message={message && !message.includes("失败") && !message.includes("请先") ? message : ""} />
      </div>
    </Modal>
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
  const parseText = () => runAi(() => createAiProvider(props.data.aiSettings).parseText(props.text, props.data), props, setState);
  const parseImage = (file: File) => {
    runAi(() => createAiProvider(props.data.aiSettings).parseImage(file, props.data), props, setState);
    return Upload.LIST_IGNORE;
  };
  return (
    <div className="panel space-y-4 p-4">
      <h2 className="font-semibold text-[var(--color-text)]">AI 记账解析</h2>
      <Input.TextArea autoSize={{ minRows: 1, maxRows: 6 }} value={props.text} onChange={(value) => props.setText(String(value))} placeholder="例如：星巴克 38 元，餐饮，今天下午" />
      <AiMessage state={state} />
      <div className="flex flex-wrap gap-2">
        <Button loading={pending} disabled={pending} onClick={parseText}><Sparkles size={16} />解析文本</Button>
        <Upload accept="image/*" beforeUpload={parseImage} maxCount={1} showUploadList={false}>
          <Button loading={pending} disabled={pending} icon={<Camera size={16} />}>解析图片</Button>
        </Upload>
      </div>
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
  readonly value: TransactionDraft;
  readonly onUse: () => void;
  readonly onCancel: () => void;
}) {
  return (
    <SectionPanel title="识别结果">
      <div className="grid gap-2 text-sm text-[var(--color-text-secondary)] md:grid-cols-4">
        <span>{TRANSACTION_KIND_LABELS[props.value.kind]}</span>
        <span>{money(props.value.amount, props.value.currency)}</span>
        <span>{new Date(props.value.occurredAt).toLocaleString("zh-CN")}</span>
        <span className="truncate">{props.value.note || "无备注"}</span>
      </div>
      <div className="mt-3 flex gap-2">
        <Button variant="primary" onClick={props.onUse}>填入表单</Button>
        <Button onClick={props.onCancel}>取消</Button>
      </div>
    </SectionPanel>
  );
}

function saveTransactionDraft(options: {
  readonly props: EntryDialogProps;
  readonly draft: TransactionDraft;
  readonly setDraft: (draft: TransactionDraft) => void;
  readonly setMessage: (value: string) => void;
}) {
  const result = validateDraft(options.props.data, options.draft);
  if (!result.valid) {
    options.setMessage(result.errors.join("；"));
    return;
  }
  const updated = withRecentEntry(upsertTransaction(options.props.data, createTransaction(options.draft)), options.draft);
  options.props.setData(updated);
  options.setDraft(initialDraft(updated));
  options.setMessage("交易已保存");
  options.props.onClose();
}

function initialDraft(data: AppData): TransactionDraft {
  const firstAccount = data.accounts[0];
  const recent = data.uiSettings?.recentEntry;
  const account = data.accounts.find((item) => item.id === recent?.accountId) ?? firstAccount;
  return {
    ...initialTransactionDraft(account?.id ?? "", recent?.currency ?? account?.currency ?? "CNY"),
    categoryId: recent?.categoryId,
    tagIds: recent?.tagIds ?? [],
  };
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

function applyCandidate(options: {
  readonly candidate: TransactionDraft;
  readonly setDraft: (draft: TransactionDraft) => void;
  readonly setCandidate: (draft: TransactionDraft | undefined) => void;
  readonly setMessage: (value: string) => void;
  readonly setStatus: (status: StatusMessage) => void;
}) {
  options.setDraft(options.candidate);
  options.setCandidate(undefined);
  options.setMessage("已填入表单");
  options.setStatus({ tone: "info", text: "识别结果已填入表单" });
}
