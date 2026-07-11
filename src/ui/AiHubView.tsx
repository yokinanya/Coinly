import { ArrowUp, Bot, Check, ChevronUp, ImagePlus, LoaderCircle, Plus, Settings2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveAiModelCapabilities } from "../ai/modelCapabilities";
import { createAiProvider } from "../ai/provider";
import { defaultAiSettings, normalizeAiSettings, selectActiveModel, selectActiveProvider, selectTextModel, withAiSelection } from "../ai/settings";
import { bumpVersion, createId, createTransaction } from "../domain/factory";
import { upsertTransaction } from "../domain/operations";
import type { AiSettings, AppData, TransactionDraft } from "../domain/types";
import { validateTransactionDraft } from "../ai/validation";
import { Button, FloatingMenu, Input, Upload } from "./components";
import { money } from "./format";
import { MarkdownContent } from "./MarkdownContent";
import { AiProviderManagerDialog } from "./AiProviderManager";

interface AiHubViewProps { readonly data: AppData; readonly setData: (data: AppData) => void; }
interface ChatMessage { readonly id: string; readonly role: "assistant" | "user"; readonly text: string; readonly imageUrl?: string; readonly imageName?: string; readonly pending?: boolean; }
interface AttachedImage { readonly file: File; readonly url: string; }
interface SessionModelOption { readonly value: string; readonly label: string; readonly providerId: string; readonly providerName: string; }

const WELCOME_MESSAGE: ChatMessage = { id: "welcome", role: "assistant", text: "你可以直接问账、粘贴消费记录，或让我分析账本。" };

