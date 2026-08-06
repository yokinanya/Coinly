import type { AppData, Transaction, TransactionDraft, TransactionKind } from "../domain/types";

export interface AiToolTrace {
  readonly tool: AiToolName;
  readonly summary: string;
}

export interface AiConversationMessage {
  readonly role: "user" | "assistant";
  readonly text: string;
  readonly images?: readonly File[];
  readonly attachmentSummary?: string;
  readonly toolTraces?: readonly AiToolTrace[];
  readonly commitResult?: TransactionCommitResult;
}

export interface AiAssistantRequest {
  readonly data: AppData;
  readonly history: readonly AiConversationMessage[];
  readonly input: string;
  readonly images?: readonly File[];
  readonly signal?: AbortSignal;
}

export type AiToolName = "read_ledger" | "prepare_transactions";

export type AiAssistantPhase =
  | "thinking"
  | "reading"
  | "answering"
  | "clarifying"
  | "reviewing"
  | "saving"
  | "completed"
  | "failed";

export type AiAssistantEvent =
  | { readonly type: "phase"; readonly phase: AiAssistantPhase }
  | { readonly type: "text-delta"; readonly text: string }
  | { readonly type: "tool-start"; readonly callId: string; readonly tool: AiToolName; readonly label: string }
  | { readonly type: "tool-complete"; readonly callId: string; readonly tool: AiToolName; readonly label: string; readonly summary: string }
  | { readonly type: "tool-failed"; readonly callId: string; readonly tool: AiToolName; readonly label: string }
  | { readonly type: "candidate-batch"; readonly drafts: readonly unknown[] }
  | { readonly type: "finish"; readonly text: string; readonly phase?: Extract<AiAssistantPhase, "clarifying" | "completed"> };

export interface AiAssistantResult {
  readonly text: string;
  readonly transactionDrafts: readonly PreparedTransactionCandidate[];
}

export interface TransactionCommitResult {
  readonly transactionIds: readonly string[];
  readonly transactions: readonly Pick<
    Transaction,
    "kind" | "accountId" | "amount" | "currency" | "occurredAt" | "relatedAccountId"
  >[];
}

export interface CommitConfirmationRequest {
  readonly history: readonly AiConversationMessage[];
  readonly result: TransactionCommitResult;
  readonly signal?: AbortSignal;
}

export interface PreparedTransactionCandidate extends Partial<TransactionDraft> {
  readonly kind?: TransactionKind;
  readonly sourceImageIndexes?: readonly number[];
}
