# AI Tools

Coinly uses local intent routing for the chat composer. The user does not choose a task mode.

Typing `@` in the composer opens the tool picker. `@问账`, `@记账`, `@分析`, and `@补全` explicitly override automatic routing for that message. A mention may appear at the beginning or after other text. Tool selection does not change write permissions: transaction and category/tag changes still require confirmation.

- Ledger questions route to read-only ledger queries.
- Analysis requests route to report generation.
- Transaction-oriented messages route to draft candidates that require user confirmation.
- Category and tag requests route to suggestion candidates that require user confirmation.
- An inserted image is sent to the selected vision-capable session model as an OpenAI-compatible image input.

No AI action writes financial data without an explicit user confirmation in the candidate UI.

## Provider configuration

AI connections are stored as a provider registry. Each provider has its own display name, OpenAI-compatible Base URL, API key, model collection, and default model. Models may also define a display name used by the chat model menu. Every saved provider is available in the chat model menu; the current provider and model determine the endpoint, credentials, and model used for a request.

Provider management is opened from the assistant model menu. It is intentionally not duplicated in the general settings page.

The provider manager supports adding and deleting providers, configuring multiple models per provider, selecting provider and model defaults, and overriding context or image capabilities per model. Changes remain local to the dialog until `保存配置` is selected. Legacy single-provider settings are normalized into one provider automatically.

`获取模型` requests `GET {Base URL}/models` with the provider API key. Returned model IDs can be searched and selectively imported; IDs already configured for the provider are excluded. Providers that do not implement the OpenAI-compatible models endpoint show the HTTP error in the selection dialog and continue to support manual model entry.

The model-level image capability switch controls whether image insertion is available for that model. Provider cards do not have a separate enable/disable state: remove an unused provider instead.
