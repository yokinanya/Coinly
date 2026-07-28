import { Bot, CheckCircle2, CircleX, Copy, LoaderCircle, RefreshCcw, Square } from "lucide-react";
import { Message, MessageAction, MessageActions, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import type { AiHubMessage } from "./aiSession";
import { AiCandidateReview } from "./AiCandidateReview";
import type { AppData } from "../domain/types";

const SUGGESTIONS = [
  "分析本月收支",
  "餐饮花了多少？",
  "记录一笔今天午餐 38 元",
] as const;

export function AiConversation(props: {
  readonly data: AppData;
  readonly messages: readonly AiHubMessage[];
  readonly pending: boolean;
  readonly onSuggestion: (text: string) => void;
  readonly onRegenerate: () => void;
  readonly onCopy: (text: string) => void;
  readonly onCandidatesChange: (messageId: string, candidates: NonNullable<AiHubMessage["candidates"]>) => void;
  readonly onCandidatesSave: (messageId: string) => void;
  readonly onRetryCommit: (message: AiHubMessage) => void;
}) {
  return (
    <Conversation aria-live="polite" aria-busy={props.pending}>
      <ConversationContent>
        {props.messages.length === 0
          ? <AiWelcome onSuggestion={props.onSuggestion} />
          : props.messages.map((message, index) => (
            <AiMessage
              key={message.id}
              data={props.data}
              message={message}
              latest={index === props.messages.length - 1}
              onCopy={props.onCopy}
              onRegenerate={props.onRegenerate}
              onCandidatesChange={props.onCandidatesChange}
              onCandidatesSave={props.onCandidatesSave}
              onRetryCommit={props.onRetryCommit}
            />
          ))}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

function AiWelcome(props: { readonly onSuggestion: (text: string) => void }) {
  return (
    <section className="ai-welcome" aria-labelledby="ai-welcome-title">
      <span className="ai-welcome-icon"><Bot size={22} aria-hidden="true" /></span>
      <div>
        <h2 id="ai-welcome-title" className="text-pretty text-base font-semibold text-(--color-text)">你的财务 Copilot</h2>
        <p className="mt-1 text-sm text-(--color-text-secondary)">可以连续问账、分析趋势，或生成待确认的交易。</p>
      </div>
      <div className="ai-suggestions" aria-label="快捷问题">
        {SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" onClick={() => props.onSuggestion(suggestion)}>{suggestion}</button>)}
      </div>
    </section>
  );
}

function AiMessage(props: {
  readonly data: AppData;
  readonly message: AiHubMessage;
  readonly latest: boolean;
  readonly onCopy: (text: string) => void;
  readonly onRegenerate: () => void;
  readonly onCandidatesChange: (messageId: string, candidates: NonNullable<AiHubMessage["candidates"]>) => void;
  readonly onCandidatesSave: (messageId: string) => void;
  readonly onRetryCommit: (message: AiHubMessage) => void;
}) {
  const assistant = props.message.role === "assistant";
  return (
    <Message from={props.message.role}>
      <MessageContent className={props.message.error ? "text-(--color-error)" : undefined}>
        {props.message.attachments && props.message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {props.message.attachments.map((attachment) => (
              <img key={attachment.url} className="max-h-72 max-w-full rounded-md object-contain" src={attachment.url} alt={attachment.name} />
            ))}
          </div>
        )}
        {props.message.text && (assistant
          ? <MessageResponse isAnimating={props.message.pending}>{props.message.text}</MessageResponse>
          : <p className="whitespace-pre-wrap">{props.message.text}</p>)}
        {props.message.pending && !props.message.text && <span className="inline-flex items-center gap-2 text-(--color-text-secondary)"><LoaderCircle className="animate-spin" size={15} aria-hidden="true" />正在思考…</span>}
      </MessageContent>
      {props.message.tools?.map((tool) => <ToolStatus key={tool.callId} label={tool.label} state={tool.state} />)}
      {props.message.candidates && props.message.candidates.length > 0 && (
        <AiCandidateReview
          data={props.data}
          candidates={props.message.candidates}
          onChange={(candidates) => props.onCandidatesChange(props.message.id, candidates)}
          onSave={() => props.onCandidatesSave(props.message.id)}
        />
      )}
      {assistant && props.latest && !props.message.pending && !props.message.error && props.message.text && (
        <MessageActions>
          <MessageAction label="复制回答" onClick={() => props.onCopy(props.message.text)}><Copy size={15} aria-hidden="true" /></MessageAction>
          <MessageAction label="重新生成" onClick={props.onRegenerate}><RefreshCcw size={15} aria-hidden="true" /></MessageAction>
        </MessageActions>
      )}
      {assistant && props.latest && props.message.error && props.message.commitResult && (
        <MessageActions>
          <MessageAction label="重试确认" onClick={() => props.onRetryCommit(props.message)}><RefreshCcw size={15} aria-hidden="true" /></MessageAction>
        </MessageActions>
      )}
    </Message>
  );
}

function ToolStatus(props: { readonly label: string; readonly state: "running" | "complete" | "failed" | "cancelled" }) {
  return (
    <div className="ai-tool-status" role="status">
      {props.state === "running" && <LoaderCircle className="animate-spin" size={14} aria-hidden="true" />}
      {props.state === "complete" && <CheckCircle2 size={14} aria-hidden="true" />}
      {props.state === "failed" && <CircleX size={14} aria-hidden="true" />}
      {props.state === "cancelled" && <Square size={14} aria-hidden="true" />}
      <span>{props.label}</span>
    </div>
  );
}