export function AiHubView(props: AiHubViewProps) {
  const configuredSettings = props.data.aiSettings ?? defaultAiSettings();
  const modelOptions = useMemo(() => sessionModelOptions(configuredSettings), [configuredSettings]);
  const [sessionModel, setSessionModel] = useState(() => sessionDefaultSelectionValue(configuredSettings));
  const selectedModel = modelOptions.some((option) => option.value === sessionModel) ? sessionModel : sessionDefaultSelectionValue(configuredSettings);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelEditorOpen, setModelEditorOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachedImage, setAttachedImage] = useState<AttachedImage>();
  const [candidates, setCandidates] = useState<readonly TransactionDraft[]>([]);
  const [pending, setPending] = useState(false);
  const [messages, setMessages] = useState<readonly ChatMessage[]>([WELCOME_MESSAGE]);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const modelTriggerRef = useRef<HTMLButtonElement>(null);
  const requestEpochRef = useRef(0);
  const imageUrlsRef = useRef(new Set<string>());
  const sessionData = useMemo(() => withSessionModel(props.data, selectedModel), [props.data, selectedModel]);
  const supportsVision = useMemo(() => resolveAiModelCapabilities(selectTextModel(sessionData.aiSettings ?? defaultAiSettings())).supportsVision, [sessionData.aiSettings]);

  useEffect(() => { conversationEndRef.current?.scrollIntoView?.({ block: "end", behavior: "smooth" }); }, [messages]);

  const submit = async () => {
    const text = draft.trim();
    const image = attachedImage?.file;
    if ((!text && !image) || pending) return;
    const requestEpoch = requestEpochRef.current;
    const pendingId = createId();
    setDraft("");
    setAttachedImage(undefined);
    setMessages((current) => [...current, { id: createId(), role: "user", text, imageUrl: attachedImage?.url, imageName: image?.name }, { id: pendingId, role: "assistant", pending: true, text: "正在处理…" }]);
    setPending(true);
    try {
      const response = await createAiProvider(sessionData.aiSettings).ask(text || "请根据这张图片回答。", sessionData, image);
      const nextCandidates = response.transactionDrafts.flatMap((draft) => {
        const result = validateTransactionDraft(draft, sessionData);
        return result.valid && result.draft ? [result.draft] : [];
      });
      if (requestEpoch === requestEpochRef.current) setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, text: response.answer, pending: false } : message));
      if (requestEpoch === requestEpochRef.current) setCandidates(nextCandidates);
    } catch (error) {
      const failure = error instanceof Error ? error.message : "AI 调用失败";
      if (requestEpoch === requestEpochRef.current) setMessages((current) => current.map((message) => message.id === pendingId ? { ...message, text: failure, pending: false } : message));
    } finally {
      if (requestEpoch === requestEpochRef.current) setPending(false);
    }
  };

  const newConversation = () => {
    requestEpochRef.current += 1;
    for (const url of imageUrlsRef.current) URL.revokeObjectURL(url);
    imageUrlsRef.current.clear();
    setMessages([WELCOME_MESSAGE]);
    setDraft("");
    setAttachedImage(undefined);
    setCandidates([]);
    setPending(false);
    setSessionModel(sessionDefaultSelectionValue(configuredSettings));
  };

  return (
    <section className="mx-auto flex h-[calc(100svh-6.75rem-var(--safe-top)-var(--safe-bottom))] min-h-120 w-full max-w-5xl flex-col md:h-[calc(100vh-3.25rem-var(--safe-top))]">
      <h1 className="sr-only">助手</h1>
      <div className="flex justify-end px-1 pt-2 sm:px-4"><Button className="h-8 min-h-8 px-2" onClick={newConversation} disabled={pending}><Plus size={14} aria-hidden="true" />新会话</Button></div>
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pb-6 pt-2 sm:px-4" aria-live="polite">
        {messages.map((message) => <ChatBubble key={message.id} message={message} />)}
        {candidates.map((draft, index) => <TransactionCandidate key={`${draft.accountId}-${draft.occurredAt}-${draft.amount}-${index}`} data={props.data} draft={draft} onSave={() => { props.setData(upsertTransaction(props.data, createTransaction(draft))); setCandidates((current) => current.filter((_, currentIndex) => currentIndex !== index)); }} />)}
        <div ref={conversationEndRef} aria-hidden="true" />
      </div>
      <form className="ai-composer mx-1 mb-1 sm:mx-4" aria-label="AI 消息" onSubmit={(event) => { event.preventDefault(); submit(); }}>
        <Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={draft} onChange={(value) => setDraft(String(value))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }} name="ai-message" autoComplete="off" aria-label="输入消息" placeholder="输入消息" />
        {attachedImage && <div className="ai-image-attachment"><ImagePlus size={15} aria-hidden="true" /><span className="min-w-0 truncate">{attachedImage.file.name}</span><button type="button" aria-label="移除图片" title="移除图片" onClick={() => { URL.revokeObjectURL(attachedImage.url); imageUrlsRef.current.delete(attachedImage.url); setAttachedImage(undefined); }}><X size={14} aria-hidden="true" /></button></div>}
        <div className="flex min-h-9 items-center justify-between gap-3">
          <Upload accept="image/*" beforeUpload={(file) => { const url = URL.createObjectURL(file); imageUrlsRef.current.add(url); setAttachedImage({ file, url }); return Upload.LIST_IGNORE; }} disabled={!supportsVision} maxCount={1} showUploadList={false}>
            <button className="grid h-9 w-9 place-items-center rounded-md text-(--color-text-secondary) hover:bg-(--color-surface-muted) hover:text-(--color-text) disabled:cursor-not-allowed disabled:opacity-50" type="button" aria-label="插入图片" title={supportsVision ? "插入图片" : "当前模型不支持图片"} disabled={!supportsVision}><ImagePlus size={18} aria-hidden="true" /></button>
          </Upload>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <button ref={modelTriggerRef} className="ai-model-trigger" type="button" aria-label="切换模型" aria-haspopup="menu" aria-expanded={modelMenuOpen} onClick={() => setModelMenuOpen((open) => !open)}><span className="min-w-0 truncate">{modelOptions.find((option) => option.value === selectedModel)?.label ?? "选择模型"}</span><ChevronUp className="shrink-0" size={14} aria-hidden="true" /></button>
            {modelMenuOpen && <ModelMenu options={modelOptions} selectedModel={selectedModel} triggerRef={modelTriggerRef} close={() => setModelMenuOpen(false)} selectModel={setSessionModel} openManager={() => setModelEditorOpen(true)} />}
            <Button className="ai-send-button size-9 min-h-9 rounded-md p-0" variant="primary" htmlType="submit" aria-label="发送" title="发送" loading={pending} disabled={(!draft.trim() && !attachedImage) || pending}><ArrowUp size={18} strokeWidth={2.5} aria-hidden="true" /></Button>
          </div>
        </div>
      </form>
      {modelEditorOpen && <AiProviderManagerDialog settings={configuredSettings} onClose={() => setModelEditorOpen(false)} onSave={(settings) => { props.setData(bumpVersion({ ...props.data, aiSettings: settings })); setSessionModel(sessionDefaultSelectionValue(settings)); setModelEditorOpen(false); }} />}
    </section>
  );
}

