import { createAiProvider } from "../ai/provider";
import type { AppData } from "../domain/types";

export function runAiAnalysis(data: AppData, setAiText: (value: string) => void, setAiError: (value: string) => void) {
  setAiError("");
  Promise.resolve()
    .then(() => createAiProvider(data.aiSettings).analyze(data))
    .then(setAiText)
    .catch((error: unknown) => setAiError(error instanceof Error ? error.message : "AI 分析失败"));
}
