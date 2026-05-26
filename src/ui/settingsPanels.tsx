import { addCurrency, deleteCurrency } from "../domain/operations";
import type { AiSettings, AppData, ThemeMode } from "../domain/types";
import { resolveAiModelCapabilities } from "../ai/modelCapabilities";
import { SelectField, TextField } from "./common";
import type { FormOption } from "./common";
import { DataVaultPanel } from "./DataVaultPanel";
import { DynamicTagList } from "./DynamicTagList";
import { Switch } from "./components";
import { SettingsSection } from "./settingsSection";

export function ThemePanel(props: { readonly theme: ThemeMode; readonly onChange: (theme: ThemeMode) => void }) {
  return (
    <SettingsSection title="主题">
      <div className="grid gap-4 lg:grid-cols-[minmax(18rem,32rem)]">
        <SelectField label="主题模式" value={props.theme} options={themeOptions()} onChange={(value) => props.onChange(value as ThemeMode)} />
      </div>
    </SettingsSection>
  );
}

export function AiSettingsPanel(props: { readonly settings?: AiSettings; readonly onChange: (settings: AiSettings) => void }) {
  const settings = normalizeAiSettings(props.settings ?? defaultAiSettings());
  const update = (patch: Partial<AiSettings>) => props.onChange({ ...settings, ...patch });
  const capabilities = resolveAiModelCapabilities(settings);
  return (
    <SettingsSection title="AI Provider">
      <div className="grid w-full max-w-5xl gap-4 lg:grid-cols-[repeat(2,minmax(18rem,1fr))]">
        <SelectField
          label="服务商"
          value={selectedAiProvider(settings.endpoint)}
          options={aiProviderOptions()}
          onChange={(provider) => updateAiProvider(provider, settings, update)}
        />
        <div className="lg:col-span-2">
          <TextField label="Base URL" value={settings.endpoint} onChange={(endpoint) => update({ endpoint })} />
        </div>
        <TextField label="模型" value={settings.model} onChange={(model) => updateModel(model, update)} />
        <TextField label="API Key" type="password" value={settings.apiKey} onChange={(apiKey) => update({ apiKey })} />
        <TextField
          label={`上下文预算 Token（当前 ${capabilities.contextBudget.inputTokens}）`}
          value={settings.contextTokenBudget ?? ""}
          placeholder="留空使用模型预设"
          onChange={(value) => update(contextBudgetPatch(value))}
        />
        <VisionSwitch settings={settings} update={update} />
      </div>
    </SettingsSection>
  );
}

function VisionSwitch(props: { readonly settings: AiSettings; readonly update: (patch: Partial<AiSettings>) => void }) {
  const capabilities = resolveAiModelCapabilities(props.settings);
  return (
    <label className="block">
      <span className="label">支持图片解析（当前 {capabilities.supportsVision ? "支持" : "不支持"}）</span>
      <div className="mt-2 flex h-9 items-center gap-3">
        <Switch checked={capabilities.supportsVision} onChange={(supportsVision) => props.update({ supportsVision })} />
        <button className="text-sm text-(--color-text-secondary)" type="button" onClick={() => props.update({ supportsVision: undefined })}>
          使用模型预设
        </button>
      </div>
    </label>
  );
}

export function CurrencyPanel(props: {
  readonly data: AppData;
  readonly setData: (data: AppData) => void;
  readonly setMessage: (value: string) => void;
}) {
  const save = (currency: string) => {
    try {
      props.setData(addCurrency(props.data, currency));
      props.setMessage("币种已添加");
    } catch (error) {
      props.setMessage(error instanceof Error ? error.message : "币种添加失败");
    }
  };
  const remove = (value: string) => {
    try {
      props.setData(deleteCurrency(props.data, value));
      props.setMessage("币种已删除");
    } catch (error) {
      props.setMessage(error instanceof Error ? error.message : "币种删除失败");
    }
  };
  return (
    <SettingsSection title="币种">
      <DynamicTagList values={props.data.currencies} addLabel="新增币种" placeholder="AUD" onAdd={save} onRemove={remove} />
    </SettingsSection>
  );
}

export function DataPanel(props: {
  readonly data: AppData;
  readonly token: import("../storage/indexedDb").SaveToken;
  readonly setData: (data: AppData | undefined) => void;
  readonly setMessage: (value: string) => void;
}) {
  return <DataVaultPanel {...props} />;
}

export function CatalogPanel({ data }: { readonly data: AppData }) {
  return (
    <SettingsSection title="基础数据">
      <div className="grid gap-4 text-sm text-(--color-text-secondary) sm:grid-cols-2 xl:grid-cols-4">
        <span>账户：{data.accounts.length}</span>
        <span>分类：{data.categories.length}</span>
        <span>标签：{data.tags.length}</span>
        <span>订阅规则：{data.recurringRules.length}</span>
      </div>
    </SettingsSection>
  );
}

function themeOptions(): readonly FormOption[] {
  return [
    { value: "system", label: "跟随系统" },
    { value: "light", label: "浅色" },
    { value: "dark", label: "深色" },
  ];
}

const AI_PROVIDER_PRESETS = [
  { value: "openai", label: "OpenAI", endpoint: "https://api.openai.com/v1" },
  { value: "vercel-ai-gateway", label: "Vercel AI Gateway", endpoint: "https://ai-gateway.vercel.sh/v1" },
  { value: "google-gemini", label: "Google Gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta/openai" },
  { value: "deepseek", label: "DeepSeek", endpoint: "https://api.deepseek.com/v1" },
  { value: "openrouter", label: "OpenRouter", endpoint: "https://openrouter.ai/api/v1" },
] as const;

function aiProviderOptions(): readonly FormOption[] {
  return [
    ...AI_PROVIDER_PRESETS.map((provider) => ({ value: provider.value, label: provider.label })),
    { value: "custom", label: "自定义" },
  ];
}

function selectedAiProvider(endpoint: string): string {
  const normalizedEndpoint = normalizeEndpoint(endpoint);
  const preset = AI_PROVIDER_PRESETS.find((provider) => normalizeEndpoint(provider.endpoint) === normalizedEndpoint);
  return preset?.value ?? "custom";
}

function updateAiProvider(provider: string, settings: AiSettings, update: (patch: Partial<AiSettings>) => void) {
  const preset = AI_PROVIDER_PRESETS.find((item) => item.value === provider);
  update(preset ? { endpoint: preset.endpoint } : { endpoint: settings.endpoint });
}

function updateModel(model: string, update: (patch: Partial<AiSettings>) => void) {
  update({ model, supportsVision: undefined });
}

function defaultAiSettings(): AiSettings {
  return { provider: "openai-compatible", endpoint: "https://api.openai.com/v1", model: "gpt-4.1-mini", apiKey: "" };
}

function normalizeAiSettings(settings: AiSettings): AiSettings {
  return { ...settings, endpoint: settings.endpoint.replace(/\/chat\/completions\/?$/, "") };
}

function normalizeEndpoint(endpoint: string): string {
  return endpoint.trim().replace(/\/+$/, "");
}

function contextBudgetPatch(value: string): Partial<AiSettings> {
  const trimmed = value.trim();
  if (!trimmed) return { contextTokenBudget: undefined };
  const contextTokenBudget = Number(trimmed);
  return { contextTokenBudget };
}
