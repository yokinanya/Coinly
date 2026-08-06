import type { AiAssistantPhase, AiConversationMessage, AiToolName, TransactionCommitResult } from "../ai/assistantTypes";
import type { AppData, TransactionDraft } from "../domain/types";
import { createId } from "../domain/factory";
import { validateTransactionDraft } from "../ai/validation";

export interface AiAttachment {
  readonly file: File;
  readonly url: string;
  readonly name: string;
}

export interface AiToolStatus {
  readonly callId: string;
  readonly tool: AiToolName;
  readonly label: string;
  readonly state: "running" | "complete" | "failed" | "cancelled";
  readonly summary?: string;
}

export interface AiCandidate {
  readonly id: string;
  readonly raw: unknown;
  readonly draft?: TransactionDraft;
  readonly errors: readonly string[];
  readonly selected: boolean;
  readonly sourceImageIndexes?: readonly number[];
}

export interface AiHubMessage {
  readonly id: string;
  readonly role: "assistant" | "user";
  readonly text: string;
  readonly attachments?: readonly AiAttachment[];
  readonly pending?: boolean;
  readonly error?: boolean;
  readonly tools?: readonly AiToolStatus[];
  readonly candidates?: readonly AiCandidate[];
  readonly modelSelection?: string;
  readonly commitResult?: TransactionCommitResult;
  readonly phase?: AiAssistantPhase;
}

export interface AiHubSession {
  readonly messages: readonly AiHubMessage[];
  readonly modelSelection?: string;
  readonly controller?: AbortController;
}

export function emptyAiHubSession(): AiHubSession {
  return { messages: [] };
}

export function conversationHistory(messages: readonly AiHubMessage[]): readonly AiConversationMessage[] {
  return messages.filter((message) => !message.pending && !message.error).map((message) => ({
    role: message.role,
    text: message.text,
    attachmentSummary: message.attachments?.map((attachment, index) => `图片 ${index + 1}: ${attachment.name}`).join("；"),
    toolTraces: message.tools?.flatMap((tool) => tool.summary ? [{ tool: tool.tool, summary: tool.summary }] : []),
    commitResult: message.commitResult,
  }));
}

export function candidateBatch(data: AppData, drafts: readonly unknown[]): readonly AiCandidate[] {
  return drafts.map((raw) => {
    const result = validateTransactionDraft(raw, data);
    return {
      id: createId(),
      raw,
      draft: result.draft,
      errors: result.errors,
      selected: result.valid,
      sourceImageIndexes: imageIndexes(raw),
    };
  });
}

export function revokeSessionAttachments(session: AiHubSession): void {
  for (const message of session.messages) {
    for (const attachment of message.attachments ?? []) URL.revokeObjectURL(attachment.url);
  }
}

function imageIndexes(value: unknown): readonly number[] | undefined {
  if (!value || typeof value !== "object" || !("sourceImageIndexes" in value)) return undefined;
  const indexes = (value as { readonly sourceImageIndexes?: unknown }).sourceImageIndexes;
  return Array.isArray(indexes) && indexes.every((item) => Number.isInteger(item))
    ? indexes as readonly number[]
    : undefined;
}
