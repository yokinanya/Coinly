import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { resolveAiModelCapabilities } from "../ai/modelCapabilities";
import { createAiProvider, type AiAssistantEvent } from "../ai/provider";
import { defaultAiSettings, selectTextModel } from "../ai/settings";
import { bumpVersion, createId, createTransaction } from "../domain/factory";
import { upsertTransaction, validateTransactionDraft as validateDomainDraft } from "../domain/operations";
import type { AppData } from "../domain/types";
import { AiComposer } from "./AiComposer";
import { AiConversation } from "./AiConversation";
import { sessionDefaultSelectionValue, sessionModelOptions, withSessionModel } from "./aiModelSelection";
import { candidateBatch, conversationHistory, emptyAiHubSession, revokeSessionAttachments, type AiAttachment, type AiCandidate, type AiHubMessage, type AiHubSession } from "./aiSession";
import { AiProviderManagerDialog } from "./AiProviderManager";
import { Button } from "./components";
import { Message } from "./toastApi";

interface AiHubViewProps {
  readonly data: AppData;
  readonly setData: (data: AppData) => void;
  readonly session: AiHubSession;
  readonly setSession: React.Dispatch<React.SetStateAction<AiHubSession>>;
}

export function AiHubView(props: AiHubViewProps) {
  const configuredSettings = props.data.aiSettings ?? defaultAiSettings();
  const options = useMemo(() => sessionModelOptions(configuredSettings), [configuredSettings]);
  const defaultSelection = sessionDefaultSelectionValue(configuredSettings);
  const selectedModel = options.some((option) => option.value === props.session.modelSelection)
    ? props.session.modelSelection as string
    : defaultSelection;
  const sessionData = useMemo(() => withSessionModel(props.data, selectedModel), [props.data, selectedModel]);
  const supportsVision = resolveAiModelCapabilities(selectTextModel(sessionData.aiSettings ?? defaultAiSettings())).supportsVision;
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<AiAttachment>();
  const [managerOpen, setManagerOpen] = useState(false);
  const pending = props.session.messages.some((message) => message.pending);

  const submit = () => {
    const text = draft.trim();
    if ((!text && !attachment) || pending) return;
    void runTurn({ text, attachment, priorMessages: props.session.messages });
  };

  const runTurn = async (options: {
    readonly text: string;
    readonly attachment?: AiAttachment;
    readonly priorMessages: readonly AiHubMessage[];
  }) => {
    const userMessage = userHubMessage(options.text, options.attachment);
    const assistantId = createId();
    const messages = [...options.priorMessages, userMessage, pendingAssistantMessage(assistantId)];
    const controller = new AbortController();
    props.setSession((current) => ({ ...current, controller, modelSelection: selectedModel, messages }));
    setDraft("");
    setAttachment(undefined);
    try {
      const stream = createAiProvider(sessionData.aiSettings).streamAssistant({
        data: sessionData,
        history: conversationHistory(options.priorMessages),
        input: options.text,
        image: options.attachment?.file,
        signal: controller.signal,
      });
      for await (const event of stream) applyAssistantEvent(props.setSession, assistantId, sessionData, event);
    } catch (error) {
      const stopped = abortError(error);
      updateMessage(props.setSession, assistantId, (message) => ({
        ...message,
        pending: false,
        error: !stopped,
        text: message.text || (stopped ? "已停止生成。" : errorMessage(error)),
        tools: message.tools?.map((tool) => tool.state === "running" ? { ...tool, state: "complete", label: "执行已中断" } : tool),
      }));
    } finally {
      props.setSession((current) => current.controller === controller ? { ...current, controller: undefined } : current);
    }
  };

  const regenerate = () => {
    if (pending) return;
    const userIndex = findLastUserIndex(props.session.messages);
    if (userIndex < 0) return;
    const user = props.session.messages[userIndex];
    void runTurn({ text: user?.text ?? "", attachment: user?.attachment, priorMessages: props.session.messages.slice(0, userIndex) });
  };

  const newConversation = () => {
    props.session.controller?.abort();
    revokeSessionAttachments(props.session);
    props.setSession({ ...emptyAiHubSession(), modelSelection: defaultSelection });
    if (attachment) URL.revokeObjectURL(attachment.url);
    setAttachment(undefined);
    setDraft("");
  };

  const saveCandidates = (messageId: string) => {
    const message = props.session.messages.find((item) => item.id === messageId);
    const selected = message?.candidates?.filter((candidate) => candidate.selected) ?? [];
    const invalid = selected.filter((candidate) => !candidate.draft || !validateDomainDraft(props.data, candidate.draft).valid);
    if (invalid.length > 0) {
      markInvalidCandidates(props, messageId, invalid);
      return;
    }
    const updated = selected.reduce((data, candidate) => upsertTransaction(data, createTransaction(candidate.draft!)), props.data);
    props.setData(updated);
    updateMessage(props.setSession, messageId, (current) => ({
      ...current,
      candidates: current.candidates?.filter((candidate) => !selected.some((item) => item.id === candidate.id)),
    }));
    Message.success(`已保存 ${selected.length} 笔交易`);
  };

  return (
    <section className="ai-hub">
      <header className="ai-hub-header">
        <div><h1>助手</h1><p>连续问账、分析趋势，并确认 AI 生成的交易。</p></div>
        <Button className="min-h-11" onClick={newConversation} disabled={pending}><Plus size={15} aria-hidden="true" />新会话</Button>
      </header>
      <AiConversation
        data={props.data}
        messages={props.session.messages}
        pending={pending}
        onSuggestion={(text) => void runTurn({ text, priorMessages: props.session.messages })}
        onRegenerate={regenerate}
        onCopy={(text) => navigator.clipboard.writeText(text).then(() => Message.success("已复制回答")).catch(() => Message.error("复制失败"))}
        onCandidatesChange={(messageId, candidates) => updateMessage(props.setSession, messageId, (message) => ({ ...message, candidates }))}
        onCandidatesSave={saveCandidates}
      />
      <div className="ai-composer-shell">
        <AiComposer
          draft={draft}
          attachment={attachment}
          options={options}
          selectedModel={selectedModel}
          supportsVision={supportsVision}
          pending={pending}
          setDraft={setDraft}
          setAttachment={setAttachment}
          selectModel={(modelSelection) => props.setSession((current) => ({ ...current, modelSelection }))}
          openManager={() => setManagerOpen(true)}
          submit={submit}
          stop={() => props.session.controller?.abort()}
        />
      </div>
      {managerOpen && <AiProviderManagerDialog settings={configuredSettings} onClose={() => setManagerOpen(false)} onSave={(settings) => {
        props.setData(bumpVersion({ ...props.data, aiSettings: settings }));
        props.setSession((current) => ({ ...current, modelSelection: sessionDefaultSelectionValue(settings) }));
        setManagerOpen(false);
      }} />}
    </section>
  );
}