function ModelMenu(props: { readonly options: readonly SessionModelOption[]; readonly selectedModel: string; readonly triggerRef: React.RefObject<HTMLButtonElement | null>; readonly close: () => void; readonly selectModel: (value: string) => void; readonly openManager: () => void; }) {
  return <FloatingMenu triggerRef={props.triggerRef} close={props.close} preferredHeight={240}><div className="ai-model-menu" role="menu" aria-label="模型列表">{props.options.map((option, index) => <div key={option.value}>{(index === 0 || props.options[index - 1]?.providerId !== option.providerId) && <div className="ai-model-provider-label">{option.providerName}</div>}<button className={option.value === props.selectedModel ? "ai-model-option ai-model-option-selected" : "ai-model-option"} type="button" role="menuitemradio" aria-checked={option.value === props.selectedModel} onClick={() => { props.selectModel(option.value); props.close(); }}><span className="min-w-0 truncate">{option.label}</span>{option.value === props.selectedModel && <Check size={15} aria-hidden="true" />}</button></div>)}<div className="border-t border-(--color-border) pt-1"><button className="ai-model-option" type="button" role="menuitem" onClick={() => { props.close(); props.openManager(); }}><Settings2 size={15} aria-hidden="true" />管理模型</button></div></div></FloatingMenu>;
}

function sessionModelOptions(settings: NonNullable<AppData["aiSettings"]>): readonly SessionModelOption[] {
  const normalized = normalizeAiSettings(settings);
  return normalized.providers.flatMap((provider) => provider.models.filter((model) => model.model).map((model) => ({ value: modelSelectionValue(provider.id, model.id), label: model.name || model.model, providerId: provider.id, providerName: provider.name })));
}

function withSessionModel(data: AppData, selection: string): AppData {
  const settings = normalizeAiSettings(data.aiSettings ?? defaultAiSettings());
  const [providerId, modelId] = selection.split("::");
  return { ...data, aiSettings: withAiSelection(settings, providerId || settings.activeProviderId, modelId || settings.activeModelId) };
}

function sessionDefaultSelectionValue(settings: AiSettings): string {
  const normalized = normalizeAiSettings(settings);
  const provider = selectActiveProvider(normalized);
  const model = provider.models.find((item) => item.id === provider.defaultModelId) ?? selectActiveModel(normalized);
  return modelSelectionValue(provider.id, model.id);
}

function modelSelectionValue(providerId: string, modelId: string): string { return `${providerId}::${modelId}`; }

function ChatBubble(props: { readonly message: ChatMessage }) {
  const assistant = props.message.role === "assistant";
  return <div className={`flex gap-3 ${assistant ? "items-start" : "justify-end"}`}>{assistant && <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-(--color-surface) text-(--color-accent) shadow-sm"><Bot size={16} aria-hidden="true" /></span>}<div className={assistant ? "min-w-0 max-w-3xl pt-1 text-sm text-(--color-text)" : "max-w-[min(36rem,82%)] rounded-md bg-(--color-surface-muted) px-3 py-2 text-sm text-(--color-text)"}>{props.message.pending ? <span className="inline-flex items-center gap-2 text-(--color-text-secondary)"><LoaderCircle className="animate-spin" size={14} aria-hidden="true" />{props.message.text}</span> : <>{props.message.imageUrl && <img className="mb-2 max-h-72 max-w-full rounded-md object-contain" src={props.message.imageUrl} alt={props.message.imageName || "已发送图片"} />}{props.message.text && (assistant ? <MarkdownContent plain content={props.message.text} /> : props.message.text)}</>}</div></div>;
}

function TransactionCandidate(props: { readonly data: AppData; readonly draft: TransactionDraft; readonly onSave: () => void }) {
  const account = props.data.accounts.find((account) => account.id === props.draft.accountId)?.name ?? "未匹配账户";
  return <section className="ml-11 max-w-md border border-(--color-accent) bg-(--color-surface) p-3 text-sm"><p className="font-medium">待确认交易</p><p className="mt-1 text-(--color-text-secondary)">{money(props.draft.amount, props.draft.currency)} · {account} · {props.draft.occurredAt}</p>{props.draft.note && <p className="mt-1 text-(--color-text-secondary)">{props.draft.note}</p>}<div className="mt-3 flex justify-end"><Button variant="primary" onClick={props.onSave}>保存交易</Button></div></section>;
}