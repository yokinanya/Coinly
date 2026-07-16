# AI Tools

Coinly provides a session-scoped financial Copilot. The user writes naturally; the selected model decides whether it needs a read-only ledger query, an analysis context, or transaction candidates.

The assistant streams text and concise tool status into the conversation. Completed user and assistant turns are sent with follow-up requests so pronouns and comparisons work across turns. Conversation state remains in application memory while navigating between pages, but it is never added to `AppData`, synced, exported, or restored after a refresh.

- Ledger questions route to read-only ledger queries.
- Analysis requests route to report generation.
- Transaction-oriented messages route to draft candidates that require user confirmation.
- An inserted image is sent to the selected vision-capable session model as an OpenAI-compatible image input.

Transaction candidates appear as an editable batch. Valid candidates are selected by default; invalid candidates remain visible with their validation errors. No AI action writes financial data without explicit confirmation in the candidate UI.

OpenAI-compatible chat requests use SSE streaming. A provider that returns a non-SSE response for a streaming request produces an explicit compatibility error. Tool execution is limited to four consecutive rounds per message; reaching that boundary reports an error and asks the user to narrow the request.

## Provider configuration

AI connections are stored as a provider registry. Each provider has its own display name, OpenAI-compatible Base URL, API key, model collection, and default model. Models may also define a display name used by the chat model menu. Every saved provider is available in the chat model menu; the current provider and model determine the endpoint, credentials, and model used for a request.

Provider management is opened from the assistant model menu. It is intentionally not duplicated in the general settings page.

The provider manager supports adding and deleting providers, configuring multiple models per provider, selecting provider and model defaults, and overriding context or image capabilities per model. Changes remain local to the dialog until `保存配置` is selected. Legacy single-provider settings are normalized into one provider automatically.

`获取模型` requests `GET {Base URL}/models` with the provider API key. Returned model IDs can be searched and selectively imported; IDs already configured for the provider are excluded. Providers that do not implement the OpenAI-compatible models endpoint show the HTTP error in the selection dialog and continue to support manual model entry.

The model-level image capability switch controls whether image insertion is available for that model. Provider cards do not have a separate enable/disable state: remove an unused provider instead.
