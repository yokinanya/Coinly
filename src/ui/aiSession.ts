import type { AiConversationMessage, AiToolName } from "../ai/assistantTypes";
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
  readonly state: "running" | "complete";
}

export interface AiCandidate {
  readonly id: string;
  readonly raw: unknown;
  readonly draft?: TransactionDraft;
  readonly errors: readonly string[];
  readonly selected: boolean;
}

export interface AiHubMessage {
  readonly id: string;
  readonly role: "assistant" | "user";
  readonly text: string;
  readonly attachment?: AiAttachment;
  readonly pending?: boolean;
  readonly error?: boolean;
  readonly tools?: readonly AiToolStatus[];
  readonly candidates?: readonly AiCandidate[];
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
    image: message.attachment?.file,
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
    };
  });
}

export function revokeSessionAttachments(session: AiHubSession): void {
  for (const message of session.messages) {
    if (message.attachment?.url) URL.revokeObjectURL(message.attachment.url);
  }
}
