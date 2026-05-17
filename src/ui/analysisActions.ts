import { createAiProvider } from "../ai/provider";
import type { AnalysisScope } from "../ai/context";
import type { AppData } from "../domain/types";

export function runAiAnalysis(options: {
  readonly data: AppData;
  readonly scope: AnalysisScope;
  readonly setAiText: (value: string) => void;
  readonly setAiError: (value: string) => void;
  readonly setPending: (value: boolean) => void;
}) {
  options.setPending(true);
  options.setAiError("");
  Promise.resolve()
    .then(() => createAiProvider(options.data.aiSettings).analyze(options.data, { scope: options.scope }))
    .then(options.setAiText)
    .catch((error: unknown) => options.setAiError(error instanceof Error ? error.message : "AI 分析失败"))
    .finally(() => options.setPending(false));
}