function applyAssistantEvent(
  setSession: AiHubViewProps["setSession"],
  messageId: string,
  data: AppData,
  event: AiAssistantEvent,
): void {
  updateMessage(setSession, messageId, (message) => {
    if (event.type === "text-delta") return { ...message, text: message.text + event.text };
    if (event.type === "tool-start") return { ...message, tools: [...(message.tools ?? []), { callId: event.callId, tool: event.tool, label: event.label, state: "running" }] };
    if (event.type === "tool-complete") return { ...message, tools: message.tools?.map((tool) => tool.callId === event.callId ? { ...tool, label: event.label, state: "complete" } : tool) };
    if (event.type === "candidate-batch") return { ...message, candidates: [...(message.candidates ?? []), ...candidateBatch(data, event.drafts)] };
    return { ...message, text: event.text, pending: false };
  });
}

function updateMessage(setSession: AiHubViewProps["setSession"], id: string, update: (message: AiHubMessage) => AiHubMessage): void {
  setSession((session) => ({ ...session, messages: session.messages.map((message) => message.id === id ? update(message) : message) }));
}

function markInvalidCandidates(props: AiHubViewProps, messageId: string, invalid: readonly AiCandidate[]): void {
  updateMessage(props.setSession, messageId, (message) => ({
    ...message,
    candidates: message.candidates?.map((candidate) => {
      if (!invalid.some((item) => item.id === candidate.id)) return candidate;
      const errors = candidate.draft ? validateDomainDraft(props.data, candidate.draft).errors : candidate.errors;
      return { ...candidate, errors };
    }),
  }));
  window.requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-candidate-id="${invalid[0]?.id}"]`)?.focus());
  Message.error("请先修正所选交易中的错误");
}

function userHubMessage(text: string, attachment?: AiAttachment): AiHubMessage {
  return { id: createId(), role: "user", text, attachment };
}

function pendingAssistantMessage(id: string): AiHubMessage {
  return { id, role: "assistant", text: "", pending: true, tools: [], candidates: [] };
}

function findLastUserIndex(messages: readonly AiHubMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "user") return index;
  }
  return -1;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "AI 调用失败";
}

function abortError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}
