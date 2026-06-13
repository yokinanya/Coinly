import type { AiModelSettings, AiSettings } from "../domain/types";

export const DEFAULT_AI_ENDPOINT = "https://api.openai.com/v1";
export const DEFAULT_TEXT_MODEL = "gpt-4.1-mini";
export const DEFAULT_VISION_MODEL = "gpt-4o-mini";

export interface NormalizedAiSettings extends AiSettings {
  readonly provider: "openai-compatible";
  readonly endpoint: string;
  readonly apiKey: string;
  readonly textModel: AiModelSettings;
  readonly visionModel: AiModelSettings;
}

export function defaultAiSettings(): NormalizedAiSettings {
  return normalizeAiSettings({
    provider: "openai-compatible",
    endpoint: DEFAULT_AI_ENDPOINT,
    apiKey: "",
    textModel: { model: DEFAULT_TEXT_MODEL },
    visionModel: { model: DEFAULT_VISION_MODEL },
  });
}

export function normalizeAiSettings(settings?: AiSettings): NormalizedAiSettings {
  const legacyModel = settings?.model?.trim() ?? DEFAULT_TEXT_MODEL;
  const legacyModelSettings = {
    model: legacyModel,
    contextTokenBudget: settings?.contextTokenBudget,
    supportsVision: settings?.supportsVision,
  } satisfies AiModelSettings;
  const textModel = normalizeModelSettings(settings?.textModel ?? legacyModelSettings);
  const visionModel = normalizeModelSettings(settings?.visionModel ?? legacyVisionModel(legacyModelSettings));

  return {
    ...settings,
    provider: "openai-compatible",
    endpoint: normalizeAiEndpoint(settings?.endpoint ?? DEFAULT_AI_ENDPOINT),
    apiKey: settings?.apiKey ?? "",
    textModel,
    visionModel,
    model: textModel.model,
    contextTokenBudget: textModel.contextTokenBudget,
    supportsVision: textModel.supportsVision,
  };
}

export function selectTextModel(settings: AiSettings): AiModelSettings {
  return normalizeAiSettings(settings).textModel;
}

export function selectVisionModel(settings: AiSettings): AiModelSettings {
  return normalizeAiSettings(settings).visionModel;
}

export function normalizeAiEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/chat\/completions\/?$/, "");
}

function legacyVisionModel(model: AiModelSettings): AiModelSettings {
  if (model.supportsVision) return model;
  return { model: DEFAULT_VISION_MODEL };
}

function normalizeModelSettings(settings: AiModelSettings): AiModelSettings {
  return {
    ...settings,
    model: settings.model.trim(),
  };
}