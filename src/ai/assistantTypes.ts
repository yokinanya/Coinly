import type { AppData, TransactionDraft } from "../domain/types";

export interface AiConversationMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly image?: File;
}

export interface AiAssistantRequest {
  readonly data: AppData;
  readonly history: readonly AiConversationMessage[];
  readonly input: string;
  readonly image?: File;
  readonly signal?: AbortSignal;
}

export type AiToolName = "query_ledger" | "analyze_ledger" | "prepare_transaction";

export type AiAssistantEvent =
  | { readonly type: "text-delta"; readonly text: string }
  | { readonly type: "tool-start"; readonly callId: string; readonly tool: AiToolName; readonly label: string }
  | { readonly type: "tool-complete"; readonly callId: string; readonly tool: AiToolName; readonly label: string }
  | { readonly type: "candidate-batch"; readonly drafts: readonly unknown[] }
  | { readonly type: "finish"; readonly text: string };

export interface AiAssistantResult {
  readonly text: string;
  readonly transactionDrafts: readonly TransactionDraft[];
}
