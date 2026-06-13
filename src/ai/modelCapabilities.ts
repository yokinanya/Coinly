import type { AiModelSettings, AiSettings } from "../domain/types";
import { selectTextModel } from "./settings";

export interface AiContextBudget {
  readonly inputTokens: number;
  readonly source: "manual" | "preset" | "default";
}

export interface AiModelCapabilities {
  readonly contextBudget: AiContextBudget;
  readonly supportsVision: boolean;
  readonly visionSource: "manual" | "preset" | "default";
}

const DEFAULT_CONTEXT_TOKENS = 64_000;
const MIN_CONTEXT_TOKENS = 8_000;
const MAX_CONTEXT_TOKENS = 1_100_000;
const LARGE_CONTEXT_TOKENS = 1_000_000;
const OPENAI_LARGE_CONTEXT_TOKENS = 1_050_000;
const MIMO_CONTEXT_TOKENS = 1_048_576;
const MEDIUM_CONTEXT_TOKENS = 256_000;
const CLAUDE_CONTEXT_TOKENS = 200_000;
const OSS_CONTEXT_TOKENS = 131_072;
const STANDARD_CONTEXT_TOKENS = 128_000;

interface ModelPreset {
  readonly pattern: RegExp;
  readonly contextTokens: number;
  readonly supportsVision: boolean;
}

const MODEL_PRESETS: readonly ModelPreset[] = [
  preset(/gpt-5\.[45]/i, OPENAI_LARGE_CONTEXT_TOKENS, true),
  preset(/gpt-5/i, MEDIUM_CONTEXT_TOKENS, true),
  preset(/gpt-4o/i, STANDARD_CONTEXT_TOKENS, true),
  preset(/gpt-oss/i, OSS_CONTEXT_TOKENS, false),
  preset(/gemini-3/i, LARGE_CONTEXT_TOKENS, true),
  preset(/gemini-2\.5/i, LARGE_CONTEXT_TOKENS, true),
  preset(/(?:^|\/)mimo-v2\.5-pro$/i, MIMO_CONTEXT_TOKENS, false),
  preset(/(?:^|\/)mimo-v2-omni$/i, MIMO_CONTEXT_TOKENS, true),
  preset(/(?:^|\/)mimo-v2-pro$/i, MIMO_CONTEXT_TOKENS, false),
  preset(/(?:^|\/)mimo-v2-flash$/i, MIMO_CONTEXT_TOKENS, false),
  preset(/(?:^|\/)mimo-v2\.5$/i, MIMO_CONTEXT_TOKENS, true),
  preset(/grok-4\.(3|20)/i, MEDIUM_CONTEXT_TOKENS, true),
  preset(/grok-4/i, MEDIUM_CONTEXT_TOKENS, true),
  preset(/claude.*(sonnet|opus|haiku).*4/i, CLAUDE_CONTEXT_TOKENS, true),
  preset(/claude-4/i, CLAUDE_CONTEXT_TOKENS, true),
  preset(/qwen3[-_ ]?vl/i, MEDIUM_CONTEXT_TOKENS, true),
  preset(/qwen3/i, STANDARD_CONTEXT_TOKENS, false),
  preset(/kimi[-_ ]?k2/i, MEDIUM_CONTEXT_TOKENS, false),
  preset(/kimi[-_ ]?vl/i, STANDARD_CONTEXT_TOKENS, true),
  preset(/deepseek\/deepseek-v4-(flash|pro)/i, STANDARD_CONTEXT_TOKENS, false),
  preset(/deepseek-v4-(flash|pro)/i, STANDARD_CONTEXT_TOKENS, false),
  preset(/deepseek/i, STANDARD_CONTEXT_TOKENS, false),
  preset(/o3-mini/i, STANDARD_CONTEXT_TOKENS, false),
  preset(/o1/i, STANDARD_CONTEXT_TOKENS, false),
  preset(/vision/i, STANDARD_CONTEXT_TOKENS, true),
] as const;

export function resolveAiModelCapabilities(settings: AiSettings | AiModelSettings): AiModelCapabilities {
  const modelSettings = normalizeCapabilityInput(settings);
  return {
    contextBudget: resolveAiContextBudget(modelSettings),
    supportsVision: resolveVisionSupport(modelSettings),
    visionSource: visionSource(modelSettings),
  };
}

export function resolveAiContextBudget(settings: AiModelSettings): AiContextBudget {
  if (settings.contextTokenBudget !== undefined) {
    return { inputTokens: normalizeManualBudget(settings.contextTokenBudget), source: "manual" };
  }
  const preset = presetContextTokens(settings.model);
  if (preset) return { inputTokens: preset, source: "preset" };
  return { inputTokens: DEFAULT_CONTEXT_TOKENS, source: "default" };
}

function normalizeManualBudget(value: number): number {
  if (!Number.isInteger(value) || value < MIN_CONTEXT_TOKENS || value > MAX_CONTEXT_TOKENS) {
    throw new Error(`AI 上下文预算必须是 ${MIN_CONTEXT_TOKENS} 到 ${MAX_CONTEXT_TOKENS} 之间的整数`);
  }
  return value;
}

function presetContextTokens(model: string): number | undefined {
  return matchingPreset(model)?.contextTokens;
}

function resolveVisionSupport(settings: AiModelSettings): boolean {
  if (settings.supportsVision !== undefined) return settings.supportsVision;
  return matchingPreset(settings.model)?.supportsVision ?? false;
}

function visionSource(settings: AiModelSettings): AiModelCapabilities["visionSource"] {
  if (settings.supportsVision !== undefined) return "manual";
  if (matchingPreset(settings.model)) return "preset";
  return "default";
}

function normalizeCapabilityInput(settings: AiSettings | AiModelSettings): AiModelSettings {
  if ("endpoint" in settings || "apiKey" in settings || "textModel" in settings) {
    return selectTextModel(settings as AiSettings);
  }
  return settings;
}

function matchingPreset(model: string): ModelPreset | undefined {
  const normalized = model.trim();
  if (!normalized) return undefined;
  return MODEL_PRESETS.find((preset) => preset.pattern.test(normalized));
}

function preset(pattern: RegExp, contextTokens: number, supportsVision: boolean): ModelPreset {
  return { pattern, contextTokens, supportsVision };
}
